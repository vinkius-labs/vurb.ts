/**
 * SandboxGuard.test.ts
 *
 * Tests for the fail-fast syntax checker.
 *
 * Validates:
 *   - Accepts valid arrow functions and function expressions
 *   - Rejects non-function code
 *   - Fail-fast for import/require patterns (hints, not security)
 *   - Edge cases: empty input, whitespace, async functions
 */
import { describe, it, expect } from 'vitest';
import { validateSandboxCode } from '../../src/sandbox/SandboxGuard.js';

// ============================================================================
// Valid Code Patterns
// ============================================================================

describe('SandboxGuard: Valid Code', () => {
    it('should accept simple arrow function', () => {
        const result = validateSandboxCode('(data) => data.length');
        expect(result.ok).toBe(true);
    });

    it('should accept arrow function with filter', () => {
        const result = validateSandboxCode('(data) => data.filter(d => d.value > 10)');
        expect(result.ok).toBe(true);
    });

    it('should accept arrow function with block body', () => {
        const result = validateSandboxCode('(data) => { return data.map(d => d.name); }');
        expect(result.ok).toBe(true);
    });

    it('should accept multi-line arrow function', () => {
        const code = `(data) => {
            const filtered = data.filter(d => d.active);
            return filtered.length;
        }`;
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });

    it('should accept function expression', () => {
        const result = validateSandboxCode('function(data) { return data.length; }');
        expect(result.ok).toBe(true);
    });

    it('should accept named function expression', () => {
        const result = validateSandboxCode('function process(data) { return data.length; }');
        expect(result.ok).toBe(true);
    });

    it('should accept single-param arrow without parens', () => {
        const result = validateSandboxCode('data => data.length');
        expect(result.ok).toBe(true);
    });

    it('should accept arrow with leading whitespace', () => {
        const result = validateSandboxCode('  (data) => data.length');
        expect(result.ok).toBe(true);
    });

    it('should reject async arrow function (Bug #16 — async produces empty result in sandbox)', () => {
        const result = validateSandboxCode('async (data) => data.length');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should reject async function expression (Bug #16)', () => {
        const result = validateSandboxCode('async function(data) { return data.length; }');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should reject async single-param arrow (Bug #16)', () => {
        const result = validateSandboxCode('async data => data.length');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should accept destructured params', () => {
        const result = validateSandboxCode('({ items, total }) => items.length');
        expect(result.ok).toBe(true);
    });

    it('should accept complex map/reduce', () => {
        const code = '(data) => data.reduce((acc, item) => acc + item.amount, 0)';
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });
});

// ============================================================================
// Invalid Code Patterns
// ============================================================================

describe('SandboxGuard: Invalid Code', () => {
    it('should reject empty string', () => {
        const result = validateSandboxCode('');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('non-empty');
    });

    it('should reject whitespace-only string', () => {
        const result = validateSandboxCode('   ');
        expect(result.ok).toBe(false);
    });

    it('should reject null/undefined', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = validateSandboxCode(null as any);
        expect(result.ok).toBe(false);
    });

    it('should reject plain expression (not a function)', () => {
        const result = validateSandboxCode('42 + 58');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('function');
    });

    it('should reject assignment statement', () => {
        const result = validateSandboxCode('const x = 42');
        expect(result.ok).toBe(false);
    });

    it('should reject class declaration', () => {
        const result = validateSandboxCode('class Foo {}');
        expect(result.ok).toBe(false);
    });

    it('should reject object literal (not a function)', () => {
        const result = validateSandboxCode('{ key: "value" }');
        expect(result.ok).toBe(false);
    });
});

// ============================================================================
// Suspicious Patterns (Fail-Fast Hints)
// ============================================================================

describe('SandboxGuard: Suspicious Patterns', () => {
    it('should reject require()', () => {
        const result = validateSandboxCode('(data) => require("fs").readFileSync("/etc/passwd")');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('require');
    });

    it('should reject dynamic import()', () => {
        const result = validateSandboxCode('(data) => import("fs")');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('import');
    });

    it('should reject ES module import', () => {
        const code = 'import fs from "fs";\n(data) => data';
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(false);
    });

    it('should NOT reject "process" in code (guard is fail-fast, not security)', () => {
        // The SandboxGuard does NOT block process — security comes from
        // the empty V8 Context. process will simply be undefined at runtime.
        const result = validateSandboxCode('(data) => process.env');
        expect(result.ok).toBe(true);
    });

    it('should reject "eval()" in code (Bug #139 — fail-fast feedback for LLM)', () => {
        // Bug #139: eval() is now blocked at the guard level for
        // fail-fast LLM feedback, even though the empty V8 Context
        // ensures no security risk.
        const result = validateSandboxCode('(data) => eval("1+1")');
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('eval()');
    });
});

// ============================================================================
// Regression: async keyword in comments/strings
// ============================================================================

describe('SandboxGuard: async in comments and strings', () => {
    it('should accept code with "async" in a line comment', () => {
        const code = `(data) => {
            // This is an async operation description
            return data.length;
        }`;
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });

    it('should accept code with "async" in a block comment', () => {
        const code = `(data) => {
            /* async processing note */
            return data.filter(d => d.active);
        }`;
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });

    it('should accept code with "async" in a string literal', () => {
        const code = `(data) => data.filter(d => d.type !== "async")`;
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });

    it('should accept code with "async" in a template literal', () => {
        const code = '(data) => `mode: async, count: ${data.length}`';
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(true);
    });

    it('should still reject actual async arrow function', () => {
        const code = 'async (data) => data.length';
        const result = validateSandboxCode(code);
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Async');
    });

    it('should still reject async function with comment on different line', () => {
        const code = `// just a comment
        async (data) => data.length`;
        const result = validateSandboxCode(code);
        // Rejected: comment on separate line breaks function-shape detection
        expect(result.ok).toBe(false);
    });
});
