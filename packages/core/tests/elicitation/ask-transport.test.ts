/**
 * ask() — AsyncLocalStorage Transport & Pipeline Integration
 *
 * Tests the full ask() callable pipeline:
 * - ask() outside .interactive() throws ElicitationUnsupportedError
 * - ask() inside _elicitStore.run() sends correct MCP request
 * - ask.redirect() sends url-mode request
 * - Multi-step sequential ask() calls
 * - Mock sendRequest rejection handling
 * - Concurrent ask() calls in separate ALS contexts
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { ask, _elicitStore } from '../../src/core/elicitation/ask.js';
import {
    ElicitationUnsupportedError,
    ElicitationDeclinedError,
    type ElicitSink,
} from '../../src/core/elicitation/types.js';

// ── ask() outside context ────────────────────────────────

describe('ask() — no transport context', () => {
    it('throws ElicitationUnsupportedError when called outside .interactive()', async () => {
        await expect(
            ask('Hello', { name: ask.string() }),
        ).rejects.toThrow(ElicitationUnsupportedError);
    });

    it('error message mentions .interactive()', async () => {
        await expect(
            ask('Hello', { name: ask.string() }),
        ).rejects.toThrow(/\.interactive\(\)/);
    });

    it('error message mentions elicitation capability', async () => {
        await expect(
            ask('Hello', { name: ask.string() }),
        ).rejects.toThrow(/elicitation/i);
    });
});

describe('ask.redirect() — no transport context', () => {
    it('throws ElicitationUnsupportedError', async () => {
        await expect(
            ask.redirect('Auth:', 'https://example.com/oauth'),
        ).rejects.toThrow(ElicitationUnsupportedError);
    });
});

// ── ask() with mock transport ────────────────────────────

describe('ask() — with mock ElicitSink', () => {
    it('sends elicitation/create with compiled JSON Schema', async () => {
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { name: 'Alice', plan: 'pro' },
        });

        const result = await _elicitStore.run(mockSink, () =>
            ask('Setup your account:', {
                name: ask.string('Full name'),
                plan: ask.enum(['free', 'pro'] as const, 'Plan'),
            }),
        );

        // Verify the MCP request was formed correctly
        expect(mockSink).toHaveBeenCalledOnce();
        const call = vi.mocked(mockSink).mock.calls[0]![0];
        expect(call.method).toBe('elicitation/create');

        const params = call.params as {
            message: string;
            requestedSchema: {
                type: string;
                properties: Record<string, unknown>;
                required: string[];
            };
        };
        expect(params.message).toBe('Setup your account:');
        expect(params.requestedSchema.type).toBe('object');
        expect(params.requestedSchema.properties).toHaveProperty('name');
        expect(params.requestedSchema.properties).toHaveProperty('plan');
        expect(params.requestedSchema.required).toEqual(['name', 'plan']);

        // Verify the response
        expect(result.accepted).toBe(true);
        expect(result.data).toEqual({ name: 'Alice', plan: 'pro' });
    });

    it('returns declined response correctly', async () => {
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'decline',
        });

        const result = await _elicitStore.run(mockSink, () =>
            ask('Confirm:', { ok: ask.boolean('OK?') }),
        );

        expect(result.declined).toBe(true);
        expect(result.accepted).toBe(false);
        expect(() => result.data).toThrow(ElicitationDeclinedError);
    });

    it('returns cancelled response correctly', async () => {
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'cancel',
        });

        const result = await _elicitStore.run(mockSink, () =>
            ask('Confirm:', { ok: ask.boolean() }),
        );

        expect(result.cancelled).toBe(true);
        expect(result.accepted).toBe(false);
    });

    it('propagates transport errors', async () => {
        const mockSink: ElicitSink = vi.fn().mockRejectedValue(
            new Error('Connection lost'),
        );

        await expect(
            _elicitStore.run(mockSink, () =>
                ask('Test:', { x: ask.string() }),
            ),
        ).rejects.toThrow('Connection lost');
    });
});

// ── ask.redirect() with mock transport ───────────────────

describe('ask.redirect() — with mock ElicitSink', () => {
    it('sends url-mode elicitation request', async () => {
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept',
        });

        const result = await _elicitStore.run(mockSink, () =>
            ask.redirect('Authenticate with GitHub:', 'https://github.com/login/oauth'),
        );

        expect(mockSink).toHaveBeenCalledOnce();
        const call = vi.mocked(mockSink).mock.calls[0]![0];
        expect(call.method).toBe('elicitation/create');

        const params = call.params as { message: string; url: string };
        expect(params.message).toBe('Authenticate with GitHub:');
        expect(params.url).toBe('https://github.com/login/oauth');

        expect(result.accepted).toBe(true);
    });

    it('handles declined redirect', async () => {
        const mockSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'decline',
        });

        const result = await _elicitStore.run(mockSink, () =>
            ask.redirect('Auth:', 'https://example.com'),
        );

        expect(result.declined).toBe(true);
    });
});

// ── Multi-step sequential ask() ──────────────────────────

describe('ask() — multi-step wizard', () => {
    it('supports sequential ask() calls in the same context', async () => {
        let callCount = 0;
        const mockSink: ElicitSink = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { action: 'accept', content: { name: 'Alice' } };
            }
            return { action: 'accept', content: { theme: 'dark' } };
        });

        const [step1, step2] = await _elicitStore.run(mockSink, async () => {
            const s1 = await ask('Step 1:', { name: ask.string() });
            const s2 = await ask(`Hi ${s1.data.name}!`, { theme: ask.enum(['light', 'dark'] as const) });
            return [s1, s2];
        });

        expect(step1.data).toEqual({ name: 'Alice' });
        expect(step2.data).toEqual({ theme: 'dark' });
        expect(mockSink).toHaveBeenCalledTimes(2);
    });

    it('wizard aborts correctly when user declines mid-flow', async () => {
        let callCount = 0;
        const mockSink: ElicitSink = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { action: 'accept', content: { name: 'Bob' } };
            }
            return { action: 'decline' };
        });

        const result = await _elicitStore.run(mockSink, async () => {
            const s1 = await ask('Step 1:', { name: ask.string() });
            if (s1.declined) return 'aborted-step1';

            const s2 = await ask('Step 2:', { plan: ask.enum(['a', 'b'] as const) });
            if (s2.declined) return 'aborted-step2';

            return 'completed';
        });

        expect(result).toBe('aborted-step2');
        expect(mockSink).toHaveBeenCalledTimes(2);
    });
});

// ── Context Isolation ────────────────────────────────────

describe('ask() — AsyncLocalStorage isolation', () => {
    it('concurrent requests use separate transport contexts', async () => {
        const sink1: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept', content: { id: 'from-sink-1' },
        });
        const sink2: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept', content: { id: 'from-sink-2' },
        });

        const [r1, r2] = await Promise.all([
            _elicitStore.run(sink1, () => ask('Q1:', { id: ask.string() })),
            _elicitStore.run(sink2, () => ask('Q2:', { id: ask.string() })),
        ]);

        expect(r1.data.id).toBe('from-sink-1');
        expect(r2.data.id).toBe('from-sink-2');
        expect(sink1).toHaveBeenCalledOnce();
        expect(sink2).toHaveBeenCalledOnce();
    });

    it('nested ALS contexts do not leak', async () => {
        const outerSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept', content: { source: 'outer' },
        });
        const innerSink: ElicitSink = vi.fn().mockResolvedValue({
            action: 'accept', content: { source: 'inner' },
        });

        const result = await _elicitStore.run(outerSink, async () => {
            const inner = await _elicitStore.run(innerSink, () =>
                ask('Inner:', { source: ask.string() }),
            );
            // After inner ALS exits, outer should be restored
            const outer = await ask('Outer:', { source: ask.string() });
            return { inner: inner.data.source, outer: outer.data.source };
        });

        expect(result.inner).toBe('inner');
        expect(result.outer).toBe('outer');
    });
});

// ── Error Classes ────────────────────────────────────────

describe('ElicitationUnsupportedError', () => {
    it('has correct name', () => {
        const err = new ElicitationUnsupportedError();
        expect(err.name).toBe('ElicitationUnsupportedError');
    });

    it('is an instance of Error', () => {
        const err = new ElicitationUnsupportedError();
        expect(err).toBeInstanceOf(Error);
    });
});

describe('ElicitationDeclinedError', () => {
    it('has correct name', () => {
        const err = new ElicitationDeclinedError('decline');
        expect(err.name).toBe('ElicitationDeclinedError');
    });

    it('is an instance of Error', () => {
        const err = new ElicitationDeclinedError('cancel');
        expect(err).toBeInstanceOf(Error);
    });

    it('message distinguishes decline vs cancel', () => {
        const declined = new ElicitationDeclinedError('decline');
        const cancelled = new ElicitationDeclinedError('cancel');

        expect(declined.message).toContain('declined');
        expect(cancelled.message).toContain('cancelled');
    });
});
