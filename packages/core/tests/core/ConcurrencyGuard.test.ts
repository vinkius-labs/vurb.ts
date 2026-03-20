/**
 * ConcurrencyGuard — Unit Tests
 *
 * Senior QA coverage: fast-path, queue-path, load-shedding, drain ordering,
 * idempotent release, AbortSignal semantics, fractional config clamping,
 * getter accuracy, and factory helper.
 */
import { describe, it, expect } from 'vitest';
import { ConcurrencyGuard, createConcurrencyGuard } from '../../src/core/execution/ConcurrencyGuard.js';

// ── Helpers ──────────────────────────────────────────────

/** Acquire and return the release function. Throws if load-shedded (null). */
async function mustAcquire(guard: ConcurrencyGuard, signal?: AbortSignal): Promise<() => void> {
    const release = await guard.acquire(signal);
    if (release === null) throw new Error('Unexpected load shedding');
    return release;
}

// ============================================================================
// Fast Path — Slot Available
// ============================================================================

describe('ConcurrencyGuard: fast path (slot available)', () => {
    it('resolves immediately when maxActive has not been reached', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 2 });
        const release = await mustAcquire(guard);
        expect(guard.active).toBe(1);
        release();
        expect(guard.active).toBe(0);
    });

    it('allows up to maxActive concurrent acquisitions', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 3 });
        const r1 = await mustAcquire(guard);
        const r2 = await mustAcquire(guard);
        const r3 = await mustAcquire(guard);

        expect(guard.active).toBe(3);
        expect(guard.queued).toBe(0);

        r1(); r2(); r3();
        expect(guard.active).toBe(0);
    });

    it('.active getter reflects in-flight count accurately', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 5 });

        const r1 = await mustAcquire(guard);
        expect(guard.active).toBe(1);
        const r2 = await mustAcquire(guard);
        expect(guard.active).toBe(2);
        r1();
        expect(guard.active).toBe(1);
        r2();
        expect(guard.active).toBe(0);
    });
});

// ============================================================================
// Queue Path — Backpressure
// ============================================================================

describe('ConcurrencyGuard: queue path (backpressure)', () => {
    it('enqueues waiters when maxActive is full', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 2 });

        // Occupy the single slot
        const r1 = await mustAcquire(guard);
        expect(guard.active).toBe(1);
        expect(guard.queued).toBe(0);

        // Second call should be queued (returns promise, not resolved yet)
        const p2 = guard.acquire();
        expect(guard.queued).toBe(1);

        // Release slot → waiter gets it
        r1();
        const r2 = await p2;
        expect(r2).not.toBeNull();
        expect(guard.active).toBe(1);
        expect(guard.queued).toBe(0);

        (r2 as () => void)();
        expect(guard.active).toBe(0);
    });

    it('drains waiters in FIFO order', async () => {
        const order: number[] = [];
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 5 });

        // Occupy slot
        const r1 = await mustAcquire(guard);

        // Queue 3 waiters simultaneously
        const p2 = guard.acquire()!.then(r => { order.push(2); return r; });
        const p3 = guard.acquire()!.then(r => { order.push(3); return r; });
        const p4 = guard.acquire()!.then(r => { order.push(4); return r; });

        expect(guard.queued).toBe(3);

        // Release one at a time
        r1();
        const r2 = await p2;
        (r2 as () => void)();
        const r3 = await p3;
        (r3 as () => void)();
        const r4 = await p4;
        (r4 as () => void)();

        expect(order).toEqual([2, 3, 4]);
    });

    it('.queued getter reflects pending count accurately', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 3 });

        const r1 = await mustAcquire(guard);
        expect(guard.queued).toBe(0);

        const p2 = guard.acquire();
        expect(guard.queued).toBe(1);
        const p3 = guard.acquire();
        expect(guard.queued).toBe(2);

        // Release r1 → p2's waiter is drained immediately (synchronous shift + active++)
        r1();
        expect(guard.queued).toBe(1); // p3 still in queue after drain of p2

        const r2 = await p2;

        // Release r2 → drains p3
        (r2 as () => void)();
        expect(guard.queued).toBe(0);

        const r3 = await p3;
        (r3 as () => void)();
        expect(guard.active).toBe(0);
    });
});

// ============================================================================
// Load Shedding — Queue Full
// ============================================================================

describe('ConcurrencyGuard: load shedding (queue full)', () => {
    it('returns null when both active slots and queue are full', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 1 });

        // Occupy slot
        const r1 = await mustAcquire(guard);
        // Fill queue
        const p2 = guard.acquire();
        expect(guard.queued).toBe(1);

        // Third call → shed
        const shed = guard.acquire();
        expect(shed).toBeNull();

        // Clean up
        r1();
        await p2;
    });

    it('returns null immediately on zero-queue configuration (default)', async () => {
        // maxQueue defaults to 0 — no backpressure buffer
        const guard = new ConcurrencyGuard({ maxActive: 1 });

        const r1 = await mustAcquire(guard);

        // First overflow → shed immediately
        expect(guard.acquire()).toBeNull();
        expect(guard.acquire()).toBeNull();

        r1();
        // After release, next call succeeds
        const r2 = await mustAcquire(guard);
        r2();
    });

    it('handles rapid concurrent shedding without state corruption', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 2, maxQueue: 1 });

        const r1 = await mustAcquire(guard);
        const r2 = await mustAcquire(guard);
        const p3  = guard.acquire(); // queued

        // These should all be shed
        const shed1 = guard.acquire();
        const shed2 = guard.acquire();
        const shed3 = guard.acquire();

        expect(shed1).toBeNull();
        expect(shed2).toBeNull();
        expect(shed3).toBeNull();
        expect(guard.queued).toBe(1); // only p3 in queue

        r1();
        r2();
        const r3 = await p3;
        (r3 as () => void)();
        expect(guard.active).toBe(0);
        expect(guard.queued).toBe(0);
    });
});

// ============================================================================
// Idempotent Release
// ============================================================================

describe('ConcurrencyGuard: idempotent release', () => {
    it('calling release twice does not decrement active below 0', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 2 });

        const release = await mustAcquire(guard);
        expect(guard.active).toBe(1);

        release();
        expect(guard.active).toBe(0);

        // Call again — should be no-op
        release();
        expect(guard.active).toBe(0); // NOT -1
    });

    it('double-release does not drain an extra waiter', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 2 });

        const r1 = await mustAcquire(guard);
        const p2 = guard.acquire()!;
        const p3 = guard.acquire()!;

        // Release once → drains p2
        r1();
        const r2 = await p2;
        expect(guard.queued).toBe(1); // p3 still waiting

        // Double-release r1 → must NOT spuriously drain p3
        r1(); // idempotent — already released
        // p3 is still just queued, not yet resolved
        expect(guard.queued).toBe(1);

        // Clean up normally
        (r2 as () => void)();
        const r3 = await p3;
        (r3 as () => void)();
    });
});

// ============================================================================
// AbortSignal — Cooperative Cancellation
// ============================================================================

describe('ConcurrencyGuard: AbortSignal cancellation', () => {
    it('rejects immediately when signal is already aborted', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 2 });

        // Fill the slot so next call goes to queue
        const r1 = await mustAcquire(guard);

        const controller = new AbortController();
        controller.abort(); // Pre-aborted

        const p = guard.acquire(controller.signal);
        // Should reject immediately (queue path, signal already aborted)
        await expect(p).rejects.toThrow('cancelled');

        // Queue should be empty (waiter was immediately rejected)
        expect(guard.queued).toBe(0);

        r1();
    });

    it('rejects queued waiter when signal fires while waiting', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 2 });

        const r1 = await mustAcquire(guard);
        const controller = new AbortController();

        const p = guard.acquire(controller.signal);
        expect(guard.queued).toBe(1);

        // Abort while waiter is in queue
        setTimeout(() => controller.abort(), 10);
        await expect(p).rejects.toThrow('cancelled');

        expect(guard.queued).toBe(0);
        r1();
    });

    it('other waiters are still served when one is aborted', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 3 });

        const r1 = await mustAcquire(guard);

        const controller = new AbortController();
        const pAborted = guard.acquire(controller.signal);
        const pNormal  = guard.acquire(); // No signal — should still resolve

        expect(guard.queued).toBe(2);

        // Abort the first waiter
        controller.abort();
        await expect(pAborted).rejects.toThrow('cancelled');
        expect(guard.queued).toBe(1); // pNormal still waiting

        // Release the slot → pNormal should get it
        r1();
        const r2 = await pNormal;
        expect(r2).not.toBeNull();
        (r2 as () => void)();
    });

    it('abort listener is cleaned up when waiter resolves normally (no listener leak)', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 2 });

        const r1 = await mustAcquire(guard);
        const controller = new AbortController();

        const p = guard.acquire(controller.signal)!;
        expect(guard.queued).toBe(1);

        // Release normally → waiter resolves
        r1();
        const r2 = await p;
        (r2 as () => void)();

        // Aborting now should be a no-op (listener was removed)
        controller.abort(); // must not throw or corrupt state
        expect(guard.active).toBe(0);
        expect(guard.queued).toBe(0);
    });
});

// ============================================================================
// Config Clamping
// ============================================================================

describe('ConcurrencyGuard: config clamping', () => {
    it('floors fractional maxActive values', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 2.9 });
        // Should behave as maxActive=2
        const r1 = await mustAcquire(guard);
        const r2 = await mustAcquire(guard);
        // Third call should be shed (queue=0 by default)
        expect(guard.acquire()).toBeNull();
        r1(); r2();
    });

    it('enforces minimum maxActive of 1 even for 0 or negative', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 0 });
        // Should behave as maxActive=1 (floors to max(1, 0) = 1)
        const r1 = await mustAcquire(guard);
        expect(guard.active).toBe(1);
        expect(guard.acquire()).toBeNull(); // second call shed
        r1();
    });

    it('floors fractional maxQueue values', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 1.7 });
        // maxQueue should be 1
        const r1 = await mustAcquire(guard);
        const p2 = guard.acquire(); // queued (queue size 1 → fits)
        expect(guard.queued).toBe(1);
        expect(guard.acquire()).toBeNull(); // queue full (second would be 2, > 1)
        r1();
        await p2;
    });
});

// ============================================================================
// Extreme / Edge Cases
// ============================================================================

describe('ConcurrencyGuard: edge cases', () => {
    it('maxActive=1 acts as an exclusive lock (mutex)', async () => {
        const order: number[] = [];
        const guard = new ConcurrencyGuard({ maxActive: 1, maxQueue: 10 });

        const run = async (n: number) => {
            const release = await guard.acquire()!;
            order.push(n);
            await new Promise(r => setTimeout(r, 5));
            (release as () => void)();
        };

        await Promise.all([run(1), run(2), run(3)]);

        // FIFO — first caller runs first since acquire is sequential here
        expect(order[0]).toBe(1);
    });

    it('maxQueue=0 (default) means immediate shed when full', () => {
        const guard = new ConcurrencyGuard({ maxActive: 1 });
        // acquire synchronously via fast path
        const promise = guard.acquire(); // occupies slot (fast path, resolved promise)
        // Next call should shed
        expect(guard.acquire()).toBeNull();
    });

    it('high-throughput: 50 sequential acquisitions do not corrupt state', async () => {
        const guard = new ConcurrencyGuard({ maxActive: 5, maxQueue: 50 });
        const results: number[] = [];

        const tasks = Array.from({ length: 50 }, (_, i) => async () => {
            const release = await guard.acquire()!;
            results.push(i);
            (release as () => void)();
        });

        await Promise.all(tasks.map(t => t()));

        expect(results).toHaveLength(50);
        expect(guard.active).toBe(0);
        expect(guard.queued).toBe(0);
    });
});

// ============================================================================
// createConcurrencyGuard Factory
// ============================================================================

describe('createConcurrencyGuard() factory', () => {
    it('returns undefined when no config is passed (zero overhead)', () => {
        expect(createConcurrencyGuard()).toBeUndefined();
        expect(createConcurrencyGuard(undefined)).toBeUndefined();
    });

    it('returns a ConcurrencyGuard instance when config is provided', () => {
        const guard = createConcurrencyGuard({ maxActive: 3 });
        expect(guard).toBeInstanceOf(ConcurrencyGuard);
    });

    it('created guard has correct initial state', () => {
        const guard = createConcurrencyGuard({ maxActive: 3, maxQueue: 5 })!;
        expect(guard.active).toBe(0);
        expect(guard.queued).toBe(0);
    });
});
