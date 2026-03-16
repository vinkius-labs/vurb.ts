/**
 * Bug #8 Regression: InMemoryStore.increment() returns incorrect resetMs
 *
 * BUG: When all timestamps in the sliding window have expired and are pruned,
 * `entry.timestamps[0]` is undefined. The fallback was `windowMs` (e.g. 60000),
 * which tells callers "the rate limit resets in 60 seconds" even though the
 * window is already empty (0 requests, fully reset).
 *
 * FIX: When the window is empty, resetMs should be 0 — there is nothing
 * to reset. The caller can retry immediately.
 *
 * WHY EXISTING TESTS MISSED IT:
 * No dedicated RateLimiter unit tests existed. The rate limiter was only
 * tested indirectly via middleware integration tests that focused on the
 * reject/accept behavior, not on the specific resetMs value returned.
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { InMemoryStore } from '../../src/core/middleware/RateLimiter.js';

describe('Bug #8 Regression: InMemoryStore.increment() resetMs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return resetMs=0 when the window is empty (no timestamps)', () => {
        const store = new InMemoryStore(60_000);
        const result = store.increment('test-key', 60_000);

        // No timestamps → window is empty → resetMs should be 0
        expect(result.count).toBe(0);
        expect(result.resetMs).toBe(0);

        store.destroy();
    });

    it('should return resetMs=0 after all timestamps expire', () => {
        const store = new InMemoryStore(1000);
        const now = Date.now();

        // Simulate timestamps from 2 seconds ago (expired for 1s window)
        vi.spyOn(Date, 'now').mockReturnValue(now - 2000);
        const r1 = store.increment('key', 1000);
        store.record('key');

        // Now advance to current time — all timestamps expired
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const r2 = store.increment('key', 1000);

        expect(r2.count).toBe(0);
        expect(r2.resetMs).toBe(0);

        store.destroy();
    });

    it('should return positive resetMs when timestamps exist in window', () => {
        const store = new InMemoryStore(60_000);
        const now = Date.now();

        vi.spyOn(Date, 'now').mockReturnValue(now);

        // Add a request
        store.increment('key', 60_000);
        store.record('key');

        // Check again immediately
        const result = store.increment('key', 60_000);

        expect(result.count).toBe(1);
        // resetMs should be approximately windowMs (oldest timestamp just recorded)
        expect(result.resetMs).toBeGreaterThan(0);
        expect(result.resetMs).toBeLessThanOrEqual(60_000);

        store.destroy();
    });

    it('should calculate correct resetMs when oldest timestamp is near expiry', () => {
        const store = new InMemoryStore(10_000);
        const now = Date.now();

        // Record a timestamp 8 seconds ago
        vi.spyOn(Date, 'now').mockReturnValue(now - 8000);
        store.increment('key', 10_000);
        store.record('key');

        // Check at current time — oldest should expire in ~2s
        vi.spyOn(Date, 'now').mockReturnValue(now);
        const result = store.increment('key', 10_000);

        expect(result.count).toBe(1);
        // resetMs should be ~2000 (oldest_ts + windowMs - now = (now-8000) + 10000 - now = 2000)
        expect(result.resetMs).toBe(2000);

        store.destroy();
    });
});
