/**
 * Bug #3 Regression: FSM session leak with '__default__' in stdio transports
 *
 * BUG: When the transport is stdio (no Mcp-Session-Id header), extractSessionId()
 * returns undefined and the static fallback '__default__' was used as the FSM store
 * key. Multiple stdio clients connected to the same server shared the same FSM state —
 * one client's state overwrites the other's.
 *
 * FIX: Each attachToServer() call generates a unique `crypto.randomUUID()` as the
 * fallbackSessionId. Transports without session IDs get per-attachment isolation
 * instead of sharing a static key.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// ── Simulate the extractSessionId + fallback logic ───────

function extractSessionId(extra: unknown): string | undefined {
    if (typeof extra !== 'object' || extra === null) return undefined;
    const ex = extra as Record<string, unknown>;
    if (typeof ex['sessionId'] === 'string') return ex['sessionId'];
    const headers = ex['headers'] as Record<string, unknown> | undefined;
    if (headers && typeof headers['mcp-session-id'] === 'string') {
        return headers['mcp-session-id'];
    }
    return undefined;
}

/** Simulates the old (buggy) behavior: static '__default__' */
function resolveSessionIdBuggy(extra: unknown): string {
    return extractSessionId(extra) ?? '__default__';
}

/** Simulates the new (fixed) behavior: per-attachment UUID fallback */
function resolveSessionIdFixed(extra: unknown, fallbackSessionId: string): string {
    return extractSessionId(extra) ?? fallbackSessionId;
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #3 — FSM session leak via static __default__ key', () => {
    describe('extractSessionId behavior', () => {
        it('returns sessionId from extra when available', () => {
            const extra = { sessionId: 'abc-123' };
            expect(extractSessionId(extra)).toBe('abc-123');
        });

        it('returns mcp-session-id from headers when available', () => {
            const extra = { headers: { 'mcp-session-id': 'http-session-42' } };
            expect(extractSessionId(extra)).toBe('http-session-42');
        });

        it('returns undefined for stdio-style extra (no session info)', () => {
            const extra = { signal: new AbortController().signal };
            expect(extractSessionId(extra)).toBeUndefined();
        });

        it('returns undefined for null/undefined extra', () => {
            expect(extractSessionId(null)).toBeUndefined();
            expect(extractSessionId(undefined)).toBeUndefined();
        });
    });

    describe('BUGGY: static __default__ causes session collision', () => {
        it('two stdio connections resolve to the SAME session ID', () => {
            const extraClient1 = { signal: new AbortController().signal };
            const extraClient2 = { signal: new AbortController().signal };

            const id1 = resolveSessionIdBuggy(extraClient1);
            const id2 = resolveSessionIdBuggy(extraClient2);

            // BUG: both clients get '__default__' — they share FSM state
            expect(id1).toBe('__default__');
            expect(id2).toBe('__default__');
            expect(id1).toBe(id2); // collision!
        });
    });

    describe('FIXED: per-attachment UUID prevents session collision', () => {
        it('two attachToServer() calls generate different fallbacks', () => {
            const fallback1 = randomUUID();
            const fallback2 = randomUUID();

            expect(fallback1).not.toBe(fallback2);
        });

        it('stdio connections on different attachments get different session IDs', () => {
            const fallback1 = randomUUID();
            const fallback2 = randomUUID();
            const extraStdio = { signal: new AbortController().signal };

            const id1 = resolveSessionIdFixed(extraStdio, fallback1);
            const id2 = resolveSessionIdFixed(extraStdio, fallback2);

            expect(id1).toBe(fallback1);
            expect(id2).toBe(fallback2);
            expect(id1).not.toBe(id2); // no collision!
        });

        it('HTTP connections with session IDs still use their own ID', () => {
            const fallback = randomUUID();
            const extra = { sessionId: 'real-session-id' };

            const id = resolveSessionIdFixed(extra, fallback);
            expect(id).toBe('real-session-id');
            expect(id).not.toBe(fallback);
        });

        it('fallbackSessionId is a valid UUID v4', () => {
            const id = randomUUID();
            expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('FSM snapshots stay isolated per attachment with different fallbacks', () => {
            const store = new Map<string, { state: string }>();
            const fallback1 = randomUUID();
            const fallback2 = randomUUID();
            const stdioExtra = {};

            // Attachment 1: save state
            const sessionId1 = resolveSessionIdFixed(stdioExtra, fallback1);
            store.set(sessionId1, { state: 'step_2' });

            // Attachment 2: save different state
            const sessionId2 = resolveSessionIdFixed(stdioExtra, fallback2);
            store.set(sessionId2, { state: 'step_1' });

            // Each attachment sees its own state
            expect(store.get(sessionId1)!.state).toBe('step_2');
            expect(store.get(sessionId2)!.state).toBe('step_1');
        });

        it('same attachment reuses consistent fallback across requests', () => {
            const fallback = randomUUID();
            const extra1 = { signal: new AbortController().signal };
            const extra2 = { signal: new AbortController().signal };

            const id1 = resolveSessionIdFixed(extra1, fallback);
            const id2 = resolveSessionIdFixed(extra2, fallback);

            // Same attachment = same fallback = same session ID for stdio
            expect(id1).toBe(id2);
            expect(id1).toBe(fallback);
        });
    });
});
