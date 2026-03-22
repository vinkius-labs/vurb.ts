/**
 * Federated Handoff Protocol (FHP) — Core Barrel
 *
 * Exporta todas as primitivas FHP que pertencem ao `@vurb/core`:
 *
 * - **Tipos de dados**: `HandoffPayload`, `HandoffResponse`, `HandoffStateStore`
 * - **Guards e factories**: `isHandoffResponse`, `handoff`
 * - **Crypto**: `mintDelegationToken`, `verifyDelegationToken`, `DelegationClaims`, `HandoffAuthError`
 * - **Store**: `InMemoryHandoffStateStore`
 * - **Middleware zero-trust**: `requireGatewayClearance`, `GatewayClearanceContext`
 */

// ── Tipos de payload (definidos em response.ts, re-exportados aqui) ──────────
export type { HandoffPayload, HandoffResponse } from '../core/response.js';
export { isHandoffResponse, handoff } from '../core/response.js';

// ── HandoffStateStore (interface de domínio) ──────────────────────────────────
/** @see {@link HandoffStateStore} */
export type {
    /**
     * Pluggable persistence interface for the Claim-Check pattern.
     *
     * When `carryOverState` exceeds 2 KB, the SwarmGateway persists
     * it under a UUID key and embeds only the key inside the HMAC token,
     * keeping HTTP headers within safe limits (< 8 KB nginx/ALB limit).
     *
     * Default implementation: {@link InMemoryHandoffStateStore}.
     * Platform adapters: implement this interface (e.g. `@vurb/cloudflare`).
     */
    HandoffStateStore,
} from './types.js';

// ── Store padrão ─────────────────────────────────────────────────────────────
export { InMemoryHandoffStateStore } from './HandoffStateStore.js';

// ── Delegation Token (mint/verify, HMAC-SHA256 puro) ─────────────────────────
export {
    mintDelegationToken,
    verifyDelegationToken,
    HandoffAuthError,
} from './DelegationToken.js';
export type { DelegationClaims } from './DelegationToken.js';

// ── Middleware zero-trust (para micro-servidores upstream) ───────────────────
export { requireGatewayClearance } from './middleware.js';
export type { GatewayClearanceContext } from './middleware.js';
