/**
 * FHP — Deep Tests: DelegationToken
 *
 * Security, Claim-Check edge cases, all claim properties,
 * idempotency, and format invariants.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import {
    mintDelegationToken,
    verifyDelegationToken,
    HandoffAuthError,
    type DelegationClaims,
} from '../../src/handoff/DelegationToken.js';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

const SECRET = 'test-secret-32-chars-minimum-ok!';

/**
 * A store implementing only the minimum interface: `set` + `getAndDelete`.
 * No `get` or `delete` methods — exercises the atomic fallback branch in
 * `verifyDelegationToken` and guarantees true one-shot under concurrency.
 */
function makeMinimalStore(): import('../../src/handoff/types.js').HandoffStateStore {
    const map = new Map<string, Record<string, unknown>>();
    return {
        set: async (id, state) => { map.set(id, state); },
        getAndDelete: async (id) => {
            const v = map.get(id);
            map.delete(id);
            return v;
        },
    };
}

// ============================================================================
// Claims — structure and fields
// ============================================================================

describe('Claims — structure', () => {
    it('should emit iss, sub, iat, exp, tid in the payload', async () => {
        const before = Math.floor(Date.now() / 1000);
        const token = await mintDelegationToken('finance', 120, SECRET, 'my-gateway');
        const after = Math.floor(Date.now() / 1000);

        const claims = await verifyDelegationToken(token, SECRET);

        expect(claims.iss).toBe('my-gateway');
        expect(claims.sub).toBe('finance');
        expect(claims.tid).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
        expect(claims.iat).toBeGreaterThanOrEqual(before);
        expect(claims.iat).toBeLessThanOrEqual(after);
        expect(claims.exp).toBe(claims.iat + 120);
    });

    it('iat should be a Unix timestamp in seconds (not milliseconds)', async () => {
        const token = await mintDelegationToken('x', 60, SECRET);
        const claims = await verifyDelegationToken(token, SECRET);
        // Timestamps in seconds have ~10 digits; in ms they would have 13
        expect(String(claims.iat)).toHaveLength(10);
    });

    it('tid should be unique on each issuance', async () => {
        const t1 = await mintDelegationToken('finance', 60, SECRET);
        const t2 = await mintDelegationToken('finance', 60, SECRET);
        const c1 = await verifyDelegationToken(t1, SECRET);
        const c2 = await verifyDelegationToken(t2, SECRET);
        expect(c1.tid).not.toBe(c2.tid);
    });

    it('should preserve traceparent in claims after roundtrip', async () => {
        const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', undefined, undefined, tp);
        const claims = await verifyDelegationToken(token, SECRET);
        expect(claims.traceparent).toBe(tp);
    });

    it('traceparent should be absent from claims when not provided', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const claims = await verifyDelegationToken(token, SECRET);
        expect(claims.traceparent).toBeUndefined();
    });

    it('default issuer should be "vurb-gateway"', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const claims = await verifyDelegationToken(token, SECRET);
        expect(claims.iss).toBe('vurb-gateway');
    });
});

// ============================================================================
// Security — HMAC and tampering
// ============================================================================

describe('Security — HMAC', () => {
    it('payload tampering should fail with INVALID_SIGNATURE', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const [payload, sig] = token.split('.');
        const evil = Buffer.from(payload!, 'base64url').toString('utf8').replace('finance', 'admin');
        const evilPayload = Buffer.from(evil).toString('base64url');
        await expect(
            verifyDelegationToken(`${evilPayload}.${sig}`, SECRET)
        ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('full signature replacement should fail', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const [payload] = token.split('.');
        const fakeSig = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        await expect(
            verifyDelegationToken(`${payload}.${fakeSig}`, SECRET)
        ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('tokens signed with different secrets should not be interchangeable', async () => {
        const t1 = await mintDelegationToken('finance', 60, 'secret-A-32-chars-padded-ok!!!!');
        await expect(
            verifyDelegationToken(t1, 'secret-B-32-chars-padded-ok!!!!')
        ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('an empty token should throw INVALID_DELEGATION_TOKEN', async () => {
        await expect(verifyDelegationToken('', SECRET)).rejects.toMatchObject({
            code: 'INVALID_DELEGATION_TOKEN',
        });
    });

    it('a single-segment token (no separator) should fail', async () => {
        await expect(verifyDelegationToken('aaabbbccc', SECRET)).rejects.toMatchObject({
            code: 'INVALID_DELEGATION_TOKEN',
        });
    });

    it('a token with a bad payload should throw INVALID_SIGNATURE (checked before decode)', async () => {
        const badPayload = Buffer.from('not-json').toString('base64url');
        const sig = 'fakesig';
        await expect(verifyDelegationToken(`${badPayload}.${sig}`, SECRET)).rejects.toMatchObject({
            code: 'INVALID_SIGNATURE',
        });
    });
});

// ============================================================================
// TTL and expiry
// ============================================================================

describe('TTL and expiry', () => {
    it('a token with TTL=-1 should always be expired', async () => {
        const token = await mintDelegationToken('finance', -1, SECRET);
        await expect(verifyDelegationToken(token, SECRET)).rejects.toMatchObject({
            code: 'EXPIRED_DELEGATION_TOKEN',
        });
    });

    it('EXPIRED_DELEGATION_TOKEN message should contain an ISO date', async () => {
        const token = await mintDelegationToken('finance', -10, SECRET);
        try {
            await verifyDelegationToken(token, SECRET);
            expect.fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(HandoffAuthError);
            const e = err as HandoffAuthError;
            expect(e.message).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO format
        }
    });

    it('a token with a long TTL should be valid well before expiry', async () => {
        const token = await mintDelegationToken('finance', 86400, SECRET); // 24 hours
        await expect(verifyDelegationToken(token, SECRET)).resolves.toBeDefined();
    });
});

// ============================================================================
// Claim-Check — large state (> 2 KB)
// ============================================================================

describe('Claim-Check — large state', () => {
    it('state exactly at the threshold (2048 bytes) should remain inline', async () => {
        // JSON.stringify({'data':'x'*2037}) = '{"data":"' (9) + 2037 + '"}' (2) = 2048
        const inline = { data: 'x'.repeat(2037) };
        const store = new InMemoryHandoffStateStore();
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', inline, store);
        const rawPayload = token.split('.')[0]!;
        const decoded = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as DelegationClaims;
        expect(decoded.state).toBeDefined();
        expect(decoded.state_id).toBeUndefined();
        expect(store.size).toBe(0); // not persisted
    });

    it('state above the threshold should use Claim-Check', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { data: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        expect(store.size).toBe(1); // persisted to the store
        const rawPayload = token.split('.')[0]!;
        const decoded = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as DelegationClaims;
        expect(decoded.state).toBeUndefined();
        expect(decoded.state_id).toBeDefined();
    });

    it('Claim-Check is one-shot: second verification is rejected (already deleted)', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { key: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        const first = await verifyDelegationToken(token, SECRET, store);
        expect(first.state?.key).toBeDefined();
        expect(store.size).toBe(0); // deleted after first retrieval

        // Second verification: state_id no longer in store → must be rejected.
        // Silently returning undefined state would grant the upstream an empty context
        // and allow a replay without the original carry-over data.
        await expect(
            verifyDelegationToken(token, SECRET, store)
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });

    it('should throw when state > 2 KB but no store provided', async () => {
        const bigState = { data: 'x'.repeat(3000) };
        await expect(
            mintDelegationToken('finance', 60, SECRET, 'gw', bigState)
        ).rejects.toThrow('no HandoffStateStore was provided');
    });

    it('state_id in token without a store at verify time should throw INVALID_DELEGATION_TOKEN', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { data: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);
        await expect(verifyDelegationToken(token, SECRET)).rejects.toMatchObject({
            code: 'INVALID_DELEGATION_TOKEN',
        });
    });

    it('missing state in store should be rejected (not silently return undefined state)', async () => {
        const store = new InMemoryHandoffStateStore();
        const bigState = { data: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);
        // Manually delete before verify (simulates TTL expiry or concurrent consumption)
        const stateId = (JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as DelegationClaims).state_id!;
        await store.getAndDelete(stateId);
        // The state_id is in the token but the state is gone — must reject rather
        // than silently return claims with no carry-over context.
        await expect(
            verifyDelegationToken(token, SECRET, store)
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });
});

// ============================================================================
// Claim-Check — minimal store (atomic path)
// ============================================================================

describe('Claim-Check — minimal store (atomic getAndDelete only)', () => {
    it('first verification with minimal store hydrates state correctly', async () => {
        const store = makeMinimalStore();
        const bigState = { key: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        const claims = await verifyDelegationToken(token, SECRET, store);
        expect(claims.state?.key).toBeDefined();
        expect((claims.state as { key: string }).key).toBe(bigState.key);
    });

    it('second verification with minimal store is rejected (atomic one-shot)', async () => {
        const store = makeMinimalStore();
        const bigState = { key: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        // First: succeeds
        await verifyDelegationToken(token, SECRET, store);

        // Second: must be rejected — getAndDelete already consumed the state
        await expect(
            verifyDelegationToken(token, SECRET, store)
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });

    it('missing state in minimal store (pre-deleted) is rejected', async () => {
        const store = makeMinimalStore();
        const bigState = { data: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        // Consume the state before verification (simulates TTL expiry or prior consumer)
        const stateId = (JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as DelegationClaims).state_id!;
        await store.getAndDelete(stateId);

        await expect(
            verifyDelegationToken(token, SECRET, store)
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });
});

// ============================================================================
// Claim-Check — concurrent verification (one-shot guarantee)
// ============================================================================

describe('Claim-Check — concurrent verification (one-shot guarantee)', () => {
    it('two simultaneous verifications with atomic store: exactly one succeeds, one is rejected', async () => {
        // The minimal store uses getAndDelete atomically (no separate get+delete).
        // In the two-phase path (InMemoryHandoffStateStore), two concurrent
        // get() calls both succeed before either delete() runs — that is correct
        // behaviour for the two-phase path (prevents data loss). The one-shot
        // guarantee under concurrency is provided by the atomic getAndDelete path.
        const store = makeMinimalStore();
        const bigState = { payload: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        // Fire both concurrently. The atomic getAndDelete path ensures only one
        // Promise gets the state — the other gets undefined → EXPIRED_DELEGATION_TOKEN.
        const [r1, r2] = await Promise.allSettled([
            verifyDelegationToken(token, SECRET, store),
            verifyDelegationToken(token, SECRET, store),
        ]);

        const succeeded = [r1, r2].filter(r => r.status === 'fulfilled');
        const rejected  = [r1, r2].filter(r => r.status === 'rejected');

        expect(succeeded).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
            code: 'EXPIRED_DELEGATION_TOKEN',
        });
    });

    it('two-phase store: documents that concurrent calls can both succeed (by design — prevents data loss)', async () => {
        // The two-phase get+delete path in InMemoryHandoffStateStore is intentional:
        // it prevents irrecoverable data loss if the process crashes between get and delete.
        // The trade-off is that under concurrent JS execution both get() calls run to
        // completion before either delete() runs, so both requests succeed.
        // This is the documented behaviour — consumers who need strict one-shot
        // concurrency must use an external store with native atomic getAndDelete
        // (e.g. Redis GETDEL, Cloudflare KV with metadata) or the minimal store interface.
        const store = new InMemoryHandoffStateStore();
        const bigState = { payload: 'x'.repeat(3000) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'gw', bigState, store);

        const [r1, r2] = await Promise.allSettled([
            verifyDelegationToken(token, SECRET, store),
            verifyDelegationToken(token, SECRET, store),
        ]);

        // Both succeed due to the two-phase interleaving — this is expected and documented.
        const succeeded = [r1, r2].filter(r => r.status === 'fulfilled');
        expect(succeeded).toHaveLength(2);

        // A third call (after both get+delete pairs complete) is correctly rejected.
        await expect(
            verifyDelegationToken(token, SECRET, store)
        ).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });
});

// ============================================================================
// Token format
// ============================================================================

describe('Token format', () => {
    it('should have exactly one dot separator', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const dots = token.split('').filter(c => c === '.').length;
        expect(dots).toBe(1);
    });

    it('payload and signature should be base64url (no +, /, =)', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const [payload, sig] = token.split('.');
        expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('the payload should be parseable as JSON', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const payload = token.split('.')[0]!;
        expect(() => JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))).not.toThrow();
    });
});
