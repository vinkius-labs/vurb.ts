/**
 * SandboxBugs-134-138.test.ts
 *
 * Regression tests for:
 *   #134 — _emitTelemetry uses `as any` → type safety bypassed (compile-time fix, runtime verified here)
 *   #135 — ExternalCopy(data) errors mis-classified as RUNTIME → now INVALID_DATA
 *   #136 — Async guard only checked start of string → now detects async anywhere in body
 *   #137 — getIvm() no retry after failure → resetIvmCache() exported for tests
 *   #138 — TextEncoder created per call → hoisted to module-level constant (compile-time fix)
 *
 * Requires `isolated-vm` for execution-level tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { SandboxEngine, resetIvmCache } from '../../src/sandbox/SandboxEngine.js';
import { validateSandboxCode } from '../../src/sandbox/SandboxGuard.js';

let ivmAvailable = false;
try {
    require('isolated-vm');
    ivmAvailable = true;
} catch {
    // isolated-vm not installed — skip
}

const describeSandbox = ivmAvailable ? describe : describe.skip;

// ============================================================================
// Bug #134 — _emitTelemetry type safety (runtime verification)
// ============================================================================

describeSandbox('Bug #134: _emitTelemetry type safety', () => {
    it('should emit typed SandboxExecEvent with correct fields on success', async () => {
        const events: unknown[] = [];
        const engine = new SandboxEngine({
            timeout: 2000,
            memoryLimit: 32,
        });
        engine.telemetry((e) => events.push(e));
        try {
            const result = await engine.execute('(data) => data + 1', 41);
            expect(result.ok).toBe(true);
            expect(events).toHaveLength(1);

            const evt = events[0] as Record<string, unknown>;
            expect(evt.type).toBe('sandbox.exec');
            expect(evt.ok).toBe(true);
            expect(typeof evt.executionMs).toBe('number');
            expect(typeof evt.timestamp).toBe('number');
            // errorCode should NOT be present on success (not even as undefined)
            expect(evt).not.toHaveProperty('errorCode');
        } finally {
            engine.dispose();
        }
    });

    it('should emit typed SandboxExecEvent with errorCode on failure', async () => {
        const events: unknown[] = [];
        const engine = new SandboxEngine({
            timeout: 2000,
            memoryLimit: 32,
        });
        engine.telemetry((e) => events.push(e));
        try {
            const result = await engine.execute('(data) => { throw new Error("boom"); }', {});
            expect(result.ok).toBe(false);
            expect(events).toHaveLength(1);

            const evt = events[0] as Record<string, unknown>;
            expect(evt.type).toBe('sandbox.exec');
            expect(evt.ok).toBe(false);
            expect(evt.errorCode).toBe('RUNTIME');
            expect(typeof evt.timestamp).toBe('number');
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Bug #135 — ExternalCopy(data) errors classified as INVALID_DATA
// ============================================================================

describeSandbox('Bug #135: INVALID_DATA for non-serializable input', () => {
    it('should return INVALID_DATA when data contains a function', async () => {
        const events: unknown[] = [];
        const engine = new SandboxEngine({
            timeout: 2000,
            memoryLimit: 32,
        });
        engine.telemetry((e) => events.push(e));
        try {
            // Functions are not serializable by ExternalCopy
            const result = await engine.execute('(data) => data', { fn: () => 42 });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('INVALID_DATA');
                expect(result.error).toContain('Data serialization error');
                expect(result.error).toContain('non-serializable');
            }
            // Telemetry should be emitted for INVALID_DATA
            expect(events).toHaveLength(1);
            const evt = events[0] as Record<string, unknown>;
            expect(evt.errorCode).toBe('INVALID_DATA');
        } finally {
            engine.dispose();
        }
    });

    it('should still classify genuine runtime errors as RUNTIME', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
        try {
            const result = await engine.execute('(data) => data.nonExistent.property', {});
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('RUNTIME');
            }
        } finally {
            engine.dispose();
        }
    });
});

// ============================================================================
// Bug #136 — Async detection in guard body
// ============================================================================

describe('Bug #136: Async detection anywhere in code body', () => {
    it('should reject async at the start of code', () => {
        const result = validateSandboxCode('async (data) => data');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should reject async IIFE nested in body', () => {
        const result = validateSandboxCode('(data) => { (async () => { })(); return data; }');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should reject async function nested in body', () => {
        const result = validateSandboxCode('(data) => { const f = async function() {}; return data; }');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should NOT false-positive on the string "async" inside quotes', () => {
        const result = validateSandboxCode('(data) => data.filter(d => d.type !== "async")');
        expect(result.ok).toBe(true);
    });

    it('should NOT false-positive on single-quoted "async" string', () => {
        const result = validateSandboxCode("(data) => data.filter(d => d.type !== 'async')");
        expect(result.ok).toBe(true);
    });

    it('should NOT false-positive on template literal containing async', () => {
        const result = validateSandboxCode('(data) => `status: async mode ${data}`');
        expect(result.ok).toBe(true);
    });

    it('should reject async arrow in a callback', () => {
        const result = validateSandboxCode('(data) => data.map(async (x) => x * 2)');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should allow synchronous code with no async keyword', () => {
        const result = validateSandboxCode('(data) => data.filter(d => d.value > 10)');
        expect(result.ok).toBe(true);
    });
});

// ============================================================================
// Bug #137 — resetIvmCache() exported for tests
// ============================================================================

describe('Bug #137: resetIvmCache() for test mock/unmock cycles', () => {
    it('should export resetIvmCache as a function', () => {
        expect(typeof resetIvmCache).toBe('function');
    });

    it('should allow re-resolution of isolated-vm after reset', () => {
        // Call resetIvmCache — should not throw
        resetIvmCache();

        // After reset, SandboxEngine constructor should still work
        // (if isolated-vm is available) or throw a clear error (if not)
        if (ivmAvailable) {
            const engine = new SandboxEngine({ timeout: 1000, memoryLimit: 16 });
            expect(engine.isDisposed).toBe(false);
            engine.dispose();
        } else {
            expect(() => new SandboxEngine()).toThrow();
        }
    });
});

// ============================================================================
// Bug #138 — TextEncoder hoisted (compile-time fix, verifiable via execution)
// ============================================================================

describeSandbox('Bug #138: TextEncoder reuse (integration verification)', () => {
    it('should correctly measure output byte length across multiple calls', async () => {
        const engine = new SandboxEngine({
            timeout: 2000,
            memoryLimit: 32,
            maxOutputBytes: 100,
        });
        try {
            // First call: small output, should succeed
            const r1 = await engine.execute('(data) => data', 'hello');
            expect(r1.ok).toBe(true);

            // Second call: same pattern, should also succeed (TextEncoder reused)
            const r2 = await engine.execute('(data) => data', 'world');
            expect(r2.ok).toBe(true);

            // Third call: oversized output, should fail with OUTPUT_TOO_LARGE
            const r3 = await engine.execute('(data) => data', 'x'.repeat(200));
            expect(r3.ok).toBe(false);
            if (!r3.ok) {
                expect(r3.code).toBe('OUTPUT_TOO_LARGE');
            }
        } finally {
            engine.dispose();
        }
    });
});
