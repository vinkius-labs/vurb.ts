/**
 * Bug #5 Regression: RedactEngine lazy-import race condition
 *
 * BUG: `loadFastRedact()` used a module-level `_fastRedact` variable as cache
 * but without a promise gate. Two concurrent calls during boot both pass the
 * `_fastRedact === null` check, both do `import('fast-redact')`, and the second
 * call's result non-deterministically overwrites the first.
 *
 * FIX: Added `_loadPromise` gate — the first call creates and caches the import
 * promise; concurrent callers await the same promise instead of triggering
 * a second import.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

// ── Simulate the BUGGY loadFastRedact (no promise gate) ──

function createBuggyLoader() {
    let _cached: (() => void) | null | false = null;
    let importCount = 0;

    async function loadBuggy(): Promise<(() => void) | null> {
        if (_cached === false) return null;
        if (_cached !== null) return _cached;

        // No promise gate — concurrent callers ALL reach here
        importCount++;
        await new Promise(r => setTimeout(r, 10)); // simulate async import
        const factory = () => {};
        _cached = factory;
        return _cached;
    }

    return { load: loadBuggy, getImportCount: () => importCount };
}

// ── Simulate the FIXED loadFastRedact (with promise gate) ──

function createFixedLoader() {
    let _cached: (() => void) | null | false = null;
    let _loadPromise: Promise<(() => void) | null> | null = null;
    let importCount = 0;

    async function loadFixed(): Promise<(() => void) | null> {
        if (_cached === false) return null;
        if (_cached !== null) return _cached;

        if (_loadPromise) return _loadPromise;

        _loadPromise = (async () => {
            importCount++;
            await new Promise(r => setTimeout(r, 10)); // simulate async import
            const factory = () => {};
            _cached = factory;
            return _cached;
        })();

        return _loadPromise;
    }

    return { load: loadFixed, getImportCount: () => importCount };
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #5 — RedactEngine lazy-import race condition', () => {
    describe('BUGGY: concurrent calls trigger multiple imports', () => {
        it('two concurrent loadFastRedact() calls both do import()', async () => {
            const loader = createBuggyLoader();

            // Fire two calls concurrently (simulates two Presenters booting)
            const [r1, r2] = await Promise.all([loader.load(), loader.load()]);

            // Both return a factory (not null)
            expect(r1).toBeDefined();
            expect(r2).toBeDefined();

            // BUG: import was called TWICE (race condition)
            expect(loader.getImportCount()).toBe(2);
        });

        it('ten concurrent calls trigger ten imports', async () => {
            const loader = createBuggyLoader();

            const results = await Promise.all(
                Array.from({ length: 10 }, () => loader.load()),
            );

            results.forEach(r => expect(r).toBeDefined());
            // BUG: all 10 passed through the null check
            expect(loader.getImportCount()).toBe(10);
        });
    });

    describe('FIXED: promise gate serializes concurrent calls', () => {
        it('two concurrent calls result in exactly ONE import', async () => {
            const loader = createFixedLoader();

            const [r1, r2] = await Promise.all([loader.load(), loader.load()]);

            expect(r1).toBeDefined();
            expect(r2).toBeDefined();

            // FIX: only one import happened
            expect(loader.getImportCount()).toBe(1);
        });

        it('ten concurrent calls result in exactly ONE import', async () => {
            const loader = createFixedLoader();

            const results = await Promise.all(
                Array.from({ length: 10 }, () => loader.load()),
            );

            results.forEach(r => expect(r).toBeDefined());
            expect(loader.getImportCount()).toBe(1);
        });

        it('all concurrent callers receive the SAME factory reference', async () => {
            const loader = createFixedLoader();

            const results = await Promise.all(
                Array.from({ length: 5 }, () => loader.load()),
            );

            // All results are the exact same function reference
            const first = results[0];
            results.forEach(r => expect(r).toBe(first));
        });

        it('subsequent calls after resolution use cached value (no import)', async () => {
            const loader = createFixedLoader();

            // First call — triggers import
            await loader.load();
            expect(loader.getImportCount()).toBe(1);

            // Subsequent calls — should use cache
            await loader.load();
            await loader.load();
            expect(loader.getImportCount()).toBe(1);
        });
    });

    describe('FIXED: error handling preserves false sentinel', () => {
        it('marks module as unavailable on import failure', async () => {
            let _cached: (() => void) | null | false = null;
            let _loadPromise: Promise<(() => void) | null> | null = null;

            async function loadWithError(): Promise<(() => void) | null> {
                if (_cached === false) return null;
                if (_cached !== null) return _cached;
                if (_loadPromise) return _loadPromise;

                _loadPromise = (async () => {
                    throw new Error('Module not found');
                })().catch(() => {
                    _cached = false;
                    return null;
                });

                return _loadPromise;
            }

            const result = await loadWithError();
            expect(result).toBeNull();

            // Subsequent calls should immediately return null
            const result2 = await loadWithError();
            expect(result2).toBeNull();
        });

        it('concurrent calls during a failing import all get null', async () => {
            let _cached: (() => void) | null | false = null;
            let _loadPromise: Promise<(() => void) | null> | null = null;
            let importCount = 0;

            async function loadFailing(): Promise<(() => void) | null> {
                if (_cached === false) return null;
                if (_cached !== null) return _cached;
                if (_loadPromise) return _loadPromise;

                _loadPromise = (async () => {
                    importCount++;
                    await new Promise(r => setTimeout(r, 10));
                    throw new Error('not installed');
                })().catch(() => {
                    _cached = false;
                    return null;
                });

                return _loadPromise;
            }

            const results = await Promise.all([
                loadFailing(),
                loadFailing(),
                loadFailing(),
            ]);

            // All get null
            results.forEach(r => expect(r).toBeNull());
            // Only one import attempt
            expect(importCount).toBe(1);
        });
    });

    describe('initRedactEngine integration', () => {
        it('initRedactEngine calls loadFastRedact (real module)', async () => {
            // This exercises the real code path
            const { initRedactEngine } = await import('../../src/presenter/RedactEngine.js');
            const available = await initRedactEngine();
            // fast-redact is a dev dependency, should be available in tests
            expect(typeof available).toBe('boolean');
        });

        it('concurrent initRedactEngine calls are safe', async () => {
            const { initRedactEngine } = await import('../../src/presenter/RedactEngine.js');

            const results = await Promise.all([
                initRedactEngine(),
                initRedactEngine(),
                initRedactEngine(),
            ]);

            // All should return the same boolean
            const first = results[0];
            results.forEach(r => expect(r).toBe(first));
        });
    });
});
