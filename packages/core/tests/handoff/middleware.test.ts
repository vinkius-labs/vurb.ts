/**
 * FHP — Tests: requireGatewayClearance middleware
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { requireGatewayClearance } from '../../src/handoff/middleware.js';
import { mintDelegationToken, HandoffAuthError } from '../../src/handoff/DelegationToken.js';

const SECRET = 'test-secret-32-chars-minimum-ok!';

/** Builds an MCP context with the delegation header. */
function makeCtx(token?: string): unknown {
    if (!token) return {};
    return {
        requestInfo: {
            headers: { 'x-vurb-delegation': token },
        },
    };
}

/** Builds a context with headers in flat/fallback format (plain HTTP). */
function makeFlatCtx(token?: string): unknown {
    if (!token) return {};
    return { headers: { 'x-vurb-delegation': token } };
}

describe('requireGatewayClearance — success paths', () => {
    it('should inject handoffScope, handoffTid and handoffState', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET, 'vurb-gateway', { userId: 'u-1' });
        const middleware = requireGatewayClearance(SECRET);
        const ctx = await middleware(makeCtx(token));

        expect(ctx.handoffScope).toBe('finance');
        expect(ctx.handoffTid).toBeDefined();
        expect(ctx.handoffState).toEqual({ userId: 'u-1' });
    });

    it('should include handoffTraceparent when present in the token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', undefined, undefined, '00-abc-def-01');
        const middleware = requireGatewayClearance(SECRET);
        const ctx = await middleware(makeCtx(token));

        expect(ctx.handoffTraceparent).toBe('00-abc-def-01');
    });

    it('should NOT include handoffTraceparent when absent from the token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const ctx = await middleware(makeCtx(token));

        expect('handoffTraceparent' in ctx).toBe(false);
    });

    it('should work with flat context (plain headers fallback)', async () => {
        const token = await mintDelegationToken('devops', 60, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const ctx = await middleware(makeFlatCtx(token));

        expect(ctx.handoffScope).toBe('devops');
    });

    it('should set handoffState to {} when the token has no state', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const ctx = await middleware(makeCtx(token));

        expect(ctx.handoffState).toEqual({});
    });
});

describe('requireGatewayClearance — failure paths', () => {
    it('should throw MISSING_DELEGATION_TOKEN when header is absent', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(makeCtx())).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });

    it('should throw MISSING_DELEGATION_TOKEN for null context', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(null)).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });

    it('should throw INVALID_SIGNATURE for a token signed with a wrong secret', async () => {
        const token = await mintDelegationToken('finance', 60, 'other-secret-32-chars-min-ok!!');
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(makeCtx(token))).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('should throw EXPIRED_DELEGATION_TOKEN for an expired token', async () => {
        const token = await mintDelegationToken('finance', -1, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(makeCtx(token))).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });

    it('should throw INVALID_DELEGATION_TOKEN for a malformed token', async () => {
        const middleware = requireGatewayClearance(SECRET);
        await expect(middleware(makeCtx('malformed-token'))).rejects.toMatchObject({ code: 'INVALID_DELEGATION_TOKEN' });
    });

    it('should re-throw HandoffAuthError directly', async () => {
        const token = await mintDelegationToken('finance', -1, SECRET);
        const middleware = requireGatewayClearance(SECRET);
        const err = await middleware(makeCtx(token)).catch(e => e);
        expect(err instanceof HandoffAuthError).toBe(true);
    });
});
