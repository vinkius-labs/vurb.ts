/**
 * FHP — Tests: DelegationToken (mint + verify)
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { mintDelegationToken, verifyDelegationToken, HandoffAuthError } from '../../src/handoff/DelegationToken.js';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

const SECRET = 'test-secret-32-chars-minimum-ok!';

describe('mintDelegationToken + verifyDelegationToken — roundtrip', () => {
    it('should create and verify a valid token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const claims = await verifyDelegationToken(token, SECRET);

        expect(claims.sub).toBe('finance');
        expect(claims.iss).toBe('vurb-gateway');
        expect(claims.tid).toBeDefined();
    });

    it('should preserve inline carryOverState (< 2 KB)', async () => {
        const state = { userId: 'u-1', plan: 'enterprise' };
        const token = await mintDelegationToken('finance', 60, SECRET, 'vurb-gateway', state);
        const claims = await verifyDelegationToken(token, SECRET);

        expect(claims.state).toEqual(state);
    });

    it('should include traceparent in the claims', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET, 'vurb-gateway', undefined, undefined, '00-abc-def-01');
        const claims = await verifyDelegationToken(token, SECRET);

        expect(claims.traceparent).toBe('00-abc-def-01');
    });

    it('should use Claim-Check when state exceeds 2 KB', async () => {
        const store = new InMemoryHandoffStateStore();
        const largeState = { data: 'x'.repeat(2500) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'vurb-gateway', largeState, store);

        // token must not contain the state inline
        const rawPayload = token.split('.')[0]!;
        const decoded = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
        expect(decoded.state).toBeUndefined();
        expect(decoded.state_id).toBeDefined();

        // verify must hydrate the state from the store
        const claims = await verifyDelegationToken(token, SECRET, store);
        expect(claims.state?.data).toBe('x'.repeat(2500));
    });

    it('should throw EXPIRED_DELEGATION_TOKEN for an expired token', async () => {
        const token = await mintDelegationToken('finance', -1, SECRET); // negative TTL
        await expect(verifyDelegationToken(token, SECRET)).rejects.toThrow(HandoffAuthError);
        await expect(verifyDelegationToken(token, SECRET)).rejects.toMatchObject({ code: 'EXPIRED_DELEGATION_TOKEN' });
    });

    it('should throw INVALID_SIGNATURE for a tampered token', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        const tampered = token.slice(0, -4) + 'XXXX'; // tamper the signature
        await expect(verifyDelegationToken(tampered, SECRET)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });

    it('should throw INVALID_DELEGATION_TOKEN for a malformed token', async () => {
        await expect(verifyDelegationToken('not-a-token', SECRET)).rejects.toMatchObject({ code: 'INVALID_DELEGATION_TOKEN' });
    });

    it('should throw INVALID_DELEGATION_TOKEN if state_id is present but no store is given', async () => {
        const store = new InMemoryHandoffStateStore();
        const largeState = { data: 'x'.repeat(2500) };
        const token = await mintDelegationToken('finance', 60, SECRET, 'vurb-gateway', largeState, store);

        // verify without store → must fail
        await expect(verifyDelegationToken(token, SECRET)).rejects.toMatchObject({ code: 'INVALID_DELEGATION_TOKEN' });
    });

    it('different scopes should produce distinct tokens', async () => {
        const t1 = await mintDelegationToken('finance', 60, SECRET);
        const t2 = await mintDelegationToken('devops', 60, SECRET);
        expect(t1).not.toBe(t2);
    });

    it('wrong secret should throw INVALID_SIGNATURE', async () => {
        const token = await mintDelegationToken('finance', 60, SECRET);
        await expect(verifyDelegationToken(token, 'wrong-secret')).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    });
});

describe('HandoffAuthError', () => {
    it('should have name="HandoffAuthError"', () => {
        const err = new HandoffAuthError('INVALID_SIGNATURE', 'bad sig');
        expect(err.name).toBe('HandoffAuthError');
        expect(err.code).toBe('INVALID_SIGNATURE');
        expect(err.message).toBe('bad sig');
        expect(err instanceof Error).toBe(true);
    });
});

describe('BUG-FHP-1 regression — minimal store (only set + getAndDelete)', () => {
    it('verifyDelegationToken should not crash when store has no get/delete methods', async () => {
        // Simulate a third-party store that implements only the minimum interface.
        // Calling store.get() or store.delete() on this would throw "not a function".
        const backingMap = new Map<string, Record<string, unknown>>();
        const minimalStore = {
            async set(id: string, state: Record<string, unknown>) {
                backingMap.set(id, state);
            },
            async getAndDelete(id: string): Promise<Record<string, unknown> | undefined> {
                const v = backingMap.get(id);
                backingMap.delete(id);
                return v;
            },
        };

        const largeState = { data: 'x'.repeat(2500) };
        // mintDelegationToken uses InMemoryHandoffStateStore-compatible interface OK
        const token = await mintDelegationToken(
            'finance', 60, SECRET, 'vurb-gateway', largeState, minimalStore as any,
        );

        // BUG-FHP-1: this would crash with "store.get is not a function" before the fix
        const claims = await verifyDelegationToken(token, SECRET, minimalStore as any);
        expect(claims.state?.data).toBe('x'.repeat(2500));
        // State should be deleted from the store after verification
        expect(backingMap.size).toBe(0);
    });
});
