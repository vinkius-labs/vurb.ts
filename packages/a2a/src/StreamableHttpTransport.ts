/**
 * Streamable HTTP Transport for A2A Protocol.
 *
 * Provides a framework-agnostic HTTP transport layer that supports both
 * synchronous JSON-RPC responses and SSE streaming — mirroring the
 * architecture of the official a2a-js SDK's transport handlers.
 *
 * This module implements two key patterns from the specification:
 * 1. **JSON-RPC Transport** — Single POST endpoint handling all A2A methods,
 *    returning either a JSON response or an SSE event stream.
 * 2. **Streamable HTTP** — The modern HTTP transport where streaming
 *    methods (`message/stream`, `tasks/resubscribe`) upgrade the response
 *    to SSE inline, without requiring a separate SSE endpoint.
 *
 * Usage with any HTTP framework:
 * ```ts
 * const transport = new StreamableHttpTransport(handler);
 * // In your Express/Hono/Fastify route handler:
 * const result = await transport.handle(requestBody);
 * if (result.streaming) {
 *   // Write SSE headers, pipe events, close on done
 *   setHeaders(res, result.headers);
 *   for await (const chunk of result.body) {
 *     res.write(chunk);
 *   }
 *   res.end();
 * } else {
 *   res.json(result.body);
 * }
 * ```
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

import { A2AHandler } from './A2AHandler.js';
import { A2A_METHODS, A2A_ERROR_CODES } from './constants.js';
import { SSE_HEADERS, formatSSEEvent, formatSSEErrorEvent } from './sse.js';
import type {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcError,
    MessageSendParams,
    TaskIdParams,
    TaskUpdateEvent,
} from './types.js';

// ── Streaming Executor Interface ─────────────────────────

/**
 * Interface for executors that support streaming tool results.
 * When the executor implements this, `message/stream` will yield
 * incremental updates via SSE.
 */
export interface StreamingExecutorLike {
    /**
     * Execute a tool and yield streaming events (status updates, artifact chunks).
     * The final event should have `final: true` to signal stream completion.
     */
    executeStream(
        toolName: string,
        args: Record<string, unknown>,
    ): AsyncGenerator<TaskUpdateEvent, void, undefined>;
}

// ── Transport Result Types ───────────────────────────────

/**
 * A synchronous JSON response from the transport.
 */
export interface SyncTransportResult {
    readonly streaming: false;
    readonly body: JsonRpcResponse;
}

/**
 * A streaming SSE response from the transport.
 * The `body` is an async iterable of pre-formatted SSE event strings.
 */
export interface StreamTransportResult {
    readonly streaming: true;
    readonly headers: Record<string, string>;
    readonly body: AsyncIterable<string>;
}

/**
 * Discriminated union of transport results.
 * Consumers check `result.streaming` to determine how to write the response.
 */
export type TransportResult = SyncTransportResult | StreamTransportResult;

// ── Streamable HTTP Transport ────────────────────────────

/**
 * Framework-agnostic HTTP transport for A2A JSON-RPC.
 *
 * Handles the core protocol logic of deciding whether a request should
 * return a single JSON response or an SSE event stream. This mirrors
 * the official `JsonRpcTransportHandler` from the a2a-js SDK.
 */
export class StreamableHttpTransport {
    private readonly _handler: A2AHandler;
    private readonly _streamingExecutor: StreamingExecutorLike | undefined;

    constructor(
        handler: A2AHandler,
        streamingExecutor?: StreamingExecutorLike,
    ) {
        this._handler = handler;
        this._streamingExecutor = streamingExecutor;
    }

    /**
     * Handle an incoming JSON-RPC request body.
     *
     * For `message/stream` and `tasks/resubscribe` methods, returns a
     * streaming result with SSE-formatted events. For all other methods,
     * delegates to the synchronous A2AHandler.
     *
     * @param requestBody - Parsed JSON-RPC request or raw string
     * @returns A `TransportResult` — either sync JSON or streaming SSE
     */
    async handle(requestBody: unknown): Promise<TransportResult> {
        // Parse the request
        let request: JsonRpcRequest;
        try {
            if (typeof requestBody === 'string') {
                request = JSON.parse(requestBody) as JsonRpcRequest;
            } else if (typeof requestBody === 'object' && requestBody !== null) {
                request = requestBody as JsonRpcRequest;
            } else {
                return this._syncError(null, A2A_ERROR_CODES.PARSE_ERROR, 'Invalid request body type.');
            }

            if (request.jsonrpc !== '2.0') {
                return this._syncError(
                    request.id ?? null,
                    A2A_ERROR_CODES.INVALID_REQUEST,
                    'Invalid JSON-RPC version. Expected "2.0".',
                );
            }
        } catch {
            return this._syncError(null, A2A_ERROR_CODES.PARSE_ERROR, 'Failed to parse JSON request.');
        }

        // Check if this is a streaming method
        if (
            request.method === A2A_METHODS.MESSAGE_STREAM ||
            request.method === A2A_METHODS.TASKS_RESUBSCRIBE
        ) {
            return this._handleStreamingMethod(request);
        }

        // Non-streaming: delegate to synchronous handler
        const response = await this._handler.handleRequest(request);
        return { streaming: false, body: response };
    }

    /**
     * Handle streaming methods by returning an SSE event stream.
     *
     * Following the official SDK pattern:
     * - Validates params
     * - Creates an AsyncGenerator that wraps events in JSON-RPC responses
     * - Formats each event as SSE `data:` lines
     */
    private async _handleStreamingMethod(
        request: JsonRpcRequest,
    ): Promise<TransportResult> {
        const { method, id: requestId } = request;

        // For message/stream, we need a streaming executor
        if (method === A2A_METHODS.MESSAGE_STREAM) {
            if (!this._streamingExecutor) {
                // Fallback to sync message/send and return the result as a single-event stream
                const syncResponse = await this._handler.handleRequest({
                    ...request,
                    method: A2A_METHODS.MESSAGE_SEND,
                });

                return {
                    streaming: true,
                    headers: { ...SSE_HEADERS },
                    body: this._singleEventStream(syncResponse),
                };
            }

            // Streaming execution path
            const params = request.params as MessageSendParams | undefined;
            if (!params?.message) {
                return this._syncError(
                    requestId,
                    A2A_ERROR_CODES.INVALID_PARAMS,
                    'Missing required parameter: "message".',
                );
            }

            return {
                streaming: true,
                headers: { ...SSE_HEADERS },
                body: this._createMessageStream(requestId, params),
            };
        }

        // tasks/resubscribe
        if (method === A2A_METHODS.TASKS_RESUBSCRIBE) {
            const params = request.params as TaskIdParams | undefined;
            if (!params?.id) {
                return this._syncError(
                    requestId,
                    A2A_ERROR_CODES.INVALID_PARAMS,
                    'Missing required parameter: "id".',
                );
            }

            // Look up the existing task and stream its current state
            const task = this._handler.taskManager.getTask(params.id);
            if (!task) {
                return this._syncError(
                    requestId,
                    A2A_ERROR_CODES.TASK_NOT_FOUND,
                    `Task "${params.id}" not found.`,
                );
            }

            // Emit current state as a single status-update event
            const statusEvent: TaskUpdateEvent = {
                kind: 'status-update',
                taskId: task.id,
                contextId: task.contextId,
                status: task.status,
                final: ['completed', 'failed', 'canceled', 'rejected'].includes(task.status.state),
            };

            const rpcResponse: JsonRpcResponse = {
                jsonrpc: '2.0',
                id: requestId,
                result: statusEvent,
            };

            return {
                streaming: true,
                headers: { ...SSE_HEADERS },
                body: this._singleEventStream(rpcResponse),
            };
        }

        // Should not reach here
        return this._syncError(
            requestId,
            A2A_ERROR_CODES.METHOD_NOT_FOUND,
            `Method "${method}" is not supported.`,
        );
    }

    /**
     * Creates an SSE event stream for `message/stream`.
     *
     * Mirrors the official SDK's `jsonRpcEventStream` generator pattern:
     * - Resolves the tool and creates a task
     * - Yields TaskStatusUpdateEvents and TaskArtifactUpdateEvents wrapped in JSON-RPC responses
     * - Each event is pre-formatted as SSE `data:` lines
     * - Errors are yielded as SSE `event: error` events
     */
    private async *_createMessageStream(
        requestId: string | number,
        params: MessageSendParams,
    ): AsyncGenerator<string, void, undefined> {
        const { message } = params;
        const contextId = message.contextId ?? this._generateId('ctx');
        const task = this._handler.taskManager.createTask(contextId, message);

        // Yield initial submitted status
        yield formatSSEEvent({
            jsonrpc: '2.0',
            id: requestId,
            result: {
                kind: 'status-update',
                taskId: task.id,
                contextId,
                status: { state: 'submitted', timestamp: new Date().toISOString() },
                final: false,
            } satisfies TaskUpdateEvent,
        });

        // Transition to working
        this._handler.taskManager.updateStatus(task.id, 'working');
        yield formatSSEEvent({
            jsonrpc: '2.0',
            id: requestId,
            result: {
                kind: 'status-update',
                taskId: task.id,
                contextId,
                status: { state: 'working', timestamp: new Date().toISOString() },
                final: false,
            } satisfies TaskUpdateEvent,
        });

        try {
            // Resolve skill
            const skillId = this._resolveSkillIdFromMessage(message);
            if (!skillId) {
                yield* this._yieldFinalError(requestId, task.id, contextId,
                    'Unable to determine which skill to invoke.');
                return;
            }

            // Stream events from the streaming executor
            for await (const event of this._streamingExecutor!.executeStream(skillId, this._extractArgsFromMessage(message))) {
                // Wrap each event in a JSON-RPC response and format as SSE
                yield formatSSEEvent({
                    jsonrpc: '2.0',
                    id: requestId,
                    result: event,
                });

                // If this is a status update, sync the task manager
                if (event.kind === 'status-update') {
                    this._handler.taskManager.updateStatus(task.id, event.status.state, event.status.message);
                } else if (event.kind === 'artifact-update') {
                    this._handler.taskManager.addArtifact(task.id, event.artifact);
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            yield formatSSEErrorEvent({
                jsonrpc: '2.0',
                id: requestId,
                error: { code: A2A_ERROR_CODES.INTERNAL_ERROR, message: `Stream error: ${errorMessage}` },
            });

            // Mark task as failed
            this._handler.taskManager.updateStatus(task.id, 'failed');
        }
    }

    /**
     * Yields a final error status event and marks the task as failed.
     */
    private async *_yieldFinalError(
        requestId: string | number,
        taskId: string,
        contextId: string,
        errorMessage: string,
    ): AsyncGenerator<string, void, undefined> {
        this._handler.taskManager.updateStatus(taskId, 'failed');
        yield formatSSEEvent({
            jsonrpc: '2.0',
            id: requestId,
            result: {
                kind: 'status-update',
                taskId,
                contextId,
                status: {
                    state: 'failed',
                    timestamp: new Date().toISOString(),
                    message: {
                        kind: 'message',
                        messageId: this._generateId('msg'),
                        role: 'agent',
                        parts: [{ kind: 'text', text: errorMessage }],
                    },
                },
                final: true,
            } satisfies TaskUpdateEvent,
        });
    }

    /**
     * Creates a single-event SSE stream from a JSON-RPC response.
     */
    private async *_singleEventStream(
        response: JsonRpcResponse,
    ): AsyncGenerator<string, void, undefined> {
        yield formatSSEEvent(response);
    }

    // ── Sync Error Helper ────────────────────────────────

    private _syncError(
        id: string | number | null,
        code: number,
        message: string,
    ): SyncTransportResult {
        const error: JsonRpcError = { code, message };
        return {
            streaming: false,
            body: { jsonrpc: '2.0', id: id ?? 0, error },
        };
    }

    // ── Message Utilities (duplicated from A2AHandler to avoid exposing internals) ──

    private _resolveSkillIdFromMessage(message: MessageSendParams['message']): string | undefined {
        const metaSkill = message.metadata?.['skill_id'];
        if (typeof metaSkill === 'string' && metaSkill.length > 0) return metaSkill;

        for (const part of message.parts) {
            if (part.kind === 'data' && typeof part.data['tool_name'] === 'string') {
                return part.data['tool_name'];
            }
        }

        for (const part of message.parts) {
            if (part.kind === 'text' && part.text.trim().length > 0) {
                const trimmed = part.text.trim();
                if (!trimmed.includes(' ') || trimmed.length < 64) return trimmed;
            }
        }

        return undefined;
    }

    private _extractArgsFromMessage(message: MessageSendParams['message']): Record<string, unknown> {
        for (const part of message.parts) {
            if (part.kind === 'data') {
                const { tool_name: _, ...args } = part.data;
                return args;
            }
        }
        for (const part of message.parts) {
            if (part.kind === 'text') return { text: part.text };
        }
        return {};
    }

    private _generateId(prefix: string): string {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}
