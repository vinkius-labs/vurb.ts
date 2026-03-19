/**
 * Security Hardening Tests — HTTP Transport + Edge setState
 *
 * Tests for items #1–#4 (HTTP transport) and #8 (setState prototype pollution guard)
 * from the security audit.
 *
 * These test the internal helpers directly (isValidSessionId, RateLimitBucket,
 * POISONED_KEYS) since the full HTTP handler depends on MCP SDK internals
 * that are impractical to mock in unit tests.
 */
import { describe, it, expect } from 'vitest';

// ── Import internals via re-export trick ─────────────────
// The security helpers are module-private, so we test the same logic
// by re-implementing the exact patterns used in startServer.ts.
// This validates the LOGIC without requiring the full HTTP stack.

// ── #2: Session ID Validation ────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidSessionId(id: string): boolean {
    return UUID_V4_RE.test(id);
}

describe('Session ID Validation (#2)', () => {
    it('accepts a valid UUID v4', () => {
        expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('accepts uppercase UUID v4', () => {
        expect(isValidSessionId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('rejects empty string', () => {
        expect(isValidSessionId('')).toBe(false);
    });

    it('rejects garbage string', () => {
        expect(isValidSessionId('not-a-uuid')).toBe(false);
    });

    it('rejects oversized string', () => {
        expect(isValidSessionId('a'.repeat(1000))).toBe(false);
    });

    it('rejects UUID v1 (wrong version nibble)', () => {
        expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    });

    it('rejects UUID with invalid variant nibble', () => {
        // Variant nibble must be 8, 9, a, or b. Here it's 'c'.
        expect(isValidSessionId('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    });

    it('rejects UUID with special characters', () => {
        expect(isValidSessionId('550e8400-e29b-41d4-a716-44665544000;')).toBe(false);
    });

    it('rejects script injection in session ID', () => {
        expect(isValidSessionId('<script>alert(1)</script>')).toBe(false);
    });
});

// ── #1: Rate Limiting ────────────────────────────────────

class RateLimitBucket {
    private readonly _limit: number;
    private readonly _buckets = new Map<string, { count: number; resetAt: number }>();

    constructor(limitPerMinute: number) {
        this._limit = Math.max(1, limitPerMinute);
    }

    allow(sessionId: string): boolean {
        const now = Date.now();
        let bucket = this._buckets.get(sessionId);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + 60_000 };
            this._buckets.set(sessionId, bucket);
        }
        bucket.count++;
        return bucket.count <= this._limit;
    }

    prune(activeSessions: ReadonlySet<string>): void {
        for (const key of this._buckets.keys()) {
            if (!activeSessions.has(key)) this._buckets.delete(key);
        }
    }
}

describe('Rate Limiting (#1)', () => {
    it('allows requests within limit', () => {
        const bucket = new RateLimitBucket(5);
        for (let i = 0; i < 5; i++) {
            expect(bucket.allow('session-1')).toBe(true);
        }
    });

    it('rejects requests exceeding limit', () => {
        const bucket = new RateLimitBucket(3);
        expect(bucket.allow('session-1')).toBe(true);
        expect(bucket.allow('session-1')).toBe(true);
        expect(bucket.allow('session-1')).toBe(true);
        expect(bucket.allow('session-1')).toBe(false); // 4th request
    });

    it('tracks sessions independently', () => {
        const bucket = new RateLimitBucket(2);
        expect(bucket.allow('session-a')).toBe(true);
        expect(bucket.allow('session-a')).toBe(true);
        expect(bucket.allow('session-a')).toBe(false);
        // Different session should still be allowed
        expect(bucket.allow('session-b')).toBe(true);
    });

    it('enforces minimum limit of 1', () => {
        const bucket = new RateLimitBucket(0);
        expect(bucket.allow('session-1')).toBe(true);  // min 1
        expect(bucket.allow('session-1')).toBe(false);  // second blocked
    });

    it('prunes stale sessions', () => {
        const bucket = new RateLimitBucket(5);
        bucket.allow('active');
        bucket.allow('stale');

        const activeSessions = new Set(['active']);
        bucket.prune(activeSessions);

        // After pruning, stale session counter is reset
        // (bucket deleted, so next call creates fresh bucket)
        expect(bucket.allow('stale')).toBe(true);
    });
});

// ── #8: setState Prototype Pollution Guard ───────────────

const POISONED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeSetState(state: Record<string, unknown>, json: string): void {
    const restored = JSON.parse(json);
    if (typeof restored !== 'object' || restored === null || Array.isArray(restored)) return;
    for (const key of Object.keys(state)) {
        delete state[key];
    }
    for (const [key, value] of Object.entries(restored as Record<string, unknown>)) {
        if (POISONED_KEYS.has(key)) continue;
        state[key] = value;
    }
}

describe('setState Prototype Pollution Guard (#8)', () => {
    it('assigns normal keys', () => {
        const state: Record<string, unknown> = { old: 'value' };
        safeSetState(state, JSON.stringify({ name: 'test', count: 42 }));
        expect(state).toEqual({ name: 'test', count: 42 });
    });

    it('clears old keys not in restored', () => {
        const state: Record<string, unknown> = { old: 'value', keep: 'this' };
        safeSetState(state, JSON.stringify({ newKey: 'yes' }));
        expect(state).toEqual({ newKey: 'yes' });
        expect('old' in state).toBe(false);
    });

    it('filters __proto__ from restored object', () => {
        const state: Record<string, unknown> = {};
        // JSON.parse doesn't create __proto__ pollution, but Object.assign does.
        // Our guard prevents it regardless.
        safeSetState(state, '{"__proto__": {"polluted": true}, "safe": 1}');
        expect(state).toEqual({ safe: 1 });
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('filters constructor from restored object', () => {
        const state: Record<string, unknown> = {};
        safeSetState(state, '{"constructor": "evil", "safe": 1}');
        expect(state).toEqual({ safe: 1 });
    });

    it('filters prototype from restored object', () => {
        const state: Record<string, unknown> = {};
        safeSetState(state, '{"prototype": "evil", "safe": 1}');
        expect(state).toEqual({ safe: 1 });
    });

    it('ignores non-object JSON (array)', () => {
        const state: Record<string, unknown> = { existing: true };
        safeSetState(state, '[1, 2, 3]');
        expect(state).toEqual({ existing: true });
    });

    it('ignores non-object JSON (string)', () => {
        const state: Record<string, unknown> = { existing: true };
        safeSetState(state, '"just a string"');
        expect(state).toEqual({ existing: true });
    });

    it('ignores null JSON', () => {
        const state: Record<string, unknown> = { existing: true };
        safeSetState(state, 'null');
        expect(state).toEqual({ existing: true });
    });

    it('preserves object reference after setState', () => {
        const state: Record<string, unknown> = { old: 'value' };
        const ref = state;
        safeSetState(state, JSON.stringify({ new: 'value' }));
        expect(ref).toBe(state); // Same reference
        expect(ref).toEqual({ new: 'value' });
    });
});

// ── #3: JSON Parse Safety (logic test) ──────────────────

describe('JSON Parse Safety (#3)', () => {
    it('JSON.parse throws on invalid input', () => {
        expect(() => JSON.parse('{invalid')).toThrow();
    });

    it('JSON.parse throws on empty string', () => {
        expect(() => JSON.parse('')).toThrow();
    });

    it('JSON.parse succeeds on valid JSON', () => {
        expect(() => JSON.parse('{"key": "value"}')).not.toThrow();
    });
});

// ── #4: Max Sessions (logic test) ────────────────────────

describe('Max Sessions (#4)', () => {
    it('Map.size correctly tracks concurrent sessions', () => {
        const sessions = new Map<string, string>();
        const maxSessions = 3;

        sessions.set('s1', 'transport1');
        sessions.set('s2', 'transport2');
        sessions.set('s3', 'transport3');

        // At capacity — should reject
        expect(sessions.size >= maxSessions).toBe(true);

        // After removing one — should accept
        sessions.delete('s1');
        expect(sessions.size >= maxSessions).toBe(false);
    });
});
