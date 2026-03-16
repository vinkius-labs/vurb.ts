/**
 * SemanticDefaults — Verb-level semantic hints for tool behavior.
 *
 * Each verb (`query`, `mutation`, `action`) carries default semantic
 * annotations that inform the MCP runtime about side effects,
 * idempotency, and cacheability.
 *
 * @module
 */

// ── Semantic Verb Defaults ───────────────────────────────

/**
 * Semantic defaults applied by each verb.
 * @internal
 */
export interface SemanticDefaults {
    readonly readOnly?: boolean;
    readonly destructive?: boolean;
    readonly idempotent?: boolean;
}

/** Defaults for `f.query()` — read-only, no side effects */
export const QUERY_DEFAULTS: SemanticDefaults = { readOnly: true };

/** Defaults for `f.mutation()` — destructive, irreversible */
export const MUTATION_DEFAULTS: SemanticDefaults = { destructive: true };

/** Defaults for `f.action()` — neutral, no assumptions */
export const ACTION_DEFAULTS: SemanticDefaults = {};
