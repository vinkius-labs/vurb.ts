import { describe, it, expect, beforeEach } from 'vitest';
import {
    StreamableHttpTransport,
    A2AHandler,
    type ToolExecutorLike,
    type StreamingExecutorLike,
    type TransportResult,
    A2A_METHODS,
} from '../src/index.js';
import type { JsonRpcRequest, Message, TaskUpdateEvent } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────

function createMockExecutor(): ToolExecutorLike {
    return {
        execute: async (name, args) => ({
            content: [{ type: 'text', text: `Executed ${name} with ${JSON.stringify(args)}` }],
        }),
        hasToolName: (name) => name === 'math.add',
    };
}

function createMockStreamingExecutor(): StreamingExecutorLike {
    return {
        async *executeStream(toolName, args) {
            yield {
                kind: 'status-update',
                taskId: 'stream-task',
                contextId: 'stream-ctx',
                status: { state: 'working', timestamp: new Date().toISOString() },
                final: false,
            } satisfies TaskUpdateEvent;

            yield {
                kind: 'artifact-update',
                taskId: 'stream-task',
                contextId: 'stream-ctx',
                artifact: {
                    artifactId: 'result-1',
                    parts: [{ kind: 'text', text: `Result: ${toolName}(${JSON.stringify(args)})` }],
                },
                lastChunk: true,
            } satisfies TaskUpdateEvent;

            yield {
                kind: 'status-update',
                taskId: 'stream-task',
                contextId: 'stream-ctx',
                status: { state: 'completed', timestamp: new Date().toISOString() },
                final: true,
            } satisfies TaskUpdateEvent;
        },
    };
}

let msgCounter = 0;

function makeMessage(parts: Message['parts'], metadata?: Record<string, unknown>): Message {
    return {
        kind: 'message',
        messageId: `test-msg-${++msgCounter}`,
        role: 'user',
        parts,
        ...(metadata ? { metadata } : {}),
    };
}

function makeRequest(
    method: string,
    params?: Record<string, unknown>,
    id: string | number = 1,
): JsonRpcRequest {
    return { jsonrpc: '2.0', id, method, params };
}

async function collectSSE(result: TransportResult): Promise<string[]> {
    if (!result.streaming) return [];
    const chunks: string[] = [];
    for await (const chunk of result.body) {
        chunks.push(chunk);
    }
    return chunks;
}

// ── Tests ────────────────────────────────────────────────

describe('StreamableHttpTransport', () => {
    describe('synchronous methods', () => {
        let transport: StreamableHttpTransport;

        beforeEach(() => {
            msgCounter = 0;
            const executor = createMockExecutor();
            const handler = new A2AHandler(executor);
            transport = new StreamableHttpTransport(handler);
        });

        it('handles message/send as sync JSON response', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error).toBeUndefined();
                expect(result.body.result).toBeDefined();
            }
        });

        it('handles tasks/get as sync JSON response', async () => {
            const result = await transport.handle(
                makeRequest(A2A_METHODS.TASKS_GET, { id: 'nonexistent' }),
            );
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error).toBeDefined();
            }
        });

        it('rejects invalid JSON-RPC version', async () => {
            const result = await transport.handle({
                jsonrpc: '1.0',
                id: 1,
                method: 'message/send',
            });
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error?.message).toContain('2.0');
            }
        });

        it('rejects non-object request body', async () => {
            const result = await transport.handle(42);
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error?.code).toBe(-32700);
            }
        });

        it('handles string request body', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const jsonStr = JSON.stringify(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            const result = await transport.handle(jsonStr);
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error).toBeUndefined();
            }
        });

        it('handles invalid JSON string', async () => {
            const result = await transport.handle('{bad json');
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error?.code).toBe(-32700);
            }
        });
    });

    describe('streaming fallback (no streaming executor)', () => {
        let transport: StreamableHttpTransport;

        beforeEach(() => {
            msgCounter = 0;
            const executor = createMockExecutor();
            const handler = new A2AHandler(executor);
            transport = new StreamableHttpTransport(handler);
        });

        it('falls back to sync for message/stream without streaming executor', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
            );
            expect(result.streaming).toBe(true);
            const chunks = await collectSSE(result);
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toContain('data: ');
        });

        it('returns SSE headers for streaming response', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
            );
            expect(result.streaming).toBe(true);
            if (result.streaming) {
                expect(result.headers['Content-Type']).toBe('text/event-stream');
                expect(result.headers['Cache-Control']).toBe('no-cache');
                expect(result.headers['Connection']).toBe('keep-alive');
            }
        });
    });

    describe('tasks/resubscribe', () => {
        let transport: StreamableHttpTransport;
        let handler: A2AHandler;

        beforeEach(() => {
            msgCounter = 0;
            const executor = createMockExecutor();
            handler = new A2AHandler(executor);
            transport = new StreamableHttpTransport(handler);
        });

        it('returns task state as SSE stream for existing task', async () => {
            // Create a task first
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );

            // Get the task ID
            const tasks = handler.taskManager.listTasks({});
            const taskId = tasks.tasks[0]?.id;
            expect(taskId).toBeDefined();

            // Resubscribe
            const result = await transport.handle(
                makeRequest(A2A_METHODS.TASKS_RESUBSCRIBE, { id: taskId }),
            );
            expect(result.streaming).toBe(true);
            const chunks = await collectSSE(result);
            expect(chunks).toHaveLength(1);

            const parsed = JSON.parse(chunks[0].replace('data: ', '').trim());
            expect(parsed.result.kind).toBe('status-update');
            expect(parsed.result.taskId).toBe(taskId);
        });

        it('marks completed tasks as final', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );

            const tasks = handler.taskManager.listTasks({});
            const taskId = tasks.tasks[0]?.id;

            const result = await transport.handle(
                makeRequest(A2A_METHODS.TASKS_RESUBSCRIBE, { id: taskId }),
            );
            const chunks = await collectSSE(result);
            const parsed = JSON.parse(chunks[0].replace('data: ', '').trim());
            expect(parsed.result.final).toBe(true);
        });

        it('returns error for missing task ID', async () => {
            const result = await transport.handle(
                makeRequest(A2A_METHODS.TASKS_RESUBSCRIBE, {}),
            );
            expect(result.streaming).toBe(false);
        });

        it('returns error for non-existent task', async () => {
            const result = await transport.handle(
                makeRequest(A2A_METHODS.TASKS_RESUBSCRIBE, { id: 'nonexistent' }),
            );
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error?.code).toBe(-32001);
            }
        });
    });

    describe('streaming with StreamingExecutorLike', () => {
        let transport: StreamableHttpTransport;

        beforeEach(() => {
            msgCounter = 0;
            const executor = createMockExecutor();
            const handler = new A2AHandler(executor);
            const streamingExecutor = createMockStreamingExecutor();
            transport = new StreamableHttpTransport(handler, streamingExecutor);
        });

        it('returns multiple SSE events for message/stream', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
            );
            expect(result.streaming).toBe(true);
            const chunks = await collectSSE(result);

            // 2 initial status events (submitted, working) + 3 from executor = 5
            expect(chunks.length).toBeGreaterThanOrEqual(4);

            // Every chunk should be SSE formatted
            for (const chunk of chunks) {
                expect(chunk).toMatch(/^(data:|event:)/);
                expect(chunk.endsWith('\n\n')).toBe(true);
            }
        });

        it('emits submitted → working → executor events', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
            );
            const chunks = await collectSSE(result);

            const events = chunks.map((c) => {
                const dataLine = c.split('\n').find((l) => l.startsWith('data: '));
                return dataLine ? JSON.parse(dataLine.replace('data: ', '')) : null;
            }).filter(Boolean);

            // First event: submitted
            expect(events[0].result.kind).toBe('status-update');
            expect(events[0].result.status.state).toBe('submitted');

            // Second event: working
            expect(events[1].result.kind).toBe('status-update');
            expect(events[1].result.status.state).toBe('working');
        });

        it('wraps each event in JSON-RPC response with request ID', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }, 42),
            );
            const chunks = await collectSSE(result);

            for (const chunk of chunks) {
                const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
                if (dataLine) {
                    const parsed = JSON.parse(dataLine.replace('data: ', ''));
                    expect(parsed.jsonrpc).toBe('2.0');
                    expect(parsed.id).toBe(42);
                }
            }
        });

        it('returns error for missing message param in stream', async () => {
            const result = await transport.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, {}),
            );
            expect(result.streaming).toBe(false);
            if (!result.streaming) {
                expect(result.body.error?.code).toBe(-32602);
            }
        });

        it('handles error in streaming executor gracefully', async () => {
            const failExecutor: StreamingExecutorLike = {
                async *executeStream() {
                    throw new Error('Executor crashed');
                },
            };
            const handler = new A2AHandler(createMockExecutor());
            const transport2 = new StreamableHttpTransport(handler, failExecutor);

            const message = makeMessage(
                [{ kind: 'data', data: { a: 1 } }],
                { skill_id: 'math.add' },
            );
            const result = await transport2.handle(
                makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
            );
            expect(result.streaming).toBe(true);
            const chunks = await collectSSE(result);

            // Should have submitted + working + error event
            expect(chunks.length).toBeGreaterThanOrEqual(3);
            const errorChunk = chunks.find((c) => c.startsWith('event: error'));
            expect(errorChunk).toBeDefined();
            expect(errorChunk).toContain('Executor crashed');
        });
    });
});
