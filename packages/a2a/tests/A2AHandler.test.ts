import { describe, it, expect, beforeEach } from 'vitest';
import { A2AHandler, type ToolExecutorLike, A2A_METHODS, A2A_ERROR_CODES } from '../src/index.js';
import type { JsonRpcRequest, Message } from '../src/types.js';

// ── Mock Executor ────────────────────────────────────────

function createMockExecutor(
    tools: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>>,
): ToolExecutorLike {
    return {
        execute: async (name, args) => {
            const handler = tools[name];
            if (!handler) throw new Error(`Tool "${name}" not registered`);
            return handler(args);
        },
        hasToolName: (name) => name in tools,
    };
}

function makeRequest(
    method: string,
    params?: Record<string, unknown>,
    id: string | number = 1,
): JsonRpcRequest {
    return { jsonrpc: '2.0', id, method, params };
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

// ── Tests ────────────────────────────────────────────────

describe('A2AHandler', () => {
    let executor: ToolExecutorLike;
    let handler: A2AHandler;

    beforeEach(() => {
        msgCounter = 0;
        executor = createMockExecutor({
            'math.add': async (args) => ({
                content: [{ type: 'text', text: String(Number(args['a']) + Number(args['b'])) }],
            }),
            'echo': async (args) => ({
                content: [{ type: 'text', text: args['text'] as string }],
            }),
            'fail-tool': async () => ({
                content: [{ type: 'text', text: 'Error occurred' }],
                isError: true,
            }),
            'throw-tool': async () => {
                throw new Error('Unexpected internal failure');
            },
        });
        handler = new A2AHandler(executor);
    });

    // ── JSON-RPC Validation ──────────────────────────────

    describe('JSON-RPC protocol compliance', () => {
        it('rejects non-2.0 jsonrpc version', async () => {
            const req = { jsonrpc: '1.0' as '2.0', id: 1, method: A2A_METHODS.TASKS_GET };
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_REQUEST);
        });

        it('returns method not found for unknown method', async () => {
            const req = makeRequest('unknown/method');
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.METHOD_NOT_FOUND);
            expect(res.error?.message).toContain('unknown/method');
        });

        it('returns unsupported for message/stream', async () => {
            const req = makeRequest(A2A_METHODS.MESSAGE_STREAM);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.UNSUPPORTED_OPERATION);
        });

        it('preserves request id in response', async () => {
            const req = makeRequest(A2A_METHODS.TASKS_GET, { id: 'non-existent' }, 42);
            const res = await handler.handleRequest(req);

            expect(res.id).toBe(42);
            expect(res.jsonrpc).toBe('2.0');
        });

        it('handles string request ids', async () => {
            const req = makeRequest(A2A_METHODS.TASKS_GET, { id: 'non-existent' }, 'req-abc');
            const res = await handler.handleRequest(req);

            expect(res.id).toBe('req-abc');
        });
    });

    // ── New A2A methods ──────────────────────────────────

    describe('A2A method coverage', () => {
        it('returns unsupported for tasks/resubscribe', async () => {
            const req = makeRequest(A2A_METHODS.TASKS_RESUBSCRIBE);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.UNSUPPORTED_OPERATION);
        });

        it('returns not supported for push notification set', async () => {
            const req = makeRequest(A2A_METHODS.PUSH_NOTIFICATION_SET);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED);
        });

        it('returns not supported for push notification get', async () => {
            const req = makeRequest(A2A_METHODS.PUSH_NOTIFICATION_GET);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED);
        });

        it('returns not supported for push notification list', async () => {
            const req = makeRequest(A2A_METHODS.PUSH_NOTIFICATION_LIST);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED);
        });

        it('returns not supported for push notification delete', async () => {
            const req = makeRequest(A2A_METHODS.PUSH_NOTIFICATION_DELETE);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED);
        });

        it('returns not configured for authenticated extended card', async () => {
            const req = makeRequest(A2A_METHODS.GET_AUTHENTICATED_EXTENDED_CARD);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED);
        });
    });

    // ── message/send ─────────────────────────────────────

    describe('message/send — skill resolution', () => {
        it('resolves skill from metadata.skill_id', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 3, b: 4 } }],
                { skill_id: 'math.add' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            expect(res.error).toBeUndefined();
            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('completed');
        });

        it('resolves skill from DataPart tool_name', async () => {
            const message = makeMessage([
                { kind: 'data', data: { tool_name: 'math.add', a: 5, b: 2 } },
            ]);
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('completed');
        });

        it('resolves skill from TextPart as tool name', async () => {
            const message = makeMessage([{ kind: 'text', text: 'echo' }]);
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('completed');
        });

        it('fails when skill_id not found', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'hello' }],
                { skill_id: 'non-existent-skill' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('failed');
        });
    });

    describe('message/send — argument extraction', () => {
        it('extracts args from DataPart (excluding tool_name)', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { tool_name: 'math.add', a: 10, b: 20 } }],
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
            const parts = artifacts[0]['parts'] as Array<Record<string, unknown>>;
            expect(parts[0]['text']).toBe('30');
        });

        it('wraps TextPart as { text } args', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'Hello world!' }],
                { skill_id: 'echo' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
            const parts = artifacts[0]['parts'] as Array<Record<string, unknown>>;
            expect(parts[0]['text']).toBe('Hello world!');
        });
    });

    describe('message/send — task lifecycle', () => {
        it('creates task with kind discriminator in completed flow', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 1 } }],
                { skill_id: 'math.add' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect(task['kind']).toBe('task');
            expect(task['id']).toBeDefined();
            expect(task['contextId']).toBeDefined();
            expect((task['status'] as Record<string, unknown>)['state']).toBe('completed');
            expect(task['artifacts']).toBeDefined();
        });

        it('creates artifact with tool result', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 7, b: 3 } }],
                { skill_id: 'math.add' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
            expect(artifacts).toHaveLength(1);
            expect(artifacts[0]['name']).toBe('math.add result');
        });

        it('response messages include kind and messageId', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 1 } }],
                { skill_id: 'math.add' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            const status = task['status'] as Record<string, unknown>;
            const statusMsg = status['message'] as Record<string, unknown> | undefined;
            if (statusMsg) {
                expect(statusMsg['kind']).toBe('message');
                expect(statusMsg['messageId']).toBeDefined();
                expect(typeof statusMsg['messageId']).toBe('string');
            }
        });

        it('sets failed state when tool returns isError', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'fail' }],
                { skill_id: 'fail-tool' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('failed');
        });

        it('sets failed state when tool throws', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'go' }],
                { skill_id: 'throw-tool' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('failed');
        });

        it('generates contextId when not provided', async () => {
            const message = makeMessage([{ kind: 'text', text: 'echo' }]);
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect(task['contextId']).toBeDefined();
            expect(typeof task['contextId']).toBe('string');
        });

        it('uses provided contextId', async () => {
            const message: Message = {
                kind: 'message',
                messageId: 'ctx-test-msg',
                role: 'user',
                parts: [{ kind: 'text', text: 'echo' }],
                contextId: 'my-custom-ctx',
            };
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect(task['contextId']).toBe('my-custom-ctx');
        });
    });

    describe('message/send — validation', () => {
        it('rejects missing message', async () => {
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, {});
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS);
        });

        it('rejects undefined params', async () => {
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND);
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS);
        });

        it('rejects message without kind discriminator', async () => {
            const badMessage = {
                role: 'user',
                parts: [{ kind: 'text', text: 'test' }],
                messageId: 'test-msg',
            };
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message: badMessage });
            const res = await handler.handleRequest(req);

            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS);
        });
    });

    // ── tasks/get ────────────────────────────────────────

    describe('tasks/get', () => {
        it('retrieves a created task', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 1 } }],
                { skill_id: 'math.add' },
            );
            const createRes = await handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            const taskId = (createRes.result as Record<string, unknown>)['id'] as string;

            const getRes = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_GET, { id: taskId }),
            );

            expect(getRes.error).toBeUndefined();
            const task = getRes.result as Record<string, unknown>;
            expect(task['id']).toBe(taskId);
            expect(task['kind']).toBe('task');
        });

        it('returns error for non-existent task', async () => {
            const res = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_GET, { id: 'no-such-task' }),
            );

            expect(res.error?.code).toBe(A2A_ERROR_CODES.TASK_NOT_FOUND);
        });

        it('rejects missing id parameter', async () => {
            const res = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_GET, {}),
            );

            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS);
        });
    });

    // ── tasks/cancel ─────────────────────────────────────

    describe('tasks/cancel', () => {
        it('cancels a submitted task', async () => {
            const noExecHandler = new A2AHandler();
            const message = makeMessage([{ kind: 'text', text: 'hello' }]);
            const createRes = await noExecHandler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            const taskId = (createRes.result as Record<string, unknown>)['id'] as string;

            const cancelRes = await noExecHandler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_CANCEL, { id: taskId }),
            );

            expect(cancelRes.error).toBeUndefined();
            const task = cancelRes.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('canceled');
        });

        it('returns error for completed task', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 1 } }],
                { skill_id: 'math.add' },
            );
            const createRes = await handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            const taskId = (createRes.result as Record<string, unknown>)['id'] as string;

            const cancelRes = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_CANCEL, { id: taskId }),
            );

            expect(cancelRes.error?.code).toBe(A2A_ERROR_CODES.TASK_NOT_CANCELABLE);
        });

        it('rejects missing id', async () => {
            const res = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_CANCEL, {}),
            );
            expect(res.error?.code).toBe(A2A_ERROR_CODES.INVALID_PARAMS);
        });
    });

    // ── Handler without executor ─────────────────────────

    describe('handler without executor', () => {
        it('returns task in submitted state', async () => {
            const noExec = new A2AHandler();
            const message = makeMessage([{ kind: 'text', text: 'test' }]);
            const res = await noExec.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('submitted');
            expect(task['kind']).toBe('task');
        });
    });

    // ── Adversarial ──────────────────────────────────────

    describe('adversarial inputs', () => {
        it('handles XSS in message text', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: '<script>alert("xss")</script>' }],
                { skill_id: 'echo' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            expect(res.error).toBeUndefined();
        });

        it('handles unicode in skill_id', async () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'hello' }],
                { skill_id: '工具名' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('failed');
        });

        it('handles empty parts array', async () => {
            const message = makeMessage([]);
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            const task = res.result as Record<string, unknown>;
            expect((task['status'] as Record<string, unknown>)['state']).toBe('failed');
        });

        it('handles very large message', async () => {
            const bigText = 'x'.repeat(100_000);
            const message = makeMessage(
                [{ kind: 'text', text: bigText }],
                { skill_id: 'echo' },
            );
            const req = makeRequest(A2A_METHODS.MESSAGE_SEND, { message });
            const res = await handler.handleRequest(req);

            expect(res.error).toBeUndefined();
        });
    });

    // ── Error Class Integration ──────────────────────────

    describe('error code compliance', () => {
        it('uses correct error code for TASK_NOT_FOUND (-32001)', async () => {
            const res = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_GET, { id: 'missing' }),
            );
            expect(res.error?.code).toBe(-32001);
        });

        it('uses correct error code for TASK_NOT_CANCELABLE (-32002)', async () => {
            const message = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 1 } }],
                { skill_id: 'math.add' },
            );
            const createRes = await handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
            );
            const taskId = (createRes.result as Record<string, unknown>)['id'] as string;

            const res = await handler.handleRequest(
                makeRequest(A2A_METHODS.TASKS_CANCEL, { id: taskId }),
            );
            expect(res.error?.code).toBe(-32002);
        });

        it('uses correct error code for METHOD_NOT_FOUND (-32601)', async () => {
            const res = await handler.handleRequest(makeRequest('fake/method'));
            expect(res.error?.code).toBe(-32601);
        });

        it('uses correct error code for UNSUPPORTED_OPERATION (-32004)', async () => {
            const res = await handler.handleRequest(makeRequest(A2A_METHODS.MESSAGE_STREAM));
            expect(res.error?.code).toBe(-32004);
        });

        it('uses correct error code for PUSH_NOTIFICATION_NOT_SUPPORTED (-32003)', async () => {
            const res = await handler.handleRequest(makeRequest(A2A_METHODS.PUSH_NOTIFICATION_SET));
            expect(res.error?.code).toBe(-32003);
        });

        it('uses correct error code for AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED (-32007)', async () => {
            const res = await handler.handleRequest(makeRequest(A2A_METHODS.GET_AUTHENTICATED_EXTENDED_CARD));
            expect(res.error?.code).toBe(-32007);
        });
    });

    // ── Concurrent Requests ──────────────────────────────

    describe('concurrent requests', () => {
        it('handles 100 concurrent message/send requests', async () => {
            const promises = Array.from({ length: 100 }, (_, i) => {
                const message = makeMessage(
                    [{ kind: 'data', data: { a: i, b: 1 } }],
                    { skill_id: 'math.add' },
                );
                return handler.handleRequest(
                    makeRequest(A2A_METHODS.MESSAGE_SEND, { message }, i),
                );
            });

            const results = await Promise.all(promises);
            expect(results.every((r) => r.error === undefined)).toBe(true);
            expect(results.every((r) => {
                const task = r.result as Record<string, unknown>;
                return (task['status'] as Record<string, unknown>)['state'] === 'completed';
            })).toBe(true);
        });
    });

    // ── tasks/list ──────────────────────────────────────────

    describe('tasks/list', () => {
        it('returns empty list when no tasks exist', async () => {
            const res = await handler.handleRequest(
                makeRequest('tasks/list', {}),
            );
            expect(res.error).toBeUndefined();
            const result = res.result as { tasks: unknown[]; nextCursor?: string };
            expect(result.tasks).toEqual([]);
        });

        it('lists all created tasks', async () => {
            // Create 3 tasks
            for (let i = 0; i < 3; i++) {
                const message = makeMessage(
                    [{ kind: 'data', data: { a: i, b: 1 } }],
                    { skill_id: 'math.add' },
                );
                await handler.handleRequest(
                    makeRequest(A2A_METHODS.MESSAGE_SEND, { message }, i + 100),
                );
            }

            const res = await handler.handleRequest(
                makeRequest('tasks/list', {}),
            );
            expect(res.error).toBeUndefined();
            const result = res.result as { tasks: unknown[]; nextCursor?: string };
            expect(result.tasks).toHaveLength(3);
        });

        it('filters by taskState', async () => {
            // Create tasks with different outcomes
            const msgOk = makeMessage(
                [{ kind: 'data', data: { a: 1, b: 2 } }],
                { skill_id: 'math.add' },
            );
            await handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message: msgOk }, 200),
            );

            const msgFail = makeMessage(
                [{ kind: 'data', data: {} }],
                { skill_id: 'math.fail' },
            );
            await handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message: msgFail }, 201),
            );

            // Filter for completed tasks
            const res = await handler.handleRequest(
                makeRequest('tasks/list', { taskState: 'completed' }),
            );
            expect(res.error).toBeUndefined();
            const result = res.result as { tasks: Array<{ status: { state: string } }> };
            expect(result.tasks.every((t) => t.status.state === 'completed')).toBe(true);
        });

        it('paginates results', async () => {
            // Create 5 tasks
            for (let i = 0; i < 5; i++) {
                const message = makeMessage(
                    [{ kind: 'data', data: { a: i, b: 1 } }],
                    { skill_id: 'math.add' },
                );
                await handler.handleRequest(
                    makeRequest(A2A_METHODS.MESSAGE_SEND, { message }, i + 300),
                );
            }

            const res = await handler.handleRequest(
                makeRequest('tasks/list', { limit: 2 }),
            );
            expect(res.error).toBeUndefined();
            const result = res.result as { tasks: unknown[]; nextCursor?: string };
            expect(result.tasks).toHaveLength(2);
            expect(result.nextCursor).toBeDefined();
        });

        it('accepts no params (defaults)', async () => {
            const res = await handler.handleRequest(
                makeRequest('tasks/list'),
            );
            expect(res.error).toBeUndefined();
            const result = res.result as { tasks: unknown[] };
            expect(Array.isArray(result.tasks)).toBe(true);
        });
    });
});
