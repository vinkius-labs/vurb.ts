/**
 * MutationSerializer.test.ts
 *
 * Tests for the Intent Mutex — automatic serialization of destructive
 * tool operations to prevent race conditions from LLM hallucinations.
 *
 * Validates:
 *   - MutationSerializer: per-key FIFO serialization
 *   - MutationSerializer: independent keys execute in parallel
 *   - MutationSerializer: AbortSignal cancels queued waiters
 *   - MutationSerializer: GC of completed chains
 *   - Builder integration: auto-creation for destructive actions
 *   - Builder integration: non-destructive actions bypass serializer
 *   - Builder integration: mixed destructive + non-destructive
 *   - Builder integration: error recovery (slot release on crash)
 */
import { describe, it, expect } from 'vitest';
import { createTool, success, error as errResponse } from '../../src/core/index.js';
import { MutationSerializer } from '../../src/core/execution/MutationSerializer.js';

// ============================================================================
// Unit Tests: MutationSerializer
// ============================================================================

describe('MutationSerializer: FIFO Serialization', () => {
    it('should execute single call immediately', async () => {
        const serializer = new MutationSerializer();
        const result = await serializer.serialize('delete', async () => 42);
        expect(result).toBe(42);
    });

    it('should serialize concurrent calls on the same key', async () => {
        const serializer = new MutationSerializer();
        const order: number[] = [];

        const p1 = serializer.serialize('delete', async () => {
            await new Promise(r => setTimeout(r, 50));
            order.push(1);
            return 'first';
        });

        const p2 = serializer.serialize('delete', async () => {
            order.push(2);
            return 'second';
        });

        const p3 = serializer.serialize('delete', async () => {
            order.push(3);
            return 'third';
        });

        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

        expect(r1).toBe('first');
        expect(r2).toBe('second');
        expect(r3).toBe('third');
        // Strict FIFO: 1 must complete before 2, 2 before 3
        expect(order).toEqual([1, 2, 3]);
    });

    it('should allow parallel execution for different keys', async () => {
        const serializer = new MutationSerializer();
        const order: string[] = [];

        const p1 = serializer.serialize('delete', async () => {
            await new Promise(r => setTimeout(r, 50));
            order.push('delete');
        });

        const p2 = serializer.serialize('refund', async () => {
            // No delay — should complete before delete
            order.push('refund');
        });

        await Promise.all([p1, p2]);

        // refund should complete first (no delay, different key)
        expect(order[0]).toBe('refund');
        expect(order[1]).toBe('delete');
    });
});

describe('MutationSerializer: Error Recovery', () => {
    it('should release lock when fn throws', async () => {
        const serializer = new MutationSerializer();

        // First call throws
        try {
            await serializer.serialize('delete', async () => {
                throw new Error('boom');
            });
        } catch { /* expected */ }

        // Second call should NOT be blocked
        const result = await serializer.serialize('delete', async () => 'recovered');
        expect(result).toBe('recovered');
    });

    it('should propagate errors from fn', async () => {
        const serializer = new MutationSerializer();

        await expect(
            serializer.serialize('delete', async () => {
                throw new Error('handler crash');
            }),
        ).rejects.toThrow('handler crash');
    });
});

describe('MutationSerializer: AbortSignal', () => {
    it('should reject queued waiter when signal fires', async () => {
        const serializer = new MutationSerializer();
        const controller = new AbortController();

        // First call occupies the key
        const p1 = serializer.serialize('delete', async () => {
            await new Promise(r => setTimeout(r, 100));
            return 'first';
        });

        // Second call queued — abort after 10ms
        setTimeout(() => controller.abort(), 10);
        const p2 = serializer.serialize('delete', async () => 'never', controller.signal);

        await expect(p2).rejects.toThrow('cancelled');
        const r1 = await p1;
        expect(r1).toBe('first');
    });
});

describe('MutationSerializer: Chain GC', () => {
    it('should clean up completed chains', async () => {
        const serializer = new MutationSerializer();

        await serializer.serialize('delete', async () => 'done');
        expect(serializer.activeChains).toBe(0);
    });

    it('should track active chains during execution', async () => {
        const serializer = new MutationSerializer();

        const p = serializer.serialize('delete', async () => {
            expect(serializer.activeChains).toBe(1);
            return 'running';
        });

        await p;
        expect(serializer.activeChains).toBe(0);
    });
});

// ============================================================================
// Integration Tests: Builder + MutationSerializer
// ============================================================================

describe('Builder Integration: Auto MutationSerializer', () => {
    it('should serialize concurrent destructive calls', async () => {
        const order: number[] = [];

        const tool = createTool<void>('users')
            .action({
                name: 'delete',
                destructive: true,
                handler: async () => {
                    const idx = order.length + 1;
                    await new Promise(r => setTimeout(r, 30));
                    order.push(idx);
                    return success(`deleted ${idx}`);
                },
            })
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success('user list'),
            });

        // Fire 3 concurrent deletes
        const p1 = tool.execute(undefined, { action: 'delete' });
        const p2 = tool.execute(undefined, { action: 'delete' });
        const p3 = tool.execute(undefined, { action: 'delete' });

        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

        // All should succeed
        expect(r1.isError).toBeUndefined();
        expect(r2.isError).toBeUndefined();
        expect(r3.isError).toBeUndefined();

        // FIFO order enforced
        expect(order).toEqual([1, 2, 3]);
    });

    it('should NOT serialize non-destructive actions', async () => {
        const order: string[] = [];

        const tool = createTool<void>('users')
            .action({
                name: 'delete',
                destructive: true,
                handler: async () => {
                    await new Promise(r => setTimeout(r, 50));
                    order.push('delete');
                    return success('deleted');
                },
            })
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => {
                    order.push('list');
                    return success('listed');
                },
            });

        // Fire delete (slow) and list (fast) concurrently
        const p1 = tool.execute(undefined, { action: 'delete' });
        const p2 = tool.execute(undefined, { action: 'list' });

        await Promise.all([p1, p2]);

        // list should complete first (not serialized, no delay)
        expect(order[0]).toBe('list');
        expect(order[1]).toBe('delete');
    });

    it('should NOT create serializer when no destructive actions exist', async () => {
        const tool = createTool<void>('readonly')
            .action({
                name: 'list',
                readOnly: true,
                handler: async () => success('fast'),
            });

        // Execute normally — zero overhead
        const result = await tool.execute(undefined, { action: 'list' });
        expect((result.content[0] as { text: string }).text).toBe('fast');
    });

    it('should release lock when handler throws', async () => {
        let callCount = 0;

        const tool = createTool<void>('crasher')
            .action({
                name: 'nuke',
                destructive: true,
                handler: async () => {
                    callCount++;
                    if (callCount === 1) throw new Error('db down');
                    return success('nuked');
                },
            });

        // First call crashes
        const r1 = await tool.execute(undefined, { action: 'nuke' });
        expect(r1.isError).toBe(true);

        // Second call should NOT be blocked by the dead lock
        const r2 = await tool.execute(undefined, { action: 'nuke' });
        expect(r2.isError).toBeUndefined();
        expect((r2.content[0] as { text: string }).text).toBe('nuked');
    });

    it('should work with ConcurrencyGuard + MutationSerializer combined', async () => {
        const order: number[] = [];

        const tool = createTool<void>('billing')
            .concurrency({ maxActive: 3, maxQueue: 10 })
            .action({
                name: 'refund',
                destructive: true,
                handler: async () => {
                    const idx = order.length + 1;
                    await new Promise(r => setTimeout(r, 20));
                    order.push(idx);
                    return success(`refunded ${idx}`);
                },
            });

        // Fire 3 concurrent refunds
        // ConcurrencyGuard allows all 3, but MutationSerializer serializes them
        const [r1, r2, r3] = await Promise.all([
            tool.execute(undefined, { action: 'refund' }),
            tool.execute(undefined, { action: 'refund' }),
            tool.execute(undefined, { action: 'refund' }),
        ]);

        expect(r1.isError).toBeUndefined();
        expect(r2.isError).toBeUndefined();
        expect(r3.isError).toBeUndefined();
        expect(order).toEqual([1, 2, 3]);
    });

    it('should cancel queued mutation when AbortSignal fires', async () => {
        const controller = new AbortController();

        const tool = createTool<void>('admin')
            .action({
                name: 'ban',
                destructive: true,
                handler: async () => {
                    await new Promise(r => setTimeout(r, 100));
                    return success('banned');
                },
            });

        // First call occupies the mutex
        const first = tool.execute(undefined, { action: 'ban' });

        // Second call queued — abort it
        setTimeout(() => controller.abort(), 10);
        const second = await tool.execute(
            undefined,
            { action: 'ban' },
            undefined,
            controller.signal,
        );

        expect(second.isError).toBe(true);
        const text = (second.content[0] as { text: string }).text;
        expect(text).toContain('cancelled');

        // First still completes
        const firstResult = await first;
        expect(firstResult.isError).toBeUndefined();
    });
});

// ============================================================================
// Extended Coverage
// ============================================================================

describe('MutationSerializer: distinct keys are independent', () => {
    it('chains for different keys are tracked independently', async () => {
        const serializer = new MutationSerializer();
        const timeline: string[] = [];

        // key-A has a slow op, key-B is fast — they must not block each other
        const pA = serializer.serialize('delete-user', async () => {
            await new Promise(r => setTimeout(r, 60));
            timeline.push('A');
        });

        const pB = serializer.serialize('delete-org', async () => {
            timeline.push('B');
        });

        await Promise.all([pA, pB]);

        // B should finish first (no delay, separate chain)
        expect(timeline[0]).toBe('B');
        expect(timeline[1]).toBe('A');
    });

    it('GC of key-A does not affect key-B chain', async () => {
        const serializer = new MutationSerializer();

        await serializer.serialize('key-a', async () => 'a-done');
        // After GC, key-a is gone
        expect(serializer.activeChains).toBe(0);

        // key-b should still work correctly
        const result = await serializer.serialize('key-b', async () => 'b-done');
        expect(result).toBe('b-done');
        expect(serializer.activeChains).toBe(0);
    });

    it('error in key-A does not block key-B', async () => {
        const serializer = new MutationSerializer();

        try {
            await serializer.serialize('key-a', async () => { throw new Error('A failed'); });
        } catch { /* expected */ }

        const result = await serializer.serialize('key-b', async () => 'b-ok');
        expect(result).toBe('b-ok');
        expect(serializer.activeChains).toBe(0);
    });
});

describe('MutationSerializer: AbortSignal while fn is running', () => {
    it('aborting signal while fn IS running does not cancel the running call', async () => {
        const serializer = new MutationSerializer();
        const controller = new AbortController();

        let fnStarted = false;
        let fnCompleted = false;

        // This fn is already running — abort won't cancel it
        const p = serializer.serialize(
            'the-key',
            async () => {
                fnStarted = true;
                await new Promise(r => setTimeout(r, 50));
                fnCompleted = true;
                return 'done';
            },
            controller.signal,
        );

        // Wait until fn has started
        await new Promise(r => setTimeout(r, 10));
        expect(fnStarted).toBe(true);

        // Abort while it's running
        controller.abort();

        const result = await p;
        // Running fn completes despite abort (only QUEUED waiters are aborted)
        expect(fnCompleted).toBe(true);
        expect(result).toBe('done');
    });
});

describe('MutationSerializer: sequential calls after abort', () => {
    it('after a queued call is aborted, subsequent calls succeed normally', async () => {
        const serializer = new MutationSerializer();
        const controller = new AbortController();

        // First call occupies the chain
        const p1 = serializer.serialize('action', async () => {
            await new Promise(r => setTimeout(r, 60));
            return 'first';
        });

        // Second call queued and aborted
        setTimeout(() => controller.abort(), 10);
        const p2 = serializer.serialize('action', async () => 'aborted-fn', controller.signal);
        await expect(p2).rejects.toThrow('cancelled');

        // Third call (no abort) should succeed after p1 finishes
        const p3 = serializer.serialize('action', async () => 'third');
        await p1;
        const r3 = await p3;
        expect(r3).toBe('third');
    });
});
