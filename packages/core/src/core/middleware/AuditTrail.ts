/**
 * AuditTrail — SOC2/GDPR Compliance Middleware
 *
 * Structured audit logging of every tool invocation via {@link TelemetrySink}.
 * Emits `security.audit` events with identity, action, args hash, result
 * status, and duration — providing a complete audit trail for compliance.
 *
 * SOC2 Coverage:
 * - CC6.1 — Logical Access (identity.userId, identity.role)
 * - CC7.2 — Monitoring (every invocation logged)
 * - CC7.3 — Change Detection (argsHash for mutation tracking)
 *
 * GDPR Coverage:
 * - Art.30 — Records of Processing (tool, action, identity, timestamp)
 * - Art.5(1)(c) — Data Minimization (hashArgs: true — no PII in log)
 *
 * @example
 * ```typescript
 * import { auditTrail } from '@vurb/core';
 *
 * const billing = createTool('billing')
 *     .use(auditTrail({
 *         sink: telemetrySink,
 *         extractIdentity: (ctx) => ({
 *             userId: ctx.userId,
 *             role: ctx.role,
 *         }),
 *     }));
 * ```
 *
 * @module
 */
import type { MiddlewareFn } from '../types.js';

// ── Types ────────────────────────────────────────────────

/** Identity information extracted from the request context */
export interface AuditIdentity {
    readonly userId?: string;
    readonly role?: string;
    readonly ip?: string;
    readonly [key: string]: string | undefined;
}

/**
 * Result status for audit logging.
 */
export type AuditStatus = 'success' | 'error' | 'firewall_blocked' | 'rate_limited';

/**
 * A single audit event emitted by the middleware.
 */
export interface SecurityAuditEvent {
    readonly type: 'security.audit';
    /** Tool name (e.g., 'billing') */
    readonly tool: string;
    /** Action name (e.g., 'create_invoice') */
    readonly action: string;
    /** Extracted identity information */
    readonly identity: AuditIdentity;
    /** SHA-256 hash of the arguments (or 'none' if disabled) */
    readonly argsHash: string;
    /** Execution result status */
    readonly status: AuditStatus;
    /** Execution duration in milliseconds */
    readonly durationMs: number;
    /** Epoch milliseconds */
    readonly timestamp: number;
}

/**
 * Sink function for audit events.
 * Fire-and-forget — dropping events must never affect the server.
 */
export type AuditSink = (event: SecurityAuditEvent) => void;

/**
 * Configuration for the AuditTrail middleware.
 */
export interface AuditTrailConfig {
    /**
     * Sink function for audit events.
     * Can be a TelemetrySink, a logging function, or any other consumer.
     */
    readonly sink: AuditSink;

    /**
     * Tool name to include in audit events.
     * Should match the tool's registered name (e.g., 'billing').
     */
    readonly toolName?: string;

    /**
     * Field name used as the action discriminator in tool arguments.
     * Defaults to `'action'`. Set to the correct discriminator for
     * non-standard tools (e.g., `'command'`, `'operation'`).
     *
     * @default 'action'
     */
    readonly actionField?: string;

    /**
     * Extract identity information from the request context.
     * Return fields relevant for your compliance requirements.
     *
     * @param ctx - Request context
     * @returns Identity object for audit logging
     */
    readonly extractIdentity?: (ctx: unknown) => AuditIdentity;

    /**
     * Whether to hash the arguments (SHA-256).
     * When `true`, args are hashed for change detection without storing PII.
     *
     * @default true
     */
    readonly hashArgs?: boolean;

    /**
     * What level of result detail to log.
     *
     * - `'status'` — Log only success/error status (recommended)
     * - `'none'` — Don't log result at all
     *
     * @default 'status'
     */
    readonly logResult?: 'status' | 'none';
}

// ── SHA-256 Helper ───────────────────────────────────────

/**
 * Compute SHA-256 hash of a string.
 * Uses Web Crypto API (available in Node 18+).
 *
 * @internal
 */
async function sha256Hex(input: string): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback for environments without crypto.subtle
        return 'sha256:unavailable';
    }
}

// ── Middleware Factory ───────────────────────────────────

/**
 * Create an AuditTrail middleware for SOC2/GDPR compliance.
 *
 * Logs every tool invocation with identity, args hash, status,
 * and duration. The audit event is emitted AFTER the handler
 * completes (or fails), capturing the full lifecycle.
 *
 * @param config - Audit trail configuration
 * @returns A middleware function compatible with `.use()`
 */
export function auditTrail(config: AuditTrailConfig): MiddlewareFn<unknown> {
    const hashArgs = config.hashArgs !== false; // default: true
    const logResult = config.logResult ?? 'status';

    return async (
        ctx: unknown,
        args: Record<string, unknown>,
        next: () => Promise<unknown>,
    ): Promise<unknown> => {
        const start = Date.now();
        const identity = config.extractIdentity ? config.extractIdentity(ctx) : {};

        // Compute args hash (async, but fast)
        const argsHash = hashArgs
            ? await sha256Hex(JSON.stringify(args))
            : 'none';

        let status: AuditStatus = 'success';

        try {
            const result = await next();

            // Detect error/blocked status from response
            if (logResult === 'status') {
                const r = result as Record<string, unknown> | undefined;
                if (r != null && r['isError'] === true) {
                    const content = r['content'] as Array<{ text?: string }> | undefined;
                    const text = content?.[0]?.text ?? '';
                    // Bug #11 fix: extract the error code from the XML
                    // attribute instead of substring matching on full text
                    const codeMatch = text.match(/code="([^"]+)"/);
                    const errorCode = codeMatch?.[1] ?? '';
                    if (errorCode === 'RATE_LIMITED') {
                        status = 'rate_limited';
                    } else if (errorCode === 'INPUT_REJECTED') {
                        status = 'firewall_blocked';
                    } else {
                        status = 'error';
                    }
                }
            }

            emitAudit(config, args, identity, argsHash, status, start);

            return result;
        } catch (err) {
            status = 'error';
            emitAudit(config, args, identity, argsHash, status, start);
            throw err;
        }
    };
}

// ── Internal ─────────────────────────────────────────────

function emitAudit(
    config: AuditTrailConfig,
    args: Record<string, unknown>,
    identity: AuditIdentity,
    argsHash: string,
    status: AuditStatus,
    start: number,
): void {
    // Extract action from args using the configured field name
    const actionField = config.actionField ?? 'action';
    const action = typeof args?.[actionField] === 'string' ? args[actionField] as string : 'unknown';
    const tool = config.toolName ?? 'unknown';

    try {
        config.sink({
            type: 'security.audit',
            tool,
            action,
            identity,
            argsHash,
            status,
            durationMs: Date.now() - start,
            timestamp: Date.now(),
        });
    } catch {
        // Fire-and-forget — never break the handler
    }
}
