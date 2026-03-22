/**
 * FHP — Tests: InMemoryHandoffStateStore
 *
 * @module
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryHandoffStateStore } from '../../src/handoff/HandoffStateStore.js';

describe('InMemoryHandoffStateStore', () => {
    let store: InMemoryHandoffStateStore;

    beforeEach(() => {
        store = new InMemoryHandoffStateStore();
    });

    it('should persist and retrieve state', async () => {
        await store.set('id-1', { userId: 'u-1' }, 60);
        const result = await store.getAndDelete('id-1');
        expect(result).toEqual({ userId: 'u-1' });
    });

    it('should delete after getAndDelete (one-shot)', async () => {
        await store.set('id-2', { x: 1 }, 60);
        await store.getAndDelete('id-2');
        const second = await store.getAndDelete('id-2');
        expect(second).toBeUndefined();
    });

    it('should return undefined for a non-existent key', async () => {
        const result = await store.getAndDelete('does-not-exist');
        expect(result).toBeUndefined();
    });

    it('should respect TTL — expired entry returns undefined', async () => {
        // TTL of -1 second → already expired
        await store.set('id-exp', { val: 'expired' }, -1);
        const result = await store.getAndDelete('id-exp');
        expect(result).toBeUndefined();
    });

    it('should report the correct size', async () => {
        expect(store.size).toBe(0);
        await store.set('a', {}, 60);
        await store.set('b', {}, 60);
        expect(store.size).toBe(2);
        await store.getAndDelete('a');
        expect(store.size).toBe(1);
    });

    it('should overwrite an existing entry', async () => {
        await store.set('id-ow', { v: 1 }, 60);
        await store.set('id-ow', { v: 2 }, 60);
        const result = await store.getAndDelete('id-ow');
        expect(result).toEqual({ v: 2 });
    });
});
