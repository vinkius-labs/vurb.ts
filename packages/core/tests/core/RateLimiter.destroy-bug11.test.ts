/**
 * Bug #11 Regression: RateLimiter cleanup interval never destroyed automatically
 *
 * BUG: InMemoryStore creates a setInterval for periodic cleanup. The interval
 * is unref()'d but never auto-destroyed. In test suites creating many rate
 * limiter instances, hundreds of phantom timers accumulate. The `destroy()`
 * method was optional in the interface and never called automatically.
 *
 * FIX:
 * 1. `destroy()` is now required in the `RateLimitStore` interface
 * 2. `rateLimit()` factory returns a `RateLimitMiddleware` with a `destroy()` method
 *    that forwards to the underlying store's `destroy()`
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { InMemoryStore, rateLimit } from '../../src/core/middleware/RateLimiter.js';
import type { RateLimitStore, RateLimitMiddleware } from '../../src/core/middleware/RateLimiter.js';

describe('Bug #11 Regression: RateLimiter destroy lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── Interface contract ───────────────────────────────────

    it('should require destroy() in RateLimitStore implementations', () => {
        // TypeScript enforces this at compile time. At runtime, verify
        // InMemoryStore has destroy as a non-optional method.
        const store = new InMemoryStore(1000);
        expect(typeof store.destroy).toBe('function');
        store.destroy();
    });

    // ── Middleware destroy() ─────────────────────────────────

    it('should expose destroy() on the middleware returned by rateLimit()', () => {
        const mw = rateLimit({ windowMs: 10_000, max: 5 });
        expect(typeof mw.destroy).toBe('function');
        mw.destroy();
    });

    it('should forward destroy() to the underlying InMemoryStore', () => {
        const clearSpy = vi.spyOn(global, 'clearInterval');
        const mw = rateLimit({ windowMs: 10_000, max: 5 });

        mw.destroy();

        // clearInterval should have been called (InMemoryStore.destroy calls it)
        expect(clearSpy).toHaveBeenCalled();
    });

    it('should forward destroy() to a custom store', () => {
        const customStore: RateLimitStore = {
            increment: vi.fn().mockReturnValue({ count: 0, resetMs: 0 }),
            record: vi.fn(),
            destroy: vi.fn(),
        };

        const mw = rateLimit({ windowMs: 10_000, max: 5, store: customStore });
        mw.destroy();

        expect(customStore.destroy).toHaveBeenCalledOnce();
    });

    // ── Timer leak prevention ────────────────────────────────

    it('should not leak timers when destroy() is called', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

        const instances: RateLimitMiddleware[] = [];
        for (let i = 0; i < 10; i++) {
            instances.push(rateLimit({ windowMs: 1000, max: 100 }));
        }

        // 10 setInterval calls (one per InMemoryStore)
        expect(setIntervalSpy).toHaveBeenCalledTimes(10);

        // Destroy all
        for (const mw of instances) {
            mw.destroy();
        }

        // All intervals cleared
        expect(clearIntervalSpy).toHaveBeenCalledTimes(10);
    });

    it('should clear entries on destroy()', () => {
        const store = new InMemoryStore(60_000);

        // Add some entries
        store.increment('key1', 60_000);
        store.record('key1');
        store.increment('key2', 60_000);
        store.record('key2');

        store.destroy();

        // After destroy, new increment should show empty state
        const result = store.increment('key1', 60_000);
        expect(result.count).toBe(0);
    });

    // ── Middleware still works before destroy ─────────────────

    it('should function correctly before destroy() is called', async () => {
        const mw = rateLimit({ windowMs: 60_000, max: 2 });
        const next = vi.fn().mockResolvedValue('ok');

        // First two calls should pass
        const r1 = await mw({}, {}, next);
        const r2 = await mw({}, {}, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(r1).toBe('ok');
        expect(r2).toBe('ok');

        // Third should be rate-limited
        const r3 = await mw({}, {}, next);
        expect(next).toHaveBeenCalledTimes(2); // not called again
        expect(r3).toHaveProperty('isError', true);

        mw.destroy();
    });

    // ── Multiple destroy() calls are safe ────────────────────

    it('should handle multiple destroy() calls without throwing', () => {
        const mw = rateLimit({ windowMs: 10_000, max: 5 });
        expect(() => {
            mw.destroy();
            mw.destroy();
            mw.destroy();
        }).not.toThrow();
    });
});
