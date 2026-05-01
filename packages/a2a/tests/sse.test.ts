import { describe, it, expect } from 'vitest';
import {
    SSE_HEADERS,
    formatSSEEvent,
    formatSSEErrorEvent,
} from '../src/sse.js';

describe('SSE Utilities', () => {
    describe('SSE_HEADERS', () => {
        it('includes Content-Type for event-stream', () => {
            expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream');
        });

        it('disables caching', () => {
            expect(SSE_HEADERS['Cache-Control']).toBe('no-cache');
        });

        it('sets keep-alive connection', () => {
            expect(SSE_HEADERS['Connection']).toBe('keep-alive');
        });

        it('disables nginx buffering', () => {
            expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no');
        });
    });

    describe('formatSSEEvent', () => {
        it('formats a JSON object as SSE data event', () => {
            const event = { kind: 'message', text: 'Hello' };
            const result = formatSSEEvent(event);
            expect(result).toBe(`data: ${JSON.stringify(event)}\n\n`);
        });

        it('formats a simple string as SSE data event', () => {
            const result = formatSSEEvent('hello');
            expect(result).toBe('data: "hello"\n\n');
        });

        it('formats null', () => {
            const result = formatSSEEvent(null);
            expect(result).toBe('data: null\n\n');
        });

        it('handles nested objects', () => {
            const event = { task: { id: '123', status: { state: 'working' } } };
            const result = formatSSEEvent(event);
            expect(result).toContain('data: ');
            expect(result).toContain('"task"');
            expect(result).toContain('"status"');
            expect(result.endsWith('\n\n')).toBe(true);
        });

        it('handles TaskStatusUpdateEvent structure', () => {
            const event = {
                kind: 'status-update',
                taskId: 'task-1',
                contextId: 'ctx-1',
                status: { state: 'completed' },
                final: true,
            };
            const result = formatSSEEvent(event);
            const parsed = JSON.parse(result.replace('data: ', '').trim());
            expect(parsed.kind).toBe('status-update');
            expect(parsed.final).toBe(true);
        });

        it('handles TaskArtifactUpdateEvent structure', () => {
            const event = {
                kind: 'artifact-update',
                taskId: 'task-1',
                contextId: 'ctx-1',
                artifact: { artifactId: 'a-1', parts: [] },
                append: false,
                lastChunk: true,
            };
            const result = formatSSEEvent(event);
            const parsed = JSON.parse(result.replace('data: ', '').trim());
            expect(parsed.kind).toBe('artifact-update');
            expect(parsed.lastChunk).toBe(true);
        });
    });

    describe('formatSSEErrorEvent', () => {
        it('formats an error with event type prefix', () => {
            const error = { code: -32603, message: 'Internal error' };
            const result = formatSSEErrorEvent(error);
            expect(result).toBe(`event: error\ndata: ${JSON.stringify(error)}\n\n`);
        });

        it('includes event: error prefix to distinguish from data events', () => {
            const result = formatSSEErrorEvent({ code: -32001 });
            expect(result).toMatch(/^event: error\n/);
        });

        it('handles all A2A error codes', () => {
            const codes = [-32700, -32600, -32601, -32602, -32603, -32001, -32002, -32003, -32004, -32005, -32006, -32007];
            for (const code of codes) {
                const result = formatSSEErrorEvent({ code, message: 'test' });
                expect(result).toContain(`"code":${code}`);
                expect(result).toMatch(/^event: error\n/);
            }
        });
    });
});
