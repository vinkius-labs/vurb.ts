/**
 * Resource Module — Barrel Export
 *
 * Public API for MCP Resource Subscriptions.
 * All exports are re-exported from bounded context modules.
 */

// ── Builder ──────────────────────────────────────────────
export { defineResource } from './ResourceBuilder.js';
export type {
    ResourceBuilder,
    ResourceConfig,
    ResourceContent,
    ResourceHandler,
    McpResourceDef,
} from './ResourceBuilder.js';

// ── Registry ─────────────────────────────────────────────
export { ResourceRegistry } from './ResourceRegistry.js';
export type { ResourceListChangedSink } from './ResourceRegistry.js';

// ── Subscription ─────────────────────────────────────────
export { SubscriptionManager } from './SubscriptionManager.js';
export type { ResourceNotificationSink } from './SubscriptionManager.js';
