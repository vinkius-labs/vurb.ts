/**
 * Federated Handoff Protocol — Tipos de domínio do handoff/
 *
 * `HandoffStateStore` vive aqui (interface de domínio pura).
 * `HandoffPayload` e `HandoffResponse` vivem em `../core/response.ts`
 * para permitir que o `ServerAttachment` as use sem dep em `@vurb/swarm`.
 */

/**
 * Pluggable persistence interface for the Claim-Check pattern.
 *
 * When `carryOverState` exceeds 2 KB, the SwarmGateway persists
 * it under a UUID key and embeds only the key inside the HMAC token,
 * keeping HTTP headers within safe limits (< 8 KB nginx/ALB limit).
 *
 * Default implementation: {@link InMemoryHandoffStateStore} (same package).
 * Platform adapters: implement this interface (e.g. `@vurb/cloudflare`).
 */
export interface HandoffStateStore {
    /**
     * Persist a state object under `stateId` with a TTL.
     * @param stateId    - UUID key
     * @param state      - Arbitrary carry-over state
     * @param ttlSeconds - Expiry in seconds
     */
    set(stateId: string, state: Record<string, unknown>, ttlSeconds: number): Promise<void>;
    /**
     * Retrieve and atomically delete the state (one-shot).
     * Prevents state leaks after successful handoff hydration.
     * Returns `undefined` if the key does not exist or has expired.
     */
    getAndDelete(stateId: string): Promise<Record<string, unknown> | undefined>;
    /**
     * Read the state without deleting it.
     *
     *  (optional method): allows the two-phase read-then-delete pattern
     * so that `verifyDelegationToken` can read the state into memory before
     * deleting it. This prevents irrecoverable data loss if an error occurs
     * between the read and the return of the claims to the caller.
     *
     * Falls back to `getAndDelete` if not implemented (old implementations).
     */
    get?(stateId: string): Promise<Record<string, unknown> | undefined>;
    /**
     * Delete the state without reading it.
     *
     * Used in the two-phase read-then-delete pattern (see `get` above).
     * Falls back to a no-op if not implemented.
     */
    delete?(stateId: string): Promise<void>;
}
