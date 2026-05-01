/**
 * TaskManager — In-memory task lifecycle management.
 *
 * Manages A2A task creation, state transitions, TTL-based eviction,
 * and capacity limits. Tasks flow through the A2A state machine:
 * submitted → working → completed | failed | canceled | input-required
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

import type {
    Task,
    TaskState,
    TaskStatus,
    Artifact,
    Message,
    ListTasksRequest,
    ListTasksResponse,
} from './types.js';

export interface TaskManagerConfig {
    /** Task TTL in milliseconds. Default: 3600000 (1 hour). */
    readonly taskTtlMs?: number;
    /** Maximum stored tasks. Default: 10000. */
    readonly maxTasks?: number;
}

interface StoredTask {
    task: Task;
    createdAt: number;
    updatedAt: number;
}

const DEFAULT_TTL = 3_600_000;    // 1 hour
const DEFAULT_MAX = 10_000;

/** Terminal states that cannot transition further. */
const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
    'completed', 'failed', 'canceled', 'rejected',
]);

/**
 * In-memory task store with lifecycle management.
 */
export class TaskManager {
    private readonly _tasks = new Map<string, StoredTask>();
    private readonly _ttl: number;
    private readonly _max: number;

    constructor(config?: TaskManagerConfig) {
        this._ttl = config?.taskTtlMs ?? DEFAULT_TTL;
        this._max = config?.maxTasks ?? DEFAULT_MAX;
    }

    // ── Task Creation ────────────────────────────────────

    /**
     * Create a new task from an incoming message.
     * Generates a unique ID and sets initial state to `submitted`.
     */
    createTask(contextId: string, message?: Message): Task {
        this._evictExpired();

        // Enforce capacity
        if (this._tasks.size >= this._max) {
            this._evictOldest();
        }

        const now = Date.now();
        const id = this._generateId();
        const task: Task = {
            kind: 'task',
            id,
            contextId,
            status: {
                state: 'submitted',
                timestamp: new Date(now).toISOString(),
            },
            ...(message ? { history: [message] } : {}),
        };

        this._tasks.set(id, { task, createdAt: now, updatedAt: now });
        return task;
    }

    // ── State Transitions ────────────────────────────────

    /**
     * Transition a task to a new state.
     * Returns the updated task, or `undefined` if the task doesn't exist
     * or the transition is invalid (terminal state).
     */
    updateStatus(
        taskId: string,
        state: TaskState,
        message?: Message,
    ): Task | undefined {
        const stored = this._tasks.get(taskId);
        if (!stored) return undefined;

        // Cannot transition from terminal states
        if (TERMINAL_STATES.has(stored.task.status.state)) {
            return undefined;
        }

        const now = Date.now();
        const newStatus: TaskStatus = {
            state,
            ...(message ? { message } : {}),
            timestamp: new Date(now).toISOString(),
        };

        const history = stored.task.history ?? [];
        const updatedTask: Task = {
            ...stored.task,
            status: newStatus,
            ...(message ? { history: [...history, message] } : { history }),
        };

        stored.task = updatedTask;
        stored.updatedAt = now;
        return updatedTask;
    }

    // ── Artifacts ────────────────────────────────────────

    /**
     * Append an artifact to a task.
     */
    addArtifact(taskId: string, artifact: Artifact): Task | undefined {
        const stored = this._tasks.get(taskId);
        if (!stored) return undefined;

        const now = Date.now();
        const updatedTask: Task = {
            ...stored.task,
            artifacts: [...(stored.task.artifacts ?? []), artifact],
        };

        stored.task = updatedTask;
        stored.updatedAt = now;
        return updatedTask;
    }

    // ── Queries ──────────────────────────────────────────

    /**
     * Get a task by ID.
     */
    getTask(taskId: string): Task | undefined {
        const stored = this._tasks.get(taskId);
        if (!stored) return undefined;
        if (this._isExpired(stored)) {
            this._tasks.delete(taskId);
            return undefined;
        }
        return stored.task;
    }

    /**
     * List tasks with optional filters and pagination.
     */
    listTasks(request: ListTasksRequest): ListTasksResponse {
        this._evictExpired();

        let tasks = [...this._tasks.values()]
            .map((s) => s.task);

        // Filter by contextId
        if (request.contextId) {
            tasks = tasks.filter((t) => t.contextId === request.contextId);
        }

        // Filter by state
        if (request.taskState) {
            tasks = tasks.filter((t) => t.status.state === request.taskState);
        }

        // Sort by status timestamp (newest first)
        tasks.sort((a, b) => {
            const ta = a.status.timestamp ? new Date(a.status.timestamp).getTime() : 0;
            const tb = b.status.timestamp ? new Date(b.status.timestamp).getTime() : 0;
            return tb - ta;
        });

        // Pagination
        const limit = request.limit ?? 50;
        const rawOffset = request.cursor ? parseInt(request.cursor, 10) : 0;
        const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
        const page = tasks.slice(offset, offset + limit);
        const hasMore = offset + limit < tasks.length;

        return {
            tasks: page,
            ...(hasMore ? { nextCursor: String(offset + limit) } : {}),
        };
    }

    /**
     * Cancel a task. Returns the updated task or `undefined`.
     */
    cancelTask(taskId: string): Task | undefined {
        return this.updateStatus(taskId, 'canceled');
    }

    // ── Capacity ─────────────────────────────────────────

    /** Number of currently stored tasks. */
    get size(): number {
        return this._tasks.size;
    }

    // ── Internal ─────────────────────────────────────────

    private _generateId(): string {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    private _isExpired(stored: StoredTask): boolean {
        return Date.now() - stored.createdAt > this._ttl;
    }

    private _evictExpired(): void {
        const now = Date.now();
        for (const [id, stored] of this._tasks) {
            if (now - stored.createdAt > this._ttl) {
                this._tasks.delete(id);
            }
        }
    }

    private _evictOldest(): void {
        const toEvict = Math.ceil(this._max * 0.1);
        const entries = [...this._tasks.entries()]
            .sort((a, b) => a[1].createdAt - b[1].createdAt);

        for (let i = 0; i < toEvict && i < entries.length; i++) {
            this._tasks.delete(entries[i]![0]);
        }
    }
}
