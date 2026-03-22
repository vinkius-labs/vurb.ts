/**
 * Federated Handoff Protocol (FHP) — HandoffStateStore
 *
 * Interface e implementação padrão para o padrão Claim-Check.
 * Extender com adaptadores de plataforma (ex: `@vurb/cloudflare`).
 *
 * @module
 */
import type { HandoffStateStore } from './index.js';

interface StoreEntry {
    state: Record<string, unknown>;
    expiresAt: number;
}

/**
 * In-memory implementation of {@link HandoffStateStore}.
 *
 * **Default for Node.js stateful processes.**
 * Not suitable for edge/serverless where each request runs in a fresh isolate.
 * For those environments, implement `HandoffStateStore` using your platform's
 * KV store (e.g. Cloudflare KV via `@vurb/cloudflare`).
 *
 * TTL is enforced lazily on `getAndDelete` — no background timers or
 * memory leaks from expired entries that are never retrieved.
 *
 * @example
 * ```typescript
 * import { SwarmGateway } from '@vurb/swarm';
 * import { InMemoryHandoffStateStore } from '@vurb/core';
 *
 * const gateway = new SwarmGateway({
 *     registry: { finance: 'http://finance-agent:8081' },
 *     delegationSecret: process.env.VURB_DELEGATION_SECRET!,
 *     stateStore: new InMemoryHandoffStateStore(),
 * });
 * ```
 */
export class InMemoryHandoffStateStore implements HandoffStateStore {
    private readonly _store = new Map<string, StoreEntry>();

    async set(stateId: string, state: Record<string, unknown>, ttlSeconds: number): Promise<void> {
        this._store.set(stateId, {
            state,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    async getAndDelete(stateId: string): Promise<Record<string, unknown> | undefined> {
        const entry = this._store.get(stateId);
        if (!entry) return undefined;

        // Check TTL BEFORE deleting: if an entry is expired it was never valid for use,
        // so we clean it up and return undefined. Lazy cleanup — no background timer needed.
        if (Date.now() > entry.expiresAt) {
            this._store.delete(stateId); // lazy TTL cleanup — no background timer
            return undefined;
        }

        this._store.delete(stateId);
        return entry.state;
    }

    /**
     * Read without deleting (non-atomic, use for two-phase pattern).
     * Falls back gracefully if the stateId has expired.
     *
     * Expired entries are pruned on access (lazy TTL cleanup),
     * consistent with `getAndDelete`. Without this, expired entries would accumulate
     * in the Map indefinitely if `get()` was called but the data was already expired
     * (e.g. a slow upstream that delayed token verification past the TTL window).
     */
    async get(stateId: string): Promise<Record<string, unknown> | undefined> {
        const entry = this._store.get(stateId);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(stateId); // lazy TTL cleanup — consistent with getAndDelete
            return undefined;
        }
        return entry.state;
    }

    /** delete without reading. No-op if the key does not exist. */
    async delete(stateId: string): Promise<void> {
        this._store.delete(stateId);
    }

    /** Current number of entries in the store (useful for testing). */
    get size(): number {
        return this._store.size;
    }
}
