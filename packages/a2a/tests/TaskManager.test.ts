import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../src/index.js';
import type { Message } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────

function makeMessage(text: string, role: 'user' | 'agent' = 'user'): Message {
    return {
        kind: 'message',
        messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        parts: [{ kind: 'text', text }],
    };
}

describe('TaskManager', () => {
    let tm: TaskManager;

    beforeEach(() => {
        tm = new TaskManager();
    });

    // ── Task Creation ────────────────────────────────────

    describe('createTask', () => {
        it('creates a task in submitted state with kind discriminator', () => {
            const task = tm.createTask('ctx-1');

            expect(task.kind).toBe('task');
            expect(task.id).toBeDefined();
            expect(task.contextId).toBe('ctx-1');
            expect(task.status.state).toBe('submitted');
            expect(task.status.timestamp).toBeDefined();
        });

        it('creates tasks with unique IDs', () => {
            const t1 = tm.createTask('ctx-1');
            const t2 = tm.createTask('ctx-1');

            expect(t1.id).not.toBe(t2.id);
        });

        it('attaches initial message to history', () => {
            const msg = makeMessage('Hello');
            const task = tm.createTask('ctx-1', msg);

            expect(task.history).toHaveLength(1);
            expect(task.history![0].parts[0]).toEqual({ kind: 'text', text: 'Hello' });
            expect(task.history![0].kind).toBe('message');
            expect(task.history![0].messageId).toBeDefined();
        });

        it('creates task without history when no message', () => {
            const task = tm.createTask('ctx-1');
            expect(task.history).toBeUndefined();
        });
    });

    // ── State Transitions ────────────────────────────────

    describe('updateStatus', () => {
        it('transitions from submitted to working', () => {
            const task = tm.createTask('ctx-1');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated).toBeDefined();
            expect(updated!.status.state).toBe('working');
        });

        it('transitions from working to completed', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'working');
            const updated = tm.updateStatus(task.id, 'completed');

            expect(updated!.status.state).toBe('completed');
        });

        it('transitions from working to failed', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'working');
            const updated = tm.updateStatus(task.id, 'failed');

            expect(updated!.status.state).toBe('failed');
        });

        it('transitions from working to input-required', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'working');
            const updated = tm.updateStatus(task.id, 'input-required');

            expect(updated!.status.state).toBe('input-required');
        });

        it('prevents transition from completed (terminal)', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'completed');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated).toBeUndefined();
        });

        it('prevents transition from failed (terminal)', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'failed');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated).toBeUndefined();
        });

        it('prevents transition from canceled (terminal)', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'canceled');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated).toBeUndefined();
        });

        it('prevents transition from rejected (terminal)', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'rejected');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated).toBeUndefined();
        });

        it('returns undefined for non-existent task', () => {
            const updated = tm.updateStatus('non-existent', 'working');
            expect(updated).toBeUndefined();
        });

        it('appends message to history on transition', () => {
            const task = tm.createTask('ctx-1');
            const msg = makeMessage('Working...', 'agent');
            const updated = tm.updateStatus(task.id, 'working', msg);

            expect(updated!.history).toHaveLength(1);
            expect(updated!.history![0].role).toBe('agent');
            expect(updated!.history![0].kind).toBe('message');
        });

        it('updates the timestamp on transition', () => {
            const task = tm.createTask('ctx-1');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated!.status.timestamp).toBeDefined();
        });

        it('preserves kind discriminator after updates', () => {
            const task = tm.createTask('ctx-1');
            const updated = tm.updateStatus(task.id, 'working');

            expect(updated!.kind).toBe('task');
        });
    });

    // ── Artifacts ────────────────────────────────────────

    describe('addArtifact', () => {
        it('appends an artifact to a task', () => {
            const task = tm.createTask('ctx-1');
            const artifact = {
                artifactId: 'a1',
                name: 'result',
                parts: [{ kind: 'text' as const, text: 'data' }],
            };
            const updated = tm.addArtifact(task.id, artifact);

            expect(updated!.artifacts).toHaveLength(1);
            expect(updated!.artifacts![0].artifactId).toBe('a1');
        });

        it('appends multiple artifacts', () => {
            const task = tm.createTask('ctx-1');
            tm.addArtifact(task.id, { artifactId: 'a1', parts: [] });
            const updated = tm.addArtifact(task.id, { artifactId: 'a2', parts: [] });

            expect(updated!.artifacts).toHaveLength(2);
        });

        it('returns undefined for non-existent task', () => {
            const result = tm.addArtifact('no-task', { artifactId: 'a1', parts: [] });
            expect(result).toBeUndefined();
        });
    });

    // ── Queries ──────────────────────────────────────────

    describe('getTask', () => {
        it('retrieves a task by ID', () => {
            const task = tm.createTask('ctx-1');
            const found = tm.getTask(task.id);

            expect(found).toBeDefined();
            expect(found!.id).toBe(task.id);
        });

        it('returns undefined for non-existent ID', () => {
            expect(tm.getTask('no-task')).toBeUndefined();
        });
    });

    describe('listTasks', () => {
        it('lists all tasks', () => {
            tm.createTask('ctx-1');
            tm.createTask('ctx-2');

            const result = tm.listTasks({});
            expect(result.tasks).toHaveLength(2);
        });

        it('filters by contextId', () => {
            tm.createTask('ctx-1');
            tm.createTask('ctx-2');
            tm.createTask('ctx-1');

            const result = tm.listTasks({ contextId: 'ctx-1' });
            expect(result.tasks).toHaveLength(2);
        });

        it('filters by taskState', () => {
            const t1 = tm.createTask('ctx-1');
            tm.createTask('ctx-1');
            tm.updateStatus(t1.id, 'completed');

            const result = tm.listTasks({ taskState: 'completed' });
            expect(result.tasks).toHaveLength(1);
            expect(result.tasks[0].status.state).toBe('completed');
        });

        it('paginates results', () => {
            for (let i = 0; i < 5; i++) tm.createTask(`ctx-${i}`);

            const page1 = tm.listTasks({ limit: 2 });
            expect(page1.tasks).toHaveLength(2);
            expect(page1.nextCursor).toBeDefined();

            const page2 = tm.listTasks({ limit: 2, cursor: page1.nextCursor });
            expect(page2.tasks).toHaveLength(2);
        });

        it('returns empty for no matches', () => {
            const result = tm.listTasks({ contextId: 'non-existent' });
            expect(result.tasks).toHaveLength(0);
            expect(result.nextCursor).toBeUndefined();
        });
    });

    // ── Cancel ───────────────────────────────────────────

    describe('cancelTask', () => {
        it('cancels a submitted task', () => {
            const task = tm.createTask('ctx-1');
            const canceled = tm.cancelTask(task.id);

            expect(canceled).toBeDefined();
            expect(canceled!.status.state).toBe('canceled');
        });

        it('cancels a working task', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'working');
            const canceled = tm.cancelTask(task.id);

            expect(canceled!.status.state).toBe('canceled');
        });

        it('returns undefined for already completed task', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'completed');
            const canceled = tm.cancelTask(task.id);

            expect(canceled).toBeUndefined();
        });

        it('returns undefined for non-existent task', () => {
            expect(tm.cancelTask('no-task')).toBeUndefined();
        });
    });

    // ── TTL Eviction ─────────────────────────────────────

    describe('TTL eviction', () => {
        it('evicts expired tasks on getTask', () => {
            const shortTtl = new TaskManager({ taskTtlMs: 1 });
            const task = shortTtl.createTask('ctx-1');

            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    const found = shortTtl.getTask(task.id);
                    expect(found).toBeUndefined();
                    resolve();
                }, 10);
            });
        });
    });

    // ── Capacity ─────────────────────────────────────────

    describe('capacity management', () => {
        it('evicts oldest when max capacity is reached', () => {
            const small = new TaskManager({ maxTasks: 3 });
            const t1 = small.createTask('ctx-1');
            small.createTask('ctx-2');
            small.createTask('ctx-3');

            // This should trigger eviction
            small.createTask('ctx-4');

            // Oldest (t1) should be evicted
            expect(small.getTask(t1.id)).toBeUndefined();
        });

        it('reports correct size', () => {
            tm.createTask('ctx-1');
            tm.createTask('ctx-2');
            expect(tm.size).toBe(2);
        });
    });

    // ── Adversarial ──────────────────────────────────────

    describe('adversarial inputs', () => {
        it('handles empty contextId', () => {
            const task = tm.createTask('');
            expect(task.contextId).toBe('');
        });

        it('handles unicode contextId', () => {
            const task = tm.createTask('上下文-123');
            expect(task.contextId).toBe('上下文-123');
        });

        it('handles concurrent state updates to same task', () => {
            const task = tm.createTask('ctx-1');
            tm.updateStatus(task.id, 'working');
            tm.updateStatus(task.id, 'completed');
            const result = tm.updateStatus(task.id, 'failed');

            // Terminal state — should fail
            expect(result).toBeUndefined();
            expect(tm.getTask(task.id)!.status.state).toBe('completed');
        });
    });
});
