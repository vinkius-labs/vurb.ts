/**
 * FHP — Deep Tests: HandoffStateStore
 *
 * Covers precise TTL, entry isolation, concurrency,
 * post-expiry behaviour, and getAndDelete invariants.
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

describe('InMemoryHandoffStateStore — TTL and expiry', () => {
    it('expired entries should return undefined', async () => {
        vi.useFakeTimers();
        const store = new InMemoryHandoffStateStore();
        await store.set('key-1', { x: 1 }, 30);

        vi.advanceTimersByTime(31_000); // advance 31 seconds
        const result = await store.getAndDelete('key-1');
        expect(result).toBeUndefined();
        vi.useRealTimers();
    });

    it('entries within TTL should be returned', async () => {
        vi.useFakeTimers();
        const store = new InMemoryHandoffStateStore();
        await store.set('key-2', { y: 'hello' }, 60);

        vi.advanceTimersByTime(30_000); // 30s — still within TTL
        const result = await store.getAndDelete('key-2');
        expect(result).toEqual({ y: 'hello' });
        vi.useRealTimers();
    });

    it('getAndDelete should physically remove the entry (size decreases)', async () => {
        const store = new InMemoryHandoffStateStore();
        await store.set('k1', { a: 1 }, 60);
        expect(store.size).toBe(1);
        await store.getAndDelete('k1');
        expect(store.size).toBe(0);
    });

    it('expired entries should remain in memory until retrieved (lazy cleanup)', async () => {
        vi.useFakeTimers();
        const store = new InMemoryHandoffStateStore();
        await store.set('e1', {}, 1);
        await store.set('e2', {}, 1);
        await store.set('e3', {}, 1);
        vi.advanceTimersByTime(2_000);
        // Without calling getAndDelete, expired entries stay in the Map
        expect(store.size).toBe(3);
        // Clean up via getAndDelete
        await store.getAndDelete('e1');
        await store.getAndDelete('e2');
        await store.getAndDelete('e3');
        expect(store.size).toBe(0);
        vi.useRealTimers();
    });
});

describe('InMemoryHandoffStateStore — isolation', () => {
    it('multiple keys should be isolated from each other', async () => {
        const store = new InMemoryHandoffStateStore();
        await store.set('user-1', { role: 'admin' }, 60);
        await store.set('user-2', { role: 'viewer' }, 60);

        const r1 = await store.getAndDelete('user-1');
        const r2 = await store.getAndDelete('user-2');

        expect(r1).toEqual({ role: 'admin' });
        expect(r2).toEqual({ role: 'viewer' });
    });

    it('getAndDelete on a non-existent key should return undefined without errors', async () => {
        const store = new InMemoryHandoffStateStore();
        await expect(store.getAndDelete('nonexistent')).resolves.toBeUndefined();
    });

    it('setting the same key twice should overwrite the entry', async () => {
        const store = new InMemoryHandoffStateStore();
        await store.set('same-key', { v: 1 }, 60);
        await store.set('same-key', { v: 2 }, 60);

        expect(store.size).toBe(1); // no duplicate
        const result = await store.getAndDelete('same-key');
        expect(result).toEqual({ v: 2 });
    });

    it('second getAndDelete on the same key should return undefined (one-shot)', async () => {
        const store = new InMemoryHandoffStateStore();
        await store.set('once', { val: 'hello' }, 60);
        const first = await store.getAndDelete('once');
        const second = await store.getAndDelete('once');

        expect(first).toEqual({ val: 'hello' });
        expect(second).toBeUndefined();
    });
});

describe('InMemoryHandoffStateStore — concurrency', () => {
    it('concurrent getAndDelete should be atomic (only one call should get the value)', async () => {
        const store = new InMemoryHandoffStateStore();
        await store.set('race', { secret: 42 }, 60);

        // Fire two getAndDelete calls in parallel
        const [r1, r2] = await Promise.all([
            store.getAndDelete('race'),
            store.getAndDelete('race'),
        ]);

        // JavaScript is single-threaded, so one will get the value and the other undefined
        const defined = [r1, r2].filter(r => r !== undefined);
        expect(defined).toHaveLength(1);
        expect(defined[0]).toEqual({ secret: 42 });
    });

    it('multiple concurrent set calls should persist all distinct values', async () => {
        const store = new InMemoryHandoffStateStore();
        await Promise.all([
            store.set('concurrent-a', { n: 1 }, 60),
            store.set('concurrent-b', { n: 2 }, 60),
            store.set('concurrent-c', { n: 3 }, 60),
        ]);
        expect(store.size).toBe(3);
    });
});

describe('InMemoryHandoffStateStore — TTL boundary', () => {
    it('entry expired by 1 ms should return undefined', async () => {
        vi.useFakeTimers();
        const store = new InMemoryHandoffStateStore();
        await store.set('edge', { x: 1 }, 5); // expires in exactly 5s

        vi.advanceTimersByTime(5_001); // 1 ms past expiry
        const result = await store.getAndDelete('edge');
        expect(result).toBeUndefined();
        vi.useRealTimers();
    });

    it('entry 1 ms before expiry should be returned', async () => {
        vi.useFakeTimers();
        const store = new InMemoryHandoffStateStore();
        await store.set('edge2', { x: 99 }, 5);

        vi.advanceTimersByTime(4_999); // 1 ms before expiry
        const result = await store.getAndDelete('edge2');
        expect(result).toEqual({ x: 99 });
        vi.useRealTimers();
    });
});
