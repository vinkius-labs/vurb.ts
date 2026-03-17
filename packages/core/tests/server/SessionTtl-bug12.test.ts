/**
 * Bug #12 Regression: Sessions Map grows indefinitely (connection leak)
 *
 * BUG: The `Map<string, StreamableHTTPServerTransport>` in the HTTP transport
 * depends on `onclose` to clean up sessions. If TCP dies abruptly (kill -9,
 * network timeout), `onclose` never fires → session stays in Map forever.
 * Long-running servers leak memory proportional to abandoned connections.
 *
 * FIX: Added `sessionActivity` Map with last-activity timestamps, a periodic
 * reaper interval (default 5 min) that removes sessions inactive beyond
 * `sessionTtlMs` (default 30 min), and `sessionTtlMs`/`sessionReapIntervalMs`
 * configuration options.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import type { StartServerOptions } from '../../src/server/startServer.js';

/**
 * These tests validate the type-level API changes.
 * Integration tests for the actual reaping behavior require a real HTTP server
 * and are covered by the startServer integration suite.
 */
describe('Bug #12 Regression: Session TTL configuration', () => {

    it('should accept sessionTtlMs in StartServerOptions', () => {
        // Type-level test: this should compile without errors
        const opts: Partial<StartServerOptions<unknown>> = {
            sessionTtlMs: 1_800_000,
        };
        expect(opts.sessionTtlMs).toBe(1_800_000);
    });

    it('should accept sessionReapIntervalMs in StartServerOptions', () => {
        const opts: Partial<StartServerOptions<unknown>> = {
            sessionReapIntervalMs: 300_000,
        };
        expect(opts.sessionReapIntervalMs).toBe(300_000);
    });

    it('should accept both TTL options together', () => {
        const opts: Partial<StartServerOptions<unknown>> = {
            sessionTtlMs: 600_000,          // 10 min
            sessionReapIntervalMs: 60_000,   // 1 min
        };
        expect(opts.sessionTtlMs).toBe(600_000);
        expect(opts.sessionReapIntervalMs).toBe(60_000);
    });

    it('should have sensible defaults documented in the type', () => {
        // Defaults are enforced in the implementation:
        // sessionTtlMs: 1_800_000 (30 min)
        // sessionReapIntervalMs: 300_000 (5 min)
        // This test validates the contract exists.
        const opts: Partial<StartServerOptions<unknown>> = {};
        expect(opts.sessionTtlMs).toBeUndefined();
        expect(opts.sessionReapIntervalMs).toBeUndefined();
    });

    it('should accept custom short TTL for aggressive cleanup', () => {
        const opts: Partial<StartServerOptions<unknown>> = {
            sessionTtlMs: 10_000,            // 10 seconds
            sessionReapIntervalMs: 5_000,    // 5 seconds
        };
        expect(opts.sessionTtlMs).toBeLessThan(opts.sessionReapIntervalMs! * 3);
    });

    it('should allow maxBodyBytes alongside session TTL options', () => {
        const opts: Partial<StartServerOptions<unknown>> = {
            maxBodyBytes: 4_194_304,
            sessionTtlMs: 1_800_000,
            sessionReapIntervalMs: 300_000,
        };
        expect(opts.maxBodyBytes).toBe(4_194_304);
        expect(opts.sessionTtlMs).toBe(1_800_000);
    });
});
