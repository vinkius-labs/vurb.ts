/**
 * A2AHandler — JSON-RPC 2.0 dispatch for A2A protocol operations.
 *
 * Bridges incoming A2A `message/send` requests to MCP tool executions,
 * translating structured A2A messages into MCP tool calls and returning
 * results as A2A Tasks with Artifacts.
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

import { A2A_METHODS, A2A_ERROR_CODES } from './constants.js';
import { TaskManager } from './TaskManager.js';
import { resolveSkillId, extractMessageArgs } from './message-utils.js';
import type {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcError,
    Task,
    Message,
    MessageSendParams,
    TaskQueryParams,
    TaskIdParams,
    ListTasksRequest,
    ListTasksResponse,
    Artifact,
    A2ABridgeConfig,
} from './types.js';

// ── Duck-typed MCP executor ──────────────────────────────

/**
 * Minimal interface for executing MCP tool calls.
 * Decoupled from internal registry types to prevent circular dependencies.
 */
export interface ToolExecutorLike {
    /**
     * Execute a tool by name with the given arguments.
     * Returns an MCP-compliant ToolCallResult.
     */
    execute(
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;

    /** Check if a tool exists by name. */
    hasToolName(name: string): boolean;
}

// ── Handler ──────────────────────────────────────────────

export interface A2AHandlerConfig {
    readonly bridge?: A2ABridgeConfig;
}

export const A2A_LIST_TASKS_METHOD = 'tasks/list' as const;

export const A2A_METHODS_INTERNAL = {
    TASKS_LIST: A2A_LIST_TASKS_METHOD,
} as const;

/**
 * JSON-RPC 2.0 handler for A2A protocol operations.
 *
 * Handles:
 * - `message/send` — Route message to MCP tool, return task with result
 * - `tasks/get` — Retrieve task by ID
 * - `tasks/cancel` — Cancel a running task
 * - `tasks/list` — List tasks with filtering and pagination
 * - `tasks/resubscribe` — Resume streaming (placeholder)
 * - `tasks/pushNotificationConfig/*` — Push notification management
 * - `agent/getAuthenticatedExtendedCard` — Extended card
 */
export class A2AHandler {
    private readonly _taskManager: TaskManager;
    private readonly _executor: ToolExecutorLike | undefined;

    constructor(executor?: ToolExecutorLike, config?: A2AHandlerConfig) {
        this._executor = executor;
        const tmConfig: Record<string, number> = {};
        if (config?.bridge?.taskTtlMs !== undefined) tmConfig['taskTtlMs'] = config.bridge.taskTtlMs;
        if (config?.bridge?.maxTasks !== undefined) tmConfig['maxTasks'] = config.bridge.maxTasks;
        this._taskManager = new TaskManager(tmConfig);
    }

    /** Process a JSON-RPC 2.0 request and return a response. */
    async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        if (request.jsonrpc !== '2.0') {
            return this._errorResponse(
                request.id,
                A2A_ERROR_CODES.INVALID_REQUEST,
                'Invalid JSON-RPC version. Expected "2.0".',
            );
        }

        switch (request.method) {
            case A2A_METHODS.MESSAGE_SEND:
                return this._handleMessageSend(request);

            case A2A_METHODS.TASKS_GET:
                return this._handleTasksGet(request);

            case A2A_METHODS.TASKS_CANCEL:
                return this._handleTasksCancel(request);

            case A2A_METHODS_INTERNAL.TASKS_LIST:
                return this._handleTasksList(request);

            case A2A_METHODS.MESSAGE_STREAM:
                return this._errorResponse(
                    request.id,
                    A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
                    'Streaming via message/stream requires StreamableHttpTransport. Use message/send for synchronous requests or wrap this handler with StreamableHttpTransport for SSE streaming.',
                );

            case A2A_METHODS.TASKS_RESUBSCRIBE:
                return this._errorResponse(
                    request.id,
                    A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
                    'Task resubscription requires StreamableHttpTransport for SSE streaming.',
                );

            case A2A_METHODS.PUSH_NOTIFICATION_SET:
            case A2A_METHODS.PUSH_NOTIFICATION_GET:
            case A2A_METHODS.PUSH_NOTIFICATION_LIST:
            case A2A_METHODS.PUSH_NOTIFICATION_DELETE:
                return this._errorResponse(
                    request.id,
                    A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED,
                    'Push notifications are not supported by this agent.',
                );

            case A2A_METHODS.GET_AUTHENTICATED_EXTENDED_CARD:
                return this._errorResponse(
                    request.id,
                    A2A_ERROR_CODES.AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED,
                    'Authenticated Extended Card is not configured.',
                );

            default:
                return this._errorResponse(
                    request.id,
                    A2A_ERROR_CODES.METHOD_NOT_FOUND,
                    `Method "${request.method}" is not supported.`,
                );
        }
    }

    /** Access the task manager for direct inspection. */
    get taskManager(): TaskManager {
        return this._taskManager;
    }

    // ── Method Handlers ──────────────────────────────────

    private async _handleMessageSend(
        request: JsonRpcRequest,
    ): Promise<JsonRpcResponse> {
        const params = request.params as MessageSendParams | undefined;
        if (!params?.message) {
            return this._errorResponse(
                request.id,
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required parameter: "message".',
            );
        }

        const { message } = params;

        // Validate message has kind discriminator
        if (message.kind !== 'message') {
            return this._errorResponse(
                request.id,
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Message must have kind: "message".',
            );
        }

        const contextId = message.contextId ?? this._generateContextId();

        // Create task in `submitted` state
        const task = this._taskManager.createTask(contextId, message);

        // If no executor, return the task in submitted state
        if (!this._executor) {
            return this._successResponse(request.id, task);
        }

        // Transition to `working`
        this._taskManager.updateStatus(task.id, 'working');

        try {
            // Resolve which tool to call
            const skillId = resolveSkillId(message);
            const args = extractMessageArgs(message);

            if (!skillId) {
                const failedTask = this._taskManager.updateStatus(
                    task.id,
                    'failed',
                    this._createAgentMessage(
                        'Unable to determine which skill to invoke. Include a skill_id in message metadata or send a text message matching a tool name.',
                    ),
                );
                return this._successResponse(request.id, failedTask ?? task);
            }

            if (!this._executor.hasToolName(skillId)) {
                const failedTask = this._taskManager.updateStatus(
                    task.id,
                    'failed',
                    this._createAgentMessage(
                        `Skill "${skillId}" not found. Check the Agent Card for available skills.`,
                    ),
                );
                return this._successResponse(request.id, failedTask ?? task);
            }

            // Execute the MCP tool
            const result = await this._executor.execute(skillId, args);

            // Create artifact from tool result
            const artifact: Artifact = {
                artifactId: `${task.id}-result`,
                name: `${skillId} result`,
                parts: result.content.map((c) => {
                    if (c.text !== undefined) {
                        return { kind: 'text' as const, text: c.text };
                    }
                    // Non-text content (image, resource, etc.): preserve as DataPart
                    return {
                        kind: 'data' as const,
                        data: { contentType: c.type },
                    };
                }),
            };

            this._taskManager.addArtifact(task.id, artifact);

            // Determine final state
            const finalState = result.isError ? 'failed' : 'completed';
            const finalMessage = this._createAgentMessage(
                result.content.map((c) => c.text ?? '').join('\n'),
            );

            const completedTask = this._taskManager.updateStatus(
                task.id,
                finalState,
                finalMessage,
            );

            return this._successResponse(request.id, completedTask ?? task);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const failedTask = this._taskManager.updateStatus(
                task.id,
                'failed',
                this._createAgentMessage(`Internal error: ${errorMessage}`),
            );
            return this._successResponse(request.id, failedTask ?? task);
        }
    }

    private _handleTasksGet(
        request: JsonRpcRequest,
    ): Promise<JsonRpcResponse> {
        const params = request.params as TaskQueryParams | undefined;
        if (!params?.id) {
            return Promise.resolve(this._errorResponse(
                request.id,
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required parameter: "id".',
            ));
        }

        const task = this._taskManager.getTask(params.id);
        if (!task) {
            return Promise.resolve(this._errorResponse(
                request.id,
                A2A_ERROR_CODES.TASK_NOT_FOUND,
                `Task "${params.id}" not found.`,
            ));
        }

        return Promise.resolve(this._successResponse(request.id, task));
    }

    private _handleTasksCancel(
        request: JsonRpcRequest,
    ): Promise<JsonRpcResponse> {
        const params = request.params as TaskIdParams | undefined;
        if (!params?.id) {
            return Promise.resolve(this._errorResponse(
                request.id,
                A2A_ERROR_CODES.INVALID_PARAMS,
                'Missing required parameter: "id".',
            ));
        }

        const task = this._taskManager.cancelTask(params.id);
        if (!task) {
            return Promise.resolve(this._errorResponse(
                request.id,
                A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
                `Task "${params.id}" cannot be canceled (not found or already in terminal state).`,
            ));
        }

        return Promise.resolve(this._successResponse(request.id, task));
    }

    private _handleTasksList(
        request: JsonRpcRequest,
    ): Promise<JsonRpcResponse> {
        const params = (request.params ?? {}) as ListTasksRequest;
        const result: ListTasksResponse = this._taskManager.listTasks(params);
        return Promise.resolve(this._successResponse(request.id, result));
    }



    // ── Message Factory ──────────────────────────────────

    /**
     * Create a spec-compliant agent Message with required `kind` and `messageId`.
     */
    private _createAgentMessage(text: string): Message {
        return {
            kind: 'message',
            messageId: this._generateMessageId(),
            role: 'agent',
            parts: [{ kind: 'text', text }],
        };
    }

    // ── Response Helpers ─────────────────────────────────

    private _successResponse<T>(
        id: string | number,
        result: T,
    ): JsonRpcResponse<T> {
        return { jsonrpc: '2.0', id, result };
    }

    private _errorResponse(
        id: string | number,
        code: number,
        message: string,
        data?: Record<string, unknown>,
    ): JsonRpcResponse {
        const error: JsonRpcError = { code, message, ...(data !== undefined ? { data } : {}) };
        return { jsonrpc: '2.0', id, error };
    }

    private _generateContextId(): string {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    private _generateMessageId(): string {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
    }
}
