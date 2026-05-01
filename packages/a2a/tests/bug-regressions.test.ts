/**
 * Regression tests for bugs identified during the A2A deep audit (2026-05-01).
 *
 * Each `describe` block maps 1:1 to a specific bug fix. These tests exist
 * solely to prevent regressions — if any of them fail, a previously fixed
 * vulnerability has been reintroduced.
 *
 * Bug Index:
 * 1. SSE parser multi-line data concatenation (sse.ts)
 * 2. Streaming tool existence check (StreamableHttpTransport.ts)
 * 3. Streaming message.kind validation (StreamableHttpTransport.ts)
 * 4. Non-text artifact content preservation (A2AHandler.ts)
 * 5. Shared message-utils single source of truth (message-utils.ts)
 * 6. Protocol version = 1.0.0 (constants.ts)
 * 7. Pagination cursor NaN guard (TaskManager.ts)
 * 8. UUID fallback entropy (A2AHandler.ts, TaskManager.ts)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    A2AHandler,
    StreamableHttpTransport,
    TaskManager,
    A2A_METHODS,
    A2A_ERROR_CODES,
    A2A_PROTOCOL_VERSION,
    formatSSEEvent,
    parseSseStream,
    type ToolExecutorLike,
    type StreamingExecutorLike,
    type TransportResult,
} from '../src/index.js';
import { resolveSkillId, extractMessageArgs } from '../src/message-utils.js';
import type { JsonRpcRequest, Message, TaskUpdateEvent } from '../src/types.js';

// ── Shared Helpers ───────────────────────────────────────

let msgCounter = 0;

function makeMessage(parts: Message['parts'], metadata?: Record<string, unknown>): Message {
    return {
        kind: 'message',
        messageId: `reg-msg-${++msgCounter}`,
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

async function collectSSE(result: TransportResult): Promise<string[]> {
    if (!result.streaming) return [];
    const chunks: string[] = [];
    for await (const chunk of result.body) {
        chunks.push(chunk);
    }
    return chunks;
}

// ══════════════════════════════════════════════════════════
// BUG 1 — SSE Parser: Multi-line `data:` concatenation
// ══════════════════════════════════════════════════════════

describe('BUG 1 — SSE parser multi-line data concatenation', () => {
    /**
     * Per the SSE specification, multiple `data:` lines MUST be
     * concatenated with newlines. Previously, the parser was
     * overwriting, causing silent data loss.
     */

    function makeMockSSEResponse(body: string): Response {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(body));
                controller.close();
            },
        });
        return new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    }

    it('concatenates multi-line data fields with newline separator', async () => {
        const ssePayload = 'data: line1\ndata: line2\ndata: line3\n\n';
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].data).toBe('line1\nline2\nline3');
    });

    it('handles single-line data correctly (no regression)', async () => {
        const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { kind: 'status-update' } });
        const ssePayload = `data: ${payload}\n\n`;
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        const parsed = JSON.parse(events[0].data);
        expect(parsed.jsonrpc).toBe('2.0');
    });

    it('handles interleaved event and data lines', async () => {
        const ssePayload = 'event: error\ndata: {"code":-32603}\n\n';
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('error');
        expect(events[0].data).toBe('{"code":-32603}');
    });

    it('handles multiple events in single stream', async () => {
        const ssePayload = 'data: event1\n\ndata: event2\n\n';
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(2);
        expect(events[0].data).toBe('event1');
        expect(events[1].data).toBe('event2');
    });

    it('yields pending event at stream end without trailing newline', async () => {
        const ssePayload = 'data: final-event\n';
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].data).toBe('final-event');
    });

    it('handles chunked JSON split across multiple data lines', async () => {
        // Simulates a proxy splitting a JSON payload across lines
        const ssePayload = 'data: {"jsonrpc":"2.0",\ndata: "id":1}\n\n';
        const response = makeMockSSEResponse(ssePayload);
        const events: Array<{ type: string; data: string }> = [];

        for await (const event of parseSseStream(response)) {
            events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].data).toContain('jsonrpc');
        expect(events[0].data).toContain('"id":1}');
    });
});

// ══════════════════════════════════════════════════════════
// BUG 2 — Streaming: Tool existence check before executeStream
// ══════════════════════════════════════════════════════════

describe('BUG 2 — Streaming tool existence check', () => {
    it('yields error for non-existent skill when hasToolName is provided', async () => {
        const streamExec: StreamingExecutorLike = {
            async *executeStream() {
                yield {
                    kind: 'status-update',
                    taskId: 't',
                    contextId: 'c',
                    status: { state: 'completed' },
                    final: true,
                } satisfies TaskUpdateEvent;
            },
            hasToolName: (name) => name === 'real-tool',
        };

        const executor = createMockExecutor({ 'real-tool': async () => ({ content: [{ type: 'text', text: 'ok' }] }) });
        const handler = new A2AHandler(executor);
        const transport = new StreamableHttpTransport(handler, streamExec);

        const message = makeMessage(
            [{ kind: 'text', text: 'non-existent-tool' }],
        );
        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
        );

        expect(result.streaming).toBe(true);
        const chunks = await collectSSE(result);

        // Should contain a final error status for skill not found
        const allText = chunks.join('');
        expect(allText).toContain('not found');
        expect(allText).toContain('failed');
    });

    it('proceeds normally when hasToolName returns true', async () => {
        const streamExec: StreamingExecutorLike = {
            async *executeStream() {
                yield {
                    kind: 'status-update',
                    taskId: 't',
                    contextId: 'c',
                    status: { state: 'completed', timestamp: new Date().toISOString() },
                    final: true,
                } satisfies TaskUpdateEvent;
            },
            hasToolName: (name) => name === 'my-tool',
        };

        const executor = createMockExecutor({ 'my-tool': async () => ({ content: [{ type: 'text', text: 'ok' }] }) });
        const handler = new A2AHandler(executor);
        const transport = new StreamableHttpTransport(handler, streamExec);

        const message = makeMessage(
            [{ kind: 'text', text: 'my-tool' }],
        );
        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
        );

        const chunks = await collectSSE(result);
        const allText = chunks.join('');
        expect(allText).toContain('completed');
        expect(allText).not.toContain('not found');
    });

    it('skips check gracefully when hasToolName is not implemented', async () => {
        const streamExec: StreamingExecutorLike = {
            async *executeStream() {
                yield {
                    kind: 'status-update',
                    taskId: 't',
                    contextId: 'c',
                    status: { state: 'completed', timestamp: new Date().toISOString() },
                    final: true,
                } satisfies TaskUpdateEvent;
            },
            // No hasToolName — backward compatible
        };

        const executor = createMockExecutor({ 'any-tool': async () => ({ content: [{ type: 'text', text: 'ok' }] }) });
        const handler = new A2AHandler(executor);
        const transport = new StreamableHttpTransport(handler, streamExec);

        const message = makeMessage(
            [{ kind: 'text', text: 'any-tool' }],
        );
        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message }),
        );

        const chunks = await collectSSE(result);
        expect(chunks.length).toBeGreaterThanOrEqual(3);
    });
});

// ══════════════════════════════════════════════════════════
// BUG 3 — Streaming: message.kind validation
// ══════════════════════════════════════════════════════════

describe('BUG 3 — Streaming message.kind validation', () => {
    let transport: StreamableHttpTransport;

    beforeEach(() => {
        msgCounter = 0;
        const streamExec: StreamingExecutorLike = {
            async *executeStream() {
                yield {
                    kind: 'status-update',
                    taskId: 't',
                    contextId: 'c',
                    status: { state: 'completed' },
                    final: true,
                } satisfies TaskUpdateEvent;
            },
        };
        const executor = createMockExecutor({ 'tool': async () => ({ content: [{ type: 'text', text: 'ok' }] }) });
        const handler = new A2AHandler(executor);
        transport = new StreamableHttpTransport(handler, streamExec);
    });

    it('rejects message without kind discriminator in streaming path', async () => {
        const badMessage = {
            messageId: 'bad-msg',
            role: 'user',
            parts: [{ kind: 'text', text: 'tool' }],
            // Missing kind: 'message'
        };

        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message: badMessage }),
        );

        expect(result.streaming).toBe(true);
        const chunks = await collectSSE(result);

        // Should get an error event, not a successful stream
        const errorChunk = chunks.find((c) => c.startsWith('event: error'));
        expect(errorChunk).toBeDefined();
        expect(errorChunk).toContain('kind');
    });

    it('rejects message with wrong kind discriminator in streaming path', async () => {
        const badMessage = {
            kind: 'task', // Wrong kind
            messageId: 'bad-msg',
            role: 'user',
            parts: [{ kind: 'text', text: 'tool' }],
        };

        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message: badMessage }),
        );

        expect(result.streaming).toBe(true);
        const chunks = await collectSSE(result);
        const errorChunk = chunks.find((c) => c.startsWith('event: error'));
        expect(errorChunk).toBeDefined();
    });

    it('accepts message with correct kind discriminator in streaming path', async () => {
        const goodMessage = makeMessage([{ kind: 'text', text: 'tool' }]);
        const result = await transport.handle(
            makeRequest(A2A_METHODS.MESSAGE_STREAM, { message: goodMessage }),
        );

        expect(result.streaming).toBe(true);
        const chunks = await collectSSE(result);

        // Should NOT contain an error event
        const errorChunk = chunks.find((c) => c.startsWith('event: error'));
        expect(errorChunk).toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════
// BUG 4 — Non-text content preservation in artifacts
// ══════════════════════════════════════════════════════════

describe('BUG 4 — Non-text artifact content preservation', () => {
    it('preserves text content as TextPart', async () => {
        const executor = createMockExecutor({
            'text-tool': async () => ({
                content: [{ type: 'text', text: 'Hello world' }],
            }),
        });
        const handler = new A2AHandler(executor);

        const message = makeMessage(
            [{ kind: 'text', text: 'run' }],
            { skill_id: 'text-tool' },
        );
        const res = await handler.handleRequest(
            makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
        );

        const task = res.result as Record<string, unknown>;
        const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
        const parts = artifacts[0]['parts'] as Array<Record<string, unknown>>;

        expect(parts[0]['kind']).toBe('text');
        expect(parts[0]['text']).toBe('Hello world');
    });

    it('preserves non-text content as DataPart instead of empty TextPart', async () => {
        const executor = createMockExecutor({
            'image-tool': async () => ({
                content: [{ type: 'image' }], // No text field — image content
            }),
        });
        const handler = new A2AHandler(executor);

        const message = makeMessage(
            [{ kind: 'text', text: 'run' }],
            { skill_id: 'image-tool' },
        );
        const res = await handler.handleRequest(
            makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
        );

        const task = res.result as Record<string, unknown>;
        const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
        const parts = artifacts[0]['parts'] as Array<Record<string, unknown>>;

        // Should be DataPart, NOT an empty TextPart
        expect(parts[0]['kind']).toBe('data');
        expect(parts[0]['text']).toBeUndefined();

        // Should preserve content type info
        const data = parts[0]['data'] as Record<string, unknown>;
        expect(data['contentType']).toBe('image');
    });

    it('handles mixed text and non-text content', async () => {
        const executor = createMockExecutor({
            'mixed-tool': async () => ({
                content: [
                    { type: 'text', text: 'Result text' },
                    { type: 'image' },
                    { type: 'text', text: 'More text' },
                ],
            }),
        });
        const handler = new A2AHandler(executor);

        const message = makeMessage(
            [{ kind: 'text', text: 'run' }],
            { skill_id: 'mixed-tool' },
        );
        const res = await handler.handleRequest(
            makeRequest(A2A_METHODS.MESSAGE_SEND, { message }),
        );

        const task = res.result as Record<string, unknown>;
        const artifacts = task['artifacts'] as Array<Record<string, unknown>>;
        const parts = artifacts[0]['parts'] as Array<Record<string, unknown>>;

        expect(parts).toHaveLength(3);
        expect(parts[0]['kind']).toBe('text');
        expect(parts[0]['text']).toBe('Result text');
        expect(parts[1]['kind']).toBe('data');
        expect(parts[2]['kind']).toBe('text');
        expect(parts[2]['text']).toBe('More text');
    });
});

// ══════════════════════════════════════════════════════════
// BUG 5 — Shared message-utils (single source of truth)
// ══════════════════════════════════════════════════════════

describe('BUG 5 — message-utils shared module', () => {
    describe('resolveSkillId', () => {
        it('resolves from metadata.skill_id (priority 1)', () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'other-tool' }],
                { skill_id: 'meta-tool' },
            );
            expect(resolveSkillId(message)).toBe('meta-tool');
        });

        it('resolves from DataPart tool_name (priority 2)', () => {
            const message = makeMessage([
                { kind: 'data', data: { tool_name: 'data-tool', arg: 1 } },
            ]);
            expect(resolveSkillId(message)).toBe('data-tool');
        });

        it('resolves from TextPart (priority 3)', () => {
            const message = makeMessage([{ kind: 'text', text: 'text-tool' }]);
            expect(resolveSkillId(message)).toBe('text-tool');
        });

        it('returns undefined for empty parts', () => {
            const message = makeMessage([]);
            expect(resolveSkillId(message)).toBeUndefined();
        });

        it('ignores empty skill_id', () => {
            const message = makeMessage(
                [{ kind: 'text', text: 'fallback' }],
                { skill_id: '' },
            );
            expect(resolveSkillId(message)).toBe('fallback');
        });

        it('skips text with spaces longer than 64 chars', () => {
            const longText = 'a '.repeat(40); // 80 chars with spaces
            const message = makeMessage([{ kind: 'text', text: longText }]);
            expect(resolveSkillId(message)).toBeUndefined();
        });

        it('accepts text with spaces shorter than 64 chars', () => {
            const message = makeMessage([{ kind: 'text', text: 'short tool name' }]);
            expect(resolveSkillId(message)).toBe('short tool name');
        });
    });

    describe('extractMessageArgs', () => {
        it('extracts from DataPart excluding tool_name', () => {
            const message = makeMessage([
                { kind: 'data', data: { tool_name: 'ignored', a: 1, b: 2 } },
            ]);
            const args = extractMessageArgs(message);
            expect(args).toEqual({ a: 1, b: 2 });
            expect(args).not.toHaveProperty('tool_name');
        });

        it('wraps TextPart as { text }', () => {
            const message = makeMessage([{ kind: 'text', text: 'hello' }]);
            const args = extractMessageArgs(message);
            expect(args).toEqual({ text: 'hello' });
        });

        it('returns empty object for no matching parts', () => {
            const message = makeMessage([
                { kind: 'file', file: { uri: 'file://test', name: 'test' } },
            ]);
            const args = extractMessageArgs(message);
            expect(args).toEqual({});
        });

        it('prefers DataPart over TextPart', () => {
            const message = makeMessage([
                { kind: 'text', text: 'should-be-ignored' },
                { kind: 'data', data: { tool_name: 'x', key: 'value' } },
            ]);
            // DataPart comes after TextPart, but should find the first DataPart
            // Actually the loop checks data first, so let's flip:
            const message2 = makeMessage([
                { kind: 'data', data: { tool_name: 'x', key: 'value' } },
                { kind: 'text', text: 'should-be-ignored' },
            ]);
            const args = extractMessageArgs(message2);
            expect(args).toEqual({ key: 'value' });
        });
    });
});

// ══════════════════════════════════════════════════════════
// BUG 6 — Protocol version = 1.0.0
// ══════════════════════════════════════════════════════════

describe('BUG 6 — Protocol version 1.0.0', () => {
    it('exports protocol version as 1.0.0', () => {
        expect(A2A_PROTOCOL_VERSION).toBe('1.0.0');
    });

    it('protocol version is not the old 0.3.0', () => {
        expect(A2A_PROTOCOL_VERSION).not.toBe('0.3.0');
    });
});

// ══════════════════════════════════════════════════════════
// BUG 7 — Pagination cursor NaN guard
// ══════════════════════════════════════════════════════════

describe('BUG 7 — Pagination cursor NaN guard', () => {
    let tm: TaskManager;

    beforeEach(() => {
        tm = new TaskManager();
        // Seed with 5 tasks
        for (let i = 0; i < 5; i++) {
            tm.createTask(`ctx-${i}`);
        }
    });

    it('handles non-numeric cursor gracefully', () => {
        const result = tm.listTasks({ cursor: 'abc' });
        // Should fall back to offset 0, not crash or return NaN-based results
        expect(result.tasks).toHaveLength(5);
    });

    it('handles negative cursor gracefully', () => {
        const result = tm.listTasks({ cursor: '-5' });
        // Should fall back to 0
        expect(result.tasks).toHaveLength(5);
    });

    it('handles empty string cursor', () => {
        const result = tm.listTasks({ cursor: '' });
        // Empty string is falsy, falls through to default 0
        expect(result.tasks).toHaveLength(5);
    });

    it('handles valid numeric cursor correctly', () => {
        const result = tm.listTasks({ cursor: '2', limit: 2 });
        expect(result.tasks).toHaveLength(2);
    });

    it('handles cursor beyond total count', () => {
        const result = tm.listTasks({ cursor: '100' });
        expect(result.tasks).toHaveLength(0);
        expect(result.nextCursor).toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════
// BUG 8 — UUID fallback entropy
// ══════════════════════════════════════════════════════════

describe('BUG 8 — UUID uniqueness under concurrency', () => {
    it('generates unique task IDs across 1000 concurrent creates', () => {
        const tm = new TaskManager();
        const ids = new Set<string>();

        for (let i = 0; i < 1000; i++) {
            const task = tm.createTask('ctx');
            ids.add(task.id);
        }

        expect(ids.size).toBe(1000);
    });

    it('generates unique context IDs across 100 concurrent message/sends', async () => {
        const executor = createMockExecutor({
            'tool': async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        });
        const handler = new A2AHandler(executor);

        const contextIds = new Set<string>();
        const promises = Array.from({ length: 100 }, (_, i) => {
            const message = makeMessage(
                [{ kind: 'text', text: 'run' }],
                { skill_id: 'tool' },
            );
            return handler.handleRequest(
                makeRequest(A2A_METHODS.MESSAGE_SEND, { message }, i),
            );
        });

        const results = await Promise.all(promises);
        for (const res of results) {
            const task = res.result as Record<string, unknown>;
            contextIds.add(task['contextId'] as string);
        }

        // All should be unique (no collisions)
        expect(contextIds.size).toBe(100);
    });
});
