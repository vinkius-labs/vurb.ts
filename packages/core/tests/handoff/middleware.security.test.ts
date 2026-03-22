/**
 * FHP — Expert Security Tests: requireGatewayClearance (middleware)
 *
 * Adversarial tests at the authentication boundary.
 *
 * Attack surfaces:
 * - Header smuggling (case variations, multiple header formats)
 * - Context prototype pollution
 * - Concurrent auth with mixed valid/invalid tokens
 * - Token reuse after expiry
 * - Header injection via unusual context shapes
 * - Claim values that could cause downstream confusion
 * - Middleware isolation under parallel calls
 * - Latency / timing-safe verification (no early exit on hit)
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { requireGatewayClearance } from '../../src/handoff/middleware.js';
import { mintDelegationToken, HandoffAuthError } from '../../src/handoff/DelegationToken.js';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

const SECRET   = 'test-secret-32-chars-minimum-ok!';
const SECRET_B = 'other-secret-32-chars-minimum-b!';

// ============================================================================
// Header extraction — adversarial context shapes
// ============================================================================

describe('SECURITY: Header extraction — adversarial shapes', () => {
    it('header with wrong case (X-VURB-DELEGATION) should be handled gracefully', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);
        // HTTP headers are case-insensitive; the implementation may or may not handle this
        // The test documents the actual behaviour
        const ctx = { requestInfo: { headers: { 'X-VURB-DELEGATION': token } } };
        const result = await mw(ctx).catch((e: HandoffAuthError) => e);
        // Either succeeds (case-insensitive handling) or throws MISSING_DELEGATION_TOKEN
        if (result instanceof HandoffAuthError) {
            expect(result.code).toBe('MISSING_DELEGATION_TOKEN');
        } else {
            expect(result.handoffScope).toBe('finance');
        }
    });

    it('header value with leading/trailing whitespace should be rejected or handled', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);
        // Token with surrounding spaces
        const ctx = { headers: { 'x-vurb-delegation': `  ${token}  ` } };
        const result = await mw(ctx).catch((e: HandoffAuthError) => e);
        // Either trims and succeeds, or fails with INVALID_SIGNATURE/INVALID_DELEGATION_TOKEN
        if (result instanceof HandoffAuthError) {
            expect(['INVALID_SIGNATURE', 'INVALID_DELEGATION_TOKEN']).toContain(result.code);
        } else {
            expect(result.handoffScope).toBe('finance');
        }
    });

    it('context with both requestInfo.headers and headers uses the correct one', async () => {
        const tokenA = await mintDelegationToken('scope-a', 60, SECRET);
        const tokenB = await mintDelegationToken('scope-b', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);

        // Both paths present with different tokens
        const ctx = {
            requestInfo: { headers: { 'x-vurb-delegation': tokenA } },
            headers: { 'x-vurb-delegation': tokenB },
        };
        const result = await mw(ctx);
        // MCP SDK path (requestInfo.headers) should take priority
        expect(result.handoffScope).toBe('scope-a');
    });

    it('array-valued header (common in Express) should not crash', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);
        // Some frameworks give arrays for multi-value headers
        const ctx = { headers: { 'x-vurb-delegation': [token, 'second-value'] } };
        const result = await mw(ctx).catch((e: HandoffAuthError) => e);
        // Should either take the first value or throw MISSING/INVALID
        if (result instanceof HandoffAuthError) {
            expect(['MISSING_DELEGATION_TOKEN', 'INVALID_DELEGATION_TOKEN', 'INVALID_SIGNATURE']).toContain(result.code);
        }
    });

    it('prototype pollution via __proto__ in context should not affect extraction', async () => {
        const mw = requireGatewayClearance(SECRET);
        // Simulate a prototype-polluted context object
        const ctx = Object.create({ 'x-vurb-delegation': 'polluted' });
        ctx.requestInfo = { headers: {} };
        await expect(mw(ctx)).rejects.toMatchObject({ code: 'MISSING_DELEGATION_TOKEN' });
    });

    it('context with null headers object should throw MISSING_DELEGATION_TOKEN', async () => {
        const mw = requireGatewayClearance(SECRET);
        await expect(mw({ requestInfo: { headers: null } })).rejects.toMatchObject({
            code: 'MISSING_DELEGATION_TOKEN',
        });
    });
});

// ============================================================================
// CONCURRENCY: Mixed valid/invalid tokens
// ============================================================================

describe('CONCURRENCY: Mixed valid/invalid parallel verification', () => {
    it('50% valid + 50% invalid tokens concurrently — each resolves correctly', async () => {
        const validToken = await mintDelegationToken('finance', 60, SECRET);
        const expiredToken = await mintDelegationToken('finance', -1, SECRET);
        const mw = requireGatewayClearance(SECRET);

        const calls = Array.from({ length: 40 }, (_, i) =>
            i % 2 === 0
                ? mw({ headers: { 'x-vurb-delegation': validToken } }).then(() => 'ok')
                : mw({ headers: { 'x-vurb-delegation': expiredToken } }).catch((e: HandoffAuthError) => e.code)
        );

        const results = await Promise.all(calls);
        const oks = results.filter(r => r === 'ok');
        const expireds = results.filter(r => r === 'EXPIRED_DELEGATION_TOKEN');

        expect(oks).toHaveLength(20);
        expect(expireds).toHaveLength(20);
    });

    it('the same middleware instance should not bleed state between concurrent calls', async () => {
        const tokens = await Promise.all([
            mintDelegationToken('scope-1', 60, SECRET, 'gw', { owner: 'alice' }),
            mintDelegationToken('scope-2', 60, SECRET, 'gw', { owner: 'bob' }),
            mintDelegationToken('scope-3', 60, SECRET, 'gw', { owner: 'charlie' }),
        ]);

        const mw = requireGatewayClearance(SECRET);

        // Verify all three concurrently with the same middleware instance
        const [r1, r2, r3] = await Promise.all(
            tokens.map(t => mw({ headers: { 'x-vurb-delegation': t } }))
        );

        expect(r1!.handoffScope).toBe('scope-1');
        expect((r1!.handoffState as { owner: string }).owner).toBe('alice');
        expect(r2!.handoffScope).toBe('scope-2');
        expect((r2!.handoffState as { owner: string }).owner).toBe('bob');
        expect(r3!.handoffScope).toBe('scope-3');
        expect((r3!.handoffState as { owner: string }).owner).toBe('charlie');
    });

    it('100 sequential calls on the same valid token should all succeed', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);

        let failures = 0;
        for (let i = 0; i < 100; i++) {
            try {
                await mw({ headers: { 'x-vurb-delegation': token } });
            } catch {
                failures++;
            }
        }
        expect(failures).toBe(0);
    });
});

// ============================================================================
// Token replay — reuse after expiry
// ============================================================================

describe('SECURITY: Token replay attacks', () => {
    it('a valid token used after TTL expiry should fail on the next request', async () => {
        vi.useFakeTimers();
        const token = await mintDelegationToken('finance', 30, SECRET); // 30s TTL

        vi.advanceTimersByTime(31_000); // advance 31 seconds

        const mw = requireGatewayClearance(SECRET);
        await expect(
            mw({ headers: { 'x-vurb-delegation': token } })
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });

        vi.useRealTimers();
    });

    it('a Claim-Check token replayed a second time is rejected (store deleted = one-shot)', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { secret: 'sensitive', data: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);
        const mw = requireGatewayClearance(SECRET, store);

        // First use: state is hydrated correctly
        const first = await mw({ headers: { 'x-vurb-delegation': token } });
        expect((first.handoffState as { secret: string }).secret).toBe('sensitive');

        // Second use: state_id no longer in store (one-shot = already deleted).
        // A replay must be rejected — returning empty state would silently grant access
        // without the carry-over context the upstream expects.
        await expect(
            mw({ headers: { 'x-vurb-delegation': token } })
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });
});

// ============================================================================
// Gateway isolation — wrong secret
// ============================================================================

describe('SECURITY: Gateway isolation — cross-gateway token confusion', () => {
    it('a token from gateway A cannot be used on gateway B (different secrets)', async () => {
        const tokenA = await mintDelegationToken('finance', 60, SECRET);
        const mwB = requireGatewayClearance(SECRET_B);

        await expect(
            mwB({ headers: { 'x-vurb-delegation': tokenA } })
        ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('INVALID_SIGNATURE error from cross-gateway attack does not reveal which part failed', async () => {
        const tokenA = await mintDelegationToken('finance', 60, SECRET);
        const mwB = requireGatewayClearance(SECRET_B);

        const err = await mwB({ headers: { 'x-vurb-delegation': tokenA } }).catch(e => e);
        expect(err).toBeInstanceOf(HandoffAuthError);
        // The message should be generic — not reveal internal details
        expect((err as HandoffAuthError).message).not.toContain(SECRET);
        expect((err as HandoffAuthError).message).not.toContain(SECRET_B);
    });
});

// ============================================================================
// Context output — injected fields contract
// ============================================================================

describe('SECURITY: Context output — field isolation contract', () => {
    it('context output should never contain the raw token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', { data: 'private' });
        const mw = requireGatewayClearance(SECRET);
        const result = await mw({ headers: { 'x-vurb-delegation': token } });

        // Walk all string values in the result
        const allValues = JSON.stringify(result);
        expect(allValues).not.toContain(token);
    });

    it('context output should never contain the secret', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const mw = requireGatewayClearance(SECRET);
        const result = await mw({ headers: { 'x-vurb-delegation': token } });

        const allValues = JSON.stringify(result);
        expect(allValues).not.toContain(SECRET);
    });

    it('handoffState should be exactly the carryOverState object (no extra fields)', async () => {
        const state = { userId: 'u-1', plan: 'pro' };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', state);
        const mw = requireGatewayClearance(SECRET);
        const result = await mw({ headers: { 'x-vurb-delegation': token } });

        expect(result.handoffState).toEqual(state);
        expect(Object.keys(result.handoffState ?? {})).toHaveLength(2);
    });
});
