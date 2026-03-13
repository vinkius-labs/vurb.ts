/**
 * RateLimiter — Sliding Window Rate Limiting Middleware
 *
 * Provides per-key rate limiting with a configurable time window
 * and maximum request count. Follows the same middleware pattern
 * as `requireApiKey()` and `requireJwt()`.
 *
 * The default store is in-memory (single-process only). For
 * multi-instance deploys (Kubernetes, PM2 cluster, serverless),
 * provide a distributed `RateLimitStore` implementation.
 *
 * @example
 * ```typescript
 * import { rateLimit } from '@vurb/core';
 *
 * const billing = createTool('billing')
 *     .use(rateLimit({
 *         windowMs: 60_000,  // 1 minute
 *         max: 100,          // 100 requests per window
 *         keyFn: (ctx) => (ctx as AppCtx).userId,
 *     }));
 * ```
 *
 * @module
 */
import type { MiddlewareFn } from '../types.js';
import type { TelemetrySink } from '../../observability/TelemetryEvent.js';
import { toolError } from '../response.js';

// ── Types ────────────────────────────────────────────────

/**
 * Store interface for rate limiting state.
 *
 * Implement this interface for distributed rate limiting
 * (e.g., Redis, Valkey, Memcached).
 */
export interface RateLimitStore {
    /**
     * Check the current request count for a key within a time window.
     * Does NOT record the request — call `record()` separately after
     * confirming the request is under the limit.
     *
     * @param key - Rate limit key (e.g., user ID)
     * @param windowMs - Time window in milliseconds
     * @returns Current count and time until window resets (in ms)
     */
    increment(key: string, windowMs: number): Promise<RateLimitEntry> | RateLimitEntry;

    /**
     * Record a successful (non-rejected) request.
     * Called ONLY when the request is under the limit.
     * This separation prevents rejected requests from inflating the window.
     *
     * @param key - Rate limit key
     */
    record(key: string): Promise<void> | void;

    /**
     * Clean up resources (intervals, connections).
     * Called when the server shuts down.
     */
    destroy?(): void;
}

/** Rate limit entry returned by the store */
export interface RateLimitEntry {
    /** Current request count within the window */
    readonly count: number;
    /** Milliseconds until the window resets */
    readonly resetMs: number;
}

/**
 * Configuration for the rateLimit middleware.
 */
export interface RateLimitConfig {
    /**
     * Time window in milliseconds.
     *
     * @example 60_000 // 1 minute
     */
    readonly windowMs: number;

    /**
     * Maximum number of requests allowed per window.
     */
    readonly max: number;

    /**
     * Extract the rate limit key from the request context.
     * When not provided, a global key is used (all requests share the limit).
     *
     * @param ctx - Request context
     * @returns A string key for rate limiting (e.g., user ID)
     */
    readonly keyFn?: (ctx: unknown) => string;

    /**
     * Custom rate limit store. Defaults to {@link InMemoryStore}.
     *
     * ⚠️ The default `InMemoryStore` is **single-process only**.
     * For multi-instance deploys (Kubernetes, PM2 cluster, serverless),
     * provide a distributed store implementation (e.g., Redis).
     */
    readonly store?: RateLimitStore;

    /**
     * Custom error code for rate-limited responses.
     *
     * @default 'RATE_LIMITED'
     */
    readonly errorCode?: string;

    /**
     * Callback invoked when a request is rate-limited.
     * Use for audit logging or alerting.
     *
     * @param ctx - Request context
     * @param key - The rate limit key that was exceeded
     */
    readonly onRejected?: (ctx: unknown, key: string) => void;

    /**
     * Optional telemetry sink for `security.rateLimit` events.
     * When provided, emits an event each time a request is rate-limited.
     */
    readonly telemetry?: TelemetrySink;
}

// ── In-Memory Store ──────────────────────────────────────

/** Internal entry for the in-memory store */
interface MemoryEntry {
    timestamps: number[];
}

/**
 * In-memory sliding window rate limit store.
 *
 * ⚠️ **Single-process only.** Each process maintains its own counters.
 * In multi-instance deployments (Kubernetes, PM2 cluster, serverless),
 * each instance has an independent counter — an attacker effectively
 * gets `max * instanceCount` requests. For distributed rate limiting,
 * implement {@link RateLimitStore} with a shared backend (Redis, Valkey).
 *
 * Automatic cleanup runs every `windowMs` to prune expired entries.
 */
export class InMemoryStore implements RateLimitStore {
    private readonly _entries = new Map<string, MemoryEntry>();
    private readonly _cleanupInterval: ReturnType<typeof setInterval>;
    private readonly _windowMs: number;

    constructor(windowMs: number = 60_000) {
        this._windowMs = windowMs;
        this._cleanupInterval = setInterval(() => this._cleanup(), windowMs);
        // Ensure the interval doesn't prevent Node.js from exiting
        if (typeof this._cleanupInterval === 'object' && 'unref' in this._cleanupInterval) {
            this._cleanupInterval.unref();
        }
    }

    increment(key: string, windowMs: number): RateLimitEntry {
        const now = Date.now();
        const windowStart = now - windowMs;

        let entry = this._entries.get(key);
        if (!entry) {
            entry = { timestamps: [] };
            this._entries.set(key, entry);
        }

        // Prune expired timestamps (sliding window)
        entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

        // Check BEFORE pushing — rejected requests don't inflate the window
        const currentCount = entry.timestamps.length;

        // Calculate reset time: when the oldest request in the window expires
        const oldestInWindow = entry.timestamps[0];
        const resetMs = oldestInWindow ? (oldestInWindow + windowMs) - now : windowMs;

        return {
            count: currentCount,
            resetMs: Math.max(0, resetMs),
            // Timestamp will be pushed by the caller only on success
        };
    }

    /**
     * Record a successful (non-rejected) request.
     * Only called when the request is under the limit.
     */
    record(key: string): void {
        const entry = this._entries.get(key);
        if (entry) {
            entry.timestamps.push(Date.now());
        }
    }

    destroy(): void {
        clearInterval(this._cleanupInterval);
        this._entries.clear();
    }

    private _cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this._entries) {
            // Remove entries with no recent timestamps
            if (entry.timestamps.length === 0 ||
                entry.timestamps[entry.timestamps.length - 1]! < now - this._windowMs) {
                this._entries.delete(key);
            }
        }
    }
}

// ── Middleware Factory ───────────────────────────────────

/**
 * Create a rate limiting middleware.
 *
 * Returns a self-healing `toolError('RATE_LIMITED')` with `retryAfterSeconds`
 * when the limit is exceeded, following RFC 7231 semantics.
 *
 * @param config - Rate limit configuration
 * @returns A middleware function compatible with `.use()`
 */
export function rateLimit(config: RateLimitConfig): MiddlewareFn<unknown> {
    const store = config.store ?? new InMemoryStore(config.windowMs);
    const errorCode = config.errorCode ?? 'RATE_LIMITED';
    const keyFn = config.keyFn ?? (() => '__global__');

    return async (
        ctx: unknown,
        args: Record<string, unknown>,
        next: () => Promise<unknown>,
    ): Promise<unknown> => {
        const key = keyFn(ctx);
        const entry = await store.increment(key, config.windowMs);

        if (entry.count >= config.max) {
            const retryAfterSeconds = Math.ceil(entry.resetMs / 1000);

            if (config.onRejected) {
                try { config.onRejected(ctx, key); } catch { /* fire-and-forget */ }
            }

            // Emit telemetry event
            if (config.telemetry) {
                try {
                    config.telemetry({
                        type: 'security.rateLimit',
                        key,
                        count: entry.count,
                        max: config.max,
                        retryAfterSeconds,
                        timestamp: Date.now(),
                    });
                } catch { /* fire-and-forget */ }
            }

            return toolError(errorCode, {
                message: `Rate limit exceeded. Maximum ${config.max} requests per ${Math.ceil(config.windowMs / 1000)}s window.`,
                suggestion: `Wait ${retryAfterSeconds} seconds before retrying. Current key: "${key}".`,
                retryAfter: retryAfterSeconds,
            });
        }

        // Record the request ONLY if not rate-limited
        await store.record(key);

        return next();
    };
}
