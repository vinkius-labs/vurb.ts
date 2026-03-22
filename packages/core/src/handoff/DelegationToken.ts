/**
 * Federated Handoff Protocol — Delegation Token
 *
 * HMAC-SHA256 token for zero-trust delegation between gateway and
 * upstream micro-servers. Uses Node.js native `crypto` — no external deps.
 *
 * Claim-Check Pattern: if `carryOverState` exceeds 2 KB, the state is
 * persisted in a {@link HandoffStateStore} and only the `state_id` UUID
 * is embedded in the token, keeping HTTP headers within safe limits.
 *
 * @module
 */
import { createHmac, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import type { HandoffStateStore } from './index.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum bytes allowed inline in the token before Claim-Check kicks in. */
const CLAIM_CHECK_THRESHOLD_BYTES = 2048;

/** Separator between the base64url token body and the HMAC signature. */
const TOKEN_SEP = '.';

// ============================================================================
// Claims
// ============================================================================

/**
 * JWT-inspired claims embedded in the delegation token.
 *
 * @property iss         - Issuer URL (usually the gateway origin)
 * @property sub         - Scope identifier (e.g. `'finance_scope'`)
 * @property iat         - Issued-at Unix timestamp (seconds)
 * @property exp         - Expiry Unix timestamp (seconds)
 * @property tid         - Unique transaction ID for distributed tracing
 * @property state       - Inline carry-over state (< 2 KB)
 * @property state_id    - Claim-Check reference when state was externalized
 * @property traceparent - W3C Trace Context header for distributed tracing
 */
export interface DelegationClaims {
    iss: string;
    sub: string;
    iat: number;
    exp: number;
    tid: string;
    state?: Record<string, unknown>;
    state_id?: string;
    traceparent?: string;
}

// ============================================================================
// Errors
// ============================================================================

/** Thrown by {@link verifyDelegationToken} on invalid or expired tokens. */
export class HandoffAuthError extends Error {
    constructor(
        public readonly code:
            | 'MISSING_DELEGATION_TOKEN'
            | 'INVALID_DELEGATION_TOKEN'
            | 'EXPIRED_DELEGATION_TOKEN'
            | 'INVALID_SIGNATURE',
        message: string,
    ) {
        super(message);
        this.name = 'HandoffAuthError';
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

function encodePayload(claims: DelegationClaims): string {
    return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

function decodePayload(encoded: string): DelegationClaims {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DelegationClaims;
}

function sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

function byteLength(obj: unknown): number {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 *
 * Uses Node.js native `crypto.timingSafeEqual` instead of a manual loop.
 * V8's JIT can optimise a manual loop and leak the signature length via timing
 * when the two strings have different lengths.
 *
 * `crypto.timingSafeEqual` requires equal-length Buffers, so we check lengths
 * first (leaking that the lengths differ, but NOT the expected length).
 */
function timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    // Length mismatch exits early — this only leaks "they differ", not which is longer.
    if (bufA.length !== bufB.length) return false;
    return cryptoTimingSafeEqual(bufA, bufB);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Mint a signed HMAC-SHA256 delegation token.
 *
 * If `carryOverState` exceeds 2 KB, the state is persisted in `store`
 * and only the resulting `state_id` UUID is embedded in the token.
 *
 * @param scope          - Scope identifier (e.g. `'finance'`)
 * @param ttlSeconds     - Token lifetime in seconds
 * @param secret         - HMAC signing secret (minimum 32 chars recommended)
 * @param issuer         - Issuer identifier (gateway URL or name)
 * @param carryOverState - Optional semantic context to carry to the upstream
 * @param store          - Required when `carryOverState` may exceed 2 KB
 * @param traceparent    - W3C traceparent for distributed tracing
 * @returns Signed token string: `base64url(claims).base64url(sig)`
 */
export async function mintDelegationToken(
    scope: string,
    ttlSeconds: number,
    secret: string,
    issuer = 'vurb-gateway',
    carryOverState?: Record<string, unknown>,
    store?: HandoffStateStore,
    traceparent?: string,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: DelegationClaims = {
        iss: issuer,
        sub: scope,
        iat: now,
        exp: now + ttlSeconds,
        tid: randomUUID(),
    };

    if (traceparent) {
        claims.traceparent = traceparent;
    }

    if (carryOverState !== undefined) {
        if (byteLength(carryOverState) > CLAIM_CHECK_THRESHOLD_BYTES) {
            if (!store) {
                throw new Error(
                    '[vurb/core] carryOverState exceeds 2 KB but no HandoffStateStore was provided. ' +
                    'Pass a store to SwarmGatewayConfig.stateStore.',
                );
            }
            const stateId = randomUUID();
            await store.set(stateId, carryOverState, ttlSeconds + 60);
            claims.state_id = stateId;
        } else {
            claims.state = carryOverState;
        }
    }

    const payload = encodePayload(claims);
    const sig = sign(payload, secret);
    return `${payload}${TOKEN_SEP}${sig}`;
}

/**
 * Verify a delegation token and return its claims.
 *
 * - Validates HMAC signature (constant-time)
 * - Validates expiry (`exp`)
 * - Hydrates `carryOverState` from store when `state_id` is present (Claim-Check retrieval)
 *
 * @param raw    - Raw token produced by {@link mintDelegationToken}
 * @param secret - HMAC signing secret (must match the mint secret)
 * @param store  - Required if the token may contain a `state_id`
 * @throws {@link HandoffAuthError} on any validation failure
 */
export async function verifyDelegationToken(
    raw: string,
    secret: string,
    store?: HandoffStateStore,
): Promise<DelegationClaims> {
    const sep = raw.lastIndexOf(TOKEN_SEP);
    if (sep === -1) {
        throw new HandoffAuthError('INVALID_DELEGATION_TOKEN', 'Malformed token: missing signature separator.');
    }

    const payload = raw.slice(0, sep);
    const providedSig = raw.slice(sep + 1);
    const expectedSig = sign(payload, secret);

    if (!timingSafeEqual(providedSig, expectedSig)) {
        throw new HandoffAuthError('INVALID_SIGNATURE', 'Delegation token signature is invalid.');
    }

    let claims: DelegationClaims;
    try {
        claims = decodePayload(payload);
    } catch {
        throw new HandoffAuthError('INVALID_DELEGATION_TOKEN', 'Delegation token payload could not be decoded.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) {
        throw new HandoffAuthError(
            'EXPIRED_DELEGATION_TOKEN',
            `Delegation token expired at ${new Date(claims.exp * 1000).toISOString()}.`,
        );
    }

    // Claim-Check: hydrate state from store
    if (claims.state_id) {
        if (!store) {
            throw new HandoffAuthError(
                'INVALID_DELEGATION_TOKEN',
                'Token contains state_id but no HandoffStateStore was provided.',
            );
        }
        // Use the two-phase get+delete pattern only when both optional methods exist
        // on the store. Fall back to the atomic `getAndDelete` for stores that implement
        // the minimum interface (only `set` + `getAndDelete`).
        // Without this check, calling `store.get()` on a minimal store would throw
        // "store.get is not a function" at runtime — a silent crash invisible in TS.
        let state: Record<string, unknown> | undefined;
        if (typeof store.get === 'function' && typeof store.delete === 'function') {
            // Two-phase: read first, delete only after data is safely in claims.state
            state = await store.get(claims.state_id);
            if (state !== undefined) {
                claims.state = state;
                await store.delete(claims.state_id);
            }
        } else {
            // Atomic fallback: getAndDelete cannot lose data between read and delete
            state = await store.getAndDelete(claims.state_id);
            if (state !== undefined) {
                claims.state = state;
            }
        }

        // If state_id was present but the store returned nothing, the state has
        // either expired (TTL elapsed) or was already consumed (replay attempt).
        // Silently continuing would give the upstream an empty context — the correct
        // behaviour is to reject the token so the caller gets a clear signal.
        if (state === undefined) {
            throw new HandoffAuthError(
                'EXPIRED_DELEGATION_TOKEN',
                'Delegation token carry-over state has expired or was already consumed. ' +
                'Initiate a new handoff.',
            );
        }

        delete claims.state_id;
    }

    return claims;
}
