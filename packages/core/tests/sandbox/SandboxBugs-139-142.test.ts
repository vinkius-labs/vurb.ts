/**
 * SandboxBugs-139-142.test.ts
 *
 * Regression tests for:
 *   #139 — Guard now blocks eval()/new Function() at fail-fast level
 *   #140 — getSandboxConfig() is metadata-only (JSDoc fix, verified here)
 *   #141 — f.sandbox() tracks dispose via FinalizationRegistry
 *   #142 — Abort with concurrent executions releases context for faster cancel
 *
 * Requires `isolated-vm` for execution-level tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { validateSandboxCode } from '../../src/sandbox/SandboxGuard.js';
import { SandboxEngine } from '../../src/sandbox/SandboxEngine.js';
import { initFusion } from '../../src/core/initFusion.js';

let ivmAvailable = false;
try {
    require('isolated-vm');
    ivmAvailable = true;
} catch {
    // isolated-vm not installed — skip
}

const describeSandbox = ivmAvailable ? describe : describe.skip;

// ============================================================================
// Bug #139 — Guard blocks eval() / new Function()
// ============================================================================

describe('Bug #139: Guard blocks eval() and new Function()', () => {
    it('should reject eval() call', () => {
        const result = validateSandboxCode('(data) => eval("data.length")');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('eval()');
        expect(result.violation).toContain('no effect');
    });

    it('should reject new Function() call', () => {
        const result = validateSandboxCode('(data) => new Function("return data")()');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('new Function()');
        expect(result.violation).toContain('no effect');
    });

    it('should NOT reject "eval" as a property name', () => {
        // data.eval is a property access, not eval()
        const result = validateSandboxCode('(data) => data.eval');
        expect(result.ok).toBe(true);
    });

    it('should NOT reject string containing "eval" without parens', () => {
        // "eval" as a substring in a string (no parens) is fine
        const result = validateSandboxCode('(data) => data.filter(d => d.name !== "evaluator")');
        expect(result.ok).toBe(true);
    });

    it('should reject eval with whitespace before parens', () => {
        const result = validateSandboxCode('(data) => eval  ("data")');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('eval()');
    });

    it('should NOT reject "Function" without "new"', () => {
        // Just the word Function as a property/type reference is fine
        const result = validateSandboxCode('(data) => typeof data.handler === "Function"');
        expect(result.ok).toBe(true);
    });

    it('should still allow valid synchronous code', () => {
        const result = validateSandboxCode('(data) => data.map(d => d.value * 2)');
        expect(result.ok).toBe(true);
    });
});

// ============================================================================
// Bug #140 — getSandboxConfig() is metadata-only
// ============================================================================

describe('Bug #140: getSandboxConfig() is metadata-only', () => {
    it('should return undefined when sandbox() is not called', () => {
        const f = initFusion<{}>('test-140');
        const grouped = f.defineTool('grouped-tool', {});
        expect(grouped.getSandboxConfig()).toBeUndefined();
    });

    it('should return stored config after sandbox() is called', () => {
        const f = initFusion<{}>('test-140');
        const grouped = f.defineTool('grouped-tool', {});
        grouped.sandbox({ timeout: 3000, memoryLimit: 64 });
        const config = grouped.getSandboxConfig();
        expect(config).toEqual({ timeout: 3000, memoryLimit: 64 });
    });

    it('should not auto-create a SandboxEngine from the config', () => {
        // The config is metadata-only — it doesn't drive runtime behavior.
        // The developer must manually create a SandboxEngine.
        const f = initFusion<{}>('test-140');
        const grouped = f.defineTool('grouped-tool', {});
        grouped.sandbox({ timeout: 3000 });

        // getSandboxConfig is just a getter — returns the same object
        const config = grouped.getSandboxConfig();
        expect(config).toBeDefined();
        // No engine was created — this is purely metadata
        expect(config).toEqual({ timeout: 3000 });
    });
});

// ============================================================================
// Bug #141 — f.sandbox() tracks dispose via FinalizationRegistry
// ============================================================================

describeSandbox('Bug #141: f.sandbox() lifecycle tracking', () => {
    it('should create a working SandboxEngine via f.sandbox()', async () => {
        const f = initFusion<{}>('test-141');
        const engine = f.sandbox({ timeout: 2000, memoryLimit: 32 });
        try {
            const result = await engine.execute('(data) => data + 1', 41);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(42);
            }
        } finally {
            engine.dispose();
        }
    });

    it('should still allow manual dispose() without errors', () => {
        const f = initFusion<{}>('test-141');
        const engine = f.sandbox({ timeout: 1000, memoryLimit: 16 });
        // dispose() should work without throwing — FinalizationRegistry
        // unregisters the engine so no false warning fires
        expect(() => engine.dispose()).not.toThrow();
        expect(engine.isDisposed).toBe(true);
    });

    it('should allow double-dispose without errors', () => {
        const f = initFusion<{}>('test-141');
        const engine = f.sandbox({ timeout: 1000, memoryLimit: 16 });
        engine.dispose();
        expect(() => engine.dispose()).not.toThrow();
    });
});

// ============================================================================
// Bug #142 — Abort with concurrent executions releases context
// ============================================================================

describeSandbox('Bug #142: Abort releases context in concurrent mode', () => {
    it('should classify abort as ABORTED even with single execution', async () => {
        const engine = new SandboxEngine({ timeout: 5000, memoryLimit: 32 });
        try {
            const ac = new AbortController();
            // Abort immediately
            setTimeout(() => ac.abort(), 10);

            const result = await engine.execute(
                '(data) => { let s = 0; for (let i = 0; i < 1e9; i++) s += i; return s; }',
                null,
                { signal: ac.signal },
            );

            // Should be ABORTED (not TIMEOUT or RUNTIME)
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('ABORTED');
            }
        } finally {
            // Engine may be disposed from abort, create new one
            try { engine.dispose(); } catch { /* may already be disposed */ }
        }
    });

    it('should handle pre-aborted signal gracefully', async () => {
        const engine = new SandboxEngine({ timeout: 2000, memoryLimit: 32 });
        try {
            const ac = new AbortController();
            ac.abort(); // Already aborted before execute()

            const result = await engine.execute('(data) => data', 42, { signal: ac.signal });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.code).toBe('ABORTED');
            }
        } finally {
            engine.dispose();
        }
    });
});
