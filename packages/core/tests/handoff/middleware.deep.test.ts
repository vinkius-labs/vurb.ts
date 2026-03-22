/**
 * FHP — Deep Tests: requireGatewayClearance (middleware)
 *
 * Covers all header extraction paths (MCP SDK, flat headers),
 * correct context injection, and all HandoffAuthError codes.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { requireGatewayClearance } from '../../src/handoff/middleware.js';
import { mintDelegationToken, HandoffAuthError } from '../../src/handoff/DelegationToken.js';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

const SECRET = 'test-secret-32-chars-minimum-ok!';

function mcpContext(token: string) {
    return {
        requestInfo: {
            headers: { 'x-vurb-delegation': token },
        },
    };
}

function plainHeaderContext(token: string) {
    return { headers: { 'x-vurb-delegation': token } };
}

// ============================================================================
// Header extraction — all supported formats
// ============================================================================

describe('extractDelegationHeader — context formats', () => {
    it('should extract the token from the MCP SDK path (requestInfo.headers)', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const result = await middleware(mcpContext(token));
        expect(result.handoffScope).toBe('finance');
    });

    it('should extract the token from the flat path (ctx.headers)', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const result = await middleware(plainHeaderContext(token));
        expect(result.handoffScope).toBe('finance');
    });

    it('should throw MISSING_DELEGATION_TOKEN when ctx is null', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(null)).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });

    it('should throw MISSING_DELEGATION_TOKEN when ctx is a string', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware('string-context')).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });

    it('should throw MISSING_DELEGATION_TOKEN when header is absent', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware({ requestInfo: { headers: {} } })).rejects.toMatchObject({
            code: 'MISSING_DELEGATION_TOKEN',
        });
    });

    it('should throw MISSING_DELEGATION_TOKEN when header is a number (not a string)', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware({ headers: { 'x-vurb-delegation': 42 } })).rejects.toMatchObject({
            code: 'MISSING_DELEGATION_TOKEN',
        });
    });

    it('should throw MISSING_DELEGATION_TOKEN when ctx is an empty object', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware({})).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });
});

// ============================================================================
// Context injection — all fields
// ============================================================================

describe('Context injection', () => {
    it('should inject an empty handoffState when no carryOverState was set', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect(result.handoffState).toEqual({});
    });

    it('should inject the correct handoffState', async () => {
        const state = { userId: 'u-99', plan: 'pro' };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', state);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect(result.handoffState).toEqual(state);
    });

    it('should inject handoffScope correctly', async () => {
        const token = await mintDelegationToken('devops', 60, SECRET);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect(result.handoffScope).toBe('devops');
    });

    it('should inject handoffTid as a valid UUID', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect(result.handoffTid).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should inject handoffTraceparent when present in the token', async () => {
        const tp = '00-aabbcc-ddeeff-01';
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', undefined, undefined, tp);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect(result.handoffTraceparent).toBe(tp);
    });

    it('handoffTraceparent should be absent (not undefined string) when not in the token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const result = await requireGatewayClearance(SECRET)(mcpContext(token));
        expect('handoffTraceparent' in result).toBe(false);
    });
});

// ============================================================================
// Authentication errors
// ============================================================================

describe('Authentication errors', () => {
    it('an expired token should throw HandoffAuthError with EXPIRED code', async () => {
        const token = await mintDelegationToken('finance', -5, SECRET);
        await expect(requireGatewayClearance(SECRET)(mcpContext(token))).rejects.toMatchObject({
            code: 'EXPIRED_DELEGATION_TOKEN',
        });
    });

    it('a token with the wrong secret should throw INVALID_SIGNATURE', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        await expect(requireGatewayClearance('wrong-secret')(mcpContext(token))).rejects.toMatchObject({
            code: 'INVALID_SIGNATURE',
        });
    });

    it('a tampered token should throw INVALID_SIGNATURE', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const tampered = token.slice(0, -3) + 'ZZZ';
        await expect(requireGatewayClearance(SECRET)(mcpContext(tampered))).rejects.toMatchObject({
            code: 'INVALID_SIGNATURE',
        });
    });

    it('errors should be instanceof HandoffAuthError', async () => {
        await expect(requireGatewayClearance(SECRET)({})).rejects.toBeInstanceOf(HandoffAuthError);
    });

    it('each factory invocation creates an independent middleware', async () => {
        const mw1 = requireGatewayClearance(SECRET);
        const mw2 = requireGatewayClearance('other-secret-32-chars-padded!!!!');
        const token = await mintDelegationToken('finance', 60, SECRET);

        await expect(mw1(mcpContext(token))).resolves.toBeDefined();
        await expect(mw2(mcpContext(token))).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });
});

// ============================================================================
// Claim-Check via middleware
// ============================================================================

describe('Claim-Check via middleware', () => {
    it('should hydrate large state from the store in the middleware', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { report: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        const result = await requireGatewayClearance(SECRET, store)(mcpContext(token));
        expect(result.handoffState.report).toBeDefined();
        expect(typeof result.handoffState.report).toBe('string');
    });

    it('should throw INVALID_DELEGATION_TOKEN if state_id present but no store given to middleware', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { report: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        // Middleware without store
        await expect(requireGatewayClearance(SECRET)(mcpContext(token))).rejects.toMatchObject({
            code: 'INVALID_DELEGATION_TOKEN',
        });
    });
});
