/**
 * SandboxGuard — Fail-Fast Syntax Checker for LLM-Provided Code
 *
 * Provides quick feedback BEFORE sending code to the isolated-vm engine.
 * This is NOT a security boundary — security comes from the empty V8
 * Context (no `process`, `require`, `fs`, or `globalThis` injected).
 *
 * Purpose:
 * - Validate that the code is syntactically valid JavaScript
 * - Check that it looks like a function expression / arrow function
 * - Provide fast, descriptive error messages to the LLM
 *
 * Properties:
 * - Zero runtime dependencies (pure string analysis)
 * - Fail-fast: rejects obviously broken code before V8 boot
 * - NOT a security gate (LLMs can obfuscate; the Isolate is the real wall)
 *
 * @module
 * @internal
 */

// ── Types ────────────────────────────────────────────────

export interface GuardResult {
    /** Whether the code passed the fail-fast check */
    readonly ok: boolean;
    /** Human-readable reason for rejection (present when `ok` is false) */
    readonly violation?: string;
}

// ── Constants ────────────────────────────────────────────

/**
 * Patterns that indicate the code is NOT a pure function.
 * These are fail-fast hints, not security barriers.
 * The V8 Isolate with an empty Context is the real security wall.
 */
const SUSPICIOUS_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bimport\s*\(/, reason: 'Dynamic import() is not available in the sandbox.' },
    { pattern: /\bimport\s+/, reason: 'ES module imports are not available in the sandbox.' },
    { pattern: /\brequire\s*\(/, reason: 'require() is not available in the sandbox.' },
];

/**
 * The code must start with one of these patterns to be recognized
 * as a function expression or arrow function.
 */
const FUNCTION_PATTERNS: ReadonlyArray<RegExp> = [
    /^\s*\(.*\)\s*=>/s,              // (x) => ...
    /^\s*[a-zA-Z_$]\w*\s*=>/,       // x => ...
    /^\s*function\s*\(/,             // function(x) { ... }
    /^\s*function\s+\w+\s*\(/,       // function name(x) { ... }
    // Async patterns kept for shape recognition — SUSPICIOUS_PATTERNS
    // will reject them before they reach execution (Bug #16)
    /^\s*async\s+\(.*\)\s*=>/s,      // async (x) => ...
    /^\s*async\s+function\s*\(/,     // async function(x) { ... }
    /^\s*async\s+[a-zA-Z_$]\w*\s*=>/, // async x => ...
];

// ── Guard Implementation ─────────────────────────────────

/**
 * Validate LLM-provided code before sending it to the sandbox.
 *
 * Performs two checks:
 * 1. **Shape check**: The code must look like a function expression
 * 2. **Suspicious pattern check**: Fail-fast for obviously unsandboxable patterns
 *
 * @param code - The JavaScript code string from the LLM
 * @returns A `GuardResult` indicating whether the code passed
 *
 * @example
 * ```typescript
 * const result = validateSandboxCode('(data) => data.filter(d => d.x > 5)');
 * // { ok: true }
 *
 * const bad = validateSandboxCode('require("fs").readFileSync("/etc/passwd")');
 * // { ok: false, violation: 'Code must be a function expression...' }
 * ```
 */
export function validateSandboxCode(code: string): GuardResult {
    if (!code || typeof code !== 'string') {
        return { ok: false, violation: 'Code must be a non-empty string.' };
    }

    const trimmed = code.trim();

    if (trimmed.length === 0) {
        return { ok: false, violation: 'Code must be a non-empty string.' };
    }

    // Shape check: must look like a function
    const looksLikeFunction = FUNCTION_PATTERNS.some(p => p.test(trimmed));
    if (!looksLikeFunction) {
        return {
            ok: false,
            violation:
                'Code must be a function expression or arrow function. ' +
                'Example: (data) => data.filter(d => d.value > 10)',
        };
    }

    // Suspicious pattern check (fail-fast hints, not security)
    for (const { pattern, reason } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { ok: false, violation: reason };
        }
    }

    // Bug #136: detect `async` anywhere in the code (not just at the start).
    // Strip string literals first to avoid false positives on e.g. "async".
    if (containsAsyncKeyword(trimmed)) {
        return {
            ok: false,
            violation:
                'Async functions are not supported in the sandbox. ' +
                'The sandbox uses synchronous JSON.stringify(fn(input)) — ' +
                'an async function would serialize to \'{}\'. ' +
                'Use a synchronous function instead.',
        };
    }

    return { ok: true };
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Strip string literals (single, double, template) to avoid
 * false positives when scanning for keywords like `async`.
 * Replaces each string literal with empty quotes of the same kind.
 * @internal
 */
function stripStringLiterals(code: string): string {
    // Match single-quoted, double-quoted, and back-tick strings
    // (respects escape sequences: \' \" \` don't close the string)
    return code.replace(/(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/gs, '""');
}

/**
 * Check if `async` appears as a keyword anywhere in the code,
 * ignoring occurrences inside string literals (Bug #136).
 * @internal
 */
function containsAsyncKeyword(code: string): boolean {
    return /\basync\b/.test(stripStringLiterals(code));
}
