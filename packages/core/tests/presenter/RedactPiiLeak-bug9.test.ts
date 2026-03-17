/**
 * Bug #9 Regression: RedactEngine returns original PII when structuredClone fails
 *
 * BUG: `compileRedactor()` used `structuredClone(data)` before applying masking.
 * If structuredClone failed (e.g., object with Socket, ReadStream, WeakRef),
 * the catch block returned `data` — the original unredacted object with PII.
 * For a framework whose moat is "PII never leaves the wire", this is a
 * direct violation.
 *
 * FIX: On redaction failure, throw an explicit error instead of silently
 * returning unredacted data. Callers must handle the error — PII is never
 * exposed on the wire.
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { compileRedactor, initRedactEngine } from '../../src/presenter/RedactEngine.js';

// ── Setup ────────────────────────────────────────────────

// fast-redact must be loaded before compileRedactor works
let engineReady = false;

async function ensureEngine() {
    if (!engineReady) {
        engineReady = await initRedactEngine();
    }
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #9 — PII leak when structuredClone fails', () => {
    describe('BUGGY behavior: returns unredacted data', () => {
        it('demonstrates the old pattern where PII leaks on clone failure', () => {
            // Simulate the old buggy redactor
            const buggyRedactor = (data: unknown): unknown => {
                if (data === null || typeof data !== 'object') return data;
                try {
                    const clone = structuredClone(data);
                    // apply redaction to clone...
                    (clone as Record<string, unknown>).ssn = '[REDACTED]';
                    return clone;
                } catch {
                    return data; // ⚠️ BUG: returns original PII
                }
            };

            // Object with non-cloneable value
            const sensitiveData = {
                name: 'John Doe',
                ssn: '123-45-6789',
                callback: () => {}, // functions can't be structuredClone'd
            };

            const result = buggyRedactor(sensitiveData) as Record<string, unknown>;
            // BUG: original data returned with PII intact
            expect(result.ssn).toBe('123-45-6789');
            expect(result).toBe(sensitiveData); // same reference!
        });
    });

    describe('FIXED behavior: throws on redaction failure', () => {
        it('throws explicit error when structuredClone fails', async () => {
            await ensureEngine();
            if (!engineReady) return; // skip if fast-redact not available

            const redact = compileRedactor({
                paths: ['*.ssn'],
                censor: '[REDACTED]',
            });

            if (!redact) return; // fast-redact not available

            // Object with non-cloneable value triggers structuredClone failure
            const sensitiveData = {
                name: 'John Doe',
                ssn: '123-45-6789',
                callback: () => {}, // not cloneable
            };

            expect(() => redact(sensitiveData)).toThrow('[Vurb] PII redaction failed');
        });

        it('error message mentions PII leak prevention', async () => {
            await ensureEngine();
            if (!engineReady) return;

            const redact = compileRedactor({
                paths: ['*.ssn'],
            });

            if (!redact) return;

            const data = {
                ssn: '999-99-9999',
                socket: () => {}, // non-cloneable
            };

            expect(() => redact(data)).toThrow('Data withheld to prevent PII leak');
        });

        it('never returns the original data reference', async () => {
            await ensureEngine();
            if (!engineReady) return;

            const redact = compileRedactor({
                paths: ['*.secret'],
            });

            if (!redact) return;

            const original = { secret: 'top-secret', fn: () => {} };

            let result: unknown = undefined;
            try {
                result = redact(original);
            } catch {
                // Expected — error thrown instead of leaking PII
            }

            // If somehow result was returned, it must NOT be the original
            if (result !== undefined) {
                expect(result).not.toBe(original);
            }
        });
    });

    describe('normal redaction still works', () => {
        it('redacts cloneable data correctly', async () => {
            await ensureEngine();
            if (!engineReady) return;

            const redact = compileRedactor({
                paths: ['ssn', 'credit_card'],
                censor: '[REDACTED]',
            });

            if (!redact) return;

            const data = {
                name: 'Jane Doe',
                ssn: '123-45-6789',
                credit_card: '4111-1111-1111-1111',
            };

            const result = redact(data) as Record<string, unknown>;
            expect(result.name).toBe('Jane Doe');
            expect(result.ssn).toBe('[REDACTED]');
            expect(result.credit_card).toBe('[REDACTED]');
        });

        it('passes through primitives without error', async () => {
            await ensureEngine();
            if (!engineReady) return;

            const redact = compileRedactor({ paths: ['*.ssn'] });
            if (!redact) return;

            expect(redact('hello')).toBe('hello');
            expect(redact(42)).toBe(42);
            expect(redact(null)).toBeNull();
            expect(redact(undefined)).toBeUndefined();
        });

        it('returns a clone, not the original reference', async () => {
            await ensureEngine();
            if (!engineReady) return;

            const redact = compileRedactor({
                paths: ['secret'],
                censor: '[REDACTED]',
            });

            if (!redact) return;

            const original = { secret: 'value', keep: 'this' };
            const result = redact(original);
            expect(result).not.toBe(original);
            expect((result as Record<string, unknown>).keep).toBe('this');
        });
    });
});
