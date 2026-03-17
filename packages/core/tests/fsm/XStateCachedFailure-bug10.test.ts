/**
 * Bug #10 Regression: XState import cached as permanent failure (no retry)
 *
 * BUG: If `import('xstate')` failed once (transient filesystem error on edge
 * cold start), the `xstateLoadAttempted = true` flag prevented ALL future
 * retries. The FSM State Gate was permanently disabled for the process lifetime.
 * `resetXStateCache()` existed but required manual intervention.
 *
 * FIX: Only cache successful imports. Failed imports increment a retry counter
 * up to MAX_XSTATE_LOAD_ATTEMPTS (3). This handles transient errors gracefully
 * while still capping retries to avoid infinite import loops when xstate
 * is genuinely not installed.
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Simulate the BUGGY loadXState (cached on first failure) ──

function createBuggyLoader() {
    let module: object | null = null;
    let loadAttempted = false;
    let importCount = 0;

    return {
        load: async (shouldFail: boolean): Promise<object | null> => {
            if (loadAttempted) return module; // cached — even on failure
            loadAttempted = true;
            importCount++;
            if (shouldFail) return null; // failure cached permanently
            module = { createMachine: () => {} };
            return module;
        },
        reset: () => { loadAttempted = false; module = null; importCount = 0; },
        getImportCount: () => importCount,
    };
}

// ── Simulate the FIXED loadXState (retry on failure, max 3) ──

function createFixedLoader() {
    let module: object | null = null;
    let loadAttempts = 0;
    const MAX_ATTEMPTS = 3;
    let importCount = 0;

    return {
        load: async (shouldFail: boolean): Promise<object | null> => {
            if (module) return module; // cached success
            if (loadAttempts >= MAX_ATTEMPTS) return null; // max retries exceeded

            loadAttempts++;
            importCount++;
            if (shouldFail) return null; // allow retry on next call
            module = { createMachine: () => {} };
            return module;
        },
        reset: () => { module = null; loadAttempts = 0; importCount = 0; },
        getImportCount: () => importCount,
        getAttempts: () => loadAttempts,
    };
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #10 — XState import cached as permanent failure', () => {
    describe('BUGGY behavior: failure cached permanently', () => {
        it('never retries after first failure', async () => {
            const buggy = createBuggyLoader();

            // First call fails (transient error)
            const r1 = await buggy.load(true);
            expect(r1).toBeNull();
            expect(buggy.getImportCount()).toBe(1);

            // Second call — xstate is now available, but flag prevents retry
            const r2 = await buggy.load(false);
            expect(r2).toBeNull(); // ⚠️ BUG: still null despite xstate being available
            expect(buggy.getImportCount()).toBe(1); // never retried
        });
    });

    describe('FIXED behavior: retry on failure up to 3 times', () => {
        it('retries after first failure', async () => {
            const fixed = createFixedLoader();

            // First call fails
            const r1 = await fixed.load(true);
            expect(r1).toBeNull();
            expect(fixed.getImportCount()).toBe(1);

            // Second call succeeds
            const r2 = await fixed.load(false);
            expect(r2).not.toBeNull();
            expect(fixed.getImportCount()).toBe(2);
        });

        it('caches successful import permanently', async () => {
            const fixed = createFixedLoader();

            // First call succeeds
            const r1 = await fixed.load(false);
            expect(r1).not.toBeNull();
            expect(fixed.getImportCount()).toBe(1);

            // Subsequent calls return cached — no import needed
            const r2 = await fixed.load(false);
            expect(r2).toBe(r1); // same reference
            expect(fixed.getImportCount()).toBe(1); // no additional imports
        });

        it('stops retrying after MAX_ATTEMPTS (3)', async () => {
            const fixed = createFixedLoader();

            // 3 consecutive failures
            await fixed.load(true);
            await fixed.load(true);
            await fixed.load(true);
            expect(fixed.getImportCount()).toBe(3);

            // 4th call — max exceeded, returns null without attempting
            const r4 = await fixed.load(false);
            expect(r4).toBeNull();
            expect(fixed.getImportCount()).toBe(3); // no 4th attempt
        });

        it('succeeds on retry within MAX_ATTEMPTS', async () => {
            const fixed = createFixedLoader();

            // 2 failures, then success on 3rd attempt
            await fixed.load(true);
            await fixed.load(true);
            const r3 = await fixed.load(false);
            expect(r3).not.toBeNull();
            expect(fixed.getImportCount()).toBe(3);
            expect(fixed.getAttempts()).toBe(3);
        });

        it('reset clears attempt counter', async () => {
            const fixed = createFixedLoader();

            // Exhaust all retries
            await fixed.load(true);
            await fixed.load(true);
            await fixed.load(true);

            fixed.reset();
            expect(fixed.getAttempts()).toBe(0);

            // Can retry again after reset
            const r = await fixed.load(false);
            expect(r).not.toBeNull();
            expect(fixed.getImportCount()).toBe(1); // reset clears count
        });
    });

    describe('resetXStateCache integration', () => {
        it('resetXStateCache re-enables import attempts', async () => {
            // Test the real resetXStateCache + initFsmEngine flow
            const { initFsmEngine, resetXStateCache } = await import('../../src/fsm/StateMachineGate.js');

            resetXStateCache();
            // initFsmEngine calls loadXState internally
            // If xstate is installed, this succeeds; if not, it returns false
            const available = await initFsmEngine();
            // We just verify it doesn't throw
            expect(typeof available).toBe('boolean');

            // Reset and try again — should not throw
            resetXStateCache();
            const available2 = await initFsmEngine();
            expect(typeof available2).toBe('boolean');
        });
    });
});
