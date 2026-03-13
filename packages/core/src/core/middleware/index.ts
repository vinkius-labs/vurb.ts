/** Middleware Bounded Context — Barrel Export */
export {
    defineMiddleware,
    resolveMiddleware,
    isMiddlewareDefinition,
} from './ContextDerivation.js';
export type {
    MiddlewareDefinition,
    MergeContext,
    InferContextOut,
} from './ContextDerivation.js';

// ── Security Middleware ──────────────────────────────────
export { inputFirewall } from './InputFirewall.js';
export type { InputFirewallConfig } from './InputFirewall.js';

export { auditTrail } from './AuditTrail.js';
export type { AuditTrailConfig, AuditIdentity, AuditSink } from './AuditTrail.js';

export { rateLimit, InMemoryStore } from './RateLimiter.js';
export type { RateLimitConfig, RateLimitStore, RateLimitEntry } from './RateLimiter.js';
