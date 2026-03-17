/**
 * Bug #7 Regression: Exposition recompile O(N) on every tools/call
 *
 * BUG: In flat mode, `hCtx.recompile()` was called on every `tools/call` request.
 * The internal cache validation compared builder references element-by-element with
 * `builders.every((b, i) => b === cachedBuilders![i])` — an O(N) loop for N builders.
 * With 200+ tools in production, this is unnecessary per-request overhead.
 *
 * FIX: Replace the O(N) identity comparison with a boolean dirty flag.
 * The exposition is compiled once and cached. Returns O(1) on subsequent calls.
 * The cache is only invalidated explicitly (e.g., on builder mutations).
 *
 * @module
 */
import { describe, it, expect } from 'vitest';

// ── Simulate the BUGGY recompile (O(N) comparison every call) ──

function createBuggyRecompile(getBuilders: () => unknown[]) {
    let cachedBuilders: unknown[] | undefined;
    let cachedResult: string | undefined;
    let compileCount = 0;
    let comparisonCount = 0;

    return {
        recompile: () => {
            const builders = [...getBuilders()];
            if (cachedResult && cachedBuilders
                && builders.length === cachedBuilders.length
                && builders.every((b, i) => {
                    comparisonCount++;
                    return b === cachedBuilders![i];
                })) {
                return cachedResult;
            }
            cachedBuilders = builders;
            compileCount++;
            cachedResult = `compiled-${compileCount}`;
            return cachedResult;
        },
        getCompileCount: () => compileCount,
        getComparisonCount: () => comparisonCount,
    };
}

// ── Simulate the FIXED recompile (O(1) dirty flag + count check) ──

function createFixedRecompile(getBuilders: () => unknown[]) {
    let cachedResult: string | undefined;
    let cachedCount = -1;
    let dirty = true;
    let compileCount = 0;
    let spreadCount = 0;

    const fn = () => {
        if (!dirty && cachedResult) {
            // O(1) count check instead of O(N) identity comparison
            const count = getBuilders().length;
            if (count === cachedCount) return cachedResult;
        }
        dirty = false;
        spreadCount++;
        const builders = [...getBuilders()];
        cachedCount = builders.length;
        compileCount++;
        cachedResult = `compiled-${compileCount}`;
        return cachedResult;
    };
    fn.invalidate = () => { dirty = true; };

    return {
        recompile: fn,
        getCompileCount: () => compileCount,
        getSpreadCount: () => spreadCount,
    };
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #7 — Exposition recompile O(N) per request', () => {
    const BUILDER_COUNT = 200;
    const builders = Array.from({ length: BUILDER_COUNT }, (_, i) => ({ id: i }));

    describe('BUGGY behavior: O(N) comparison on every call', () => {
        it('does O(N) element-wise comparison on every recompile call', () => {
            const buggy = createBuggyRecompile(() => builders);

            buggy.recompile(); // first call — compiles
            expect(buggy.getCompileCount()).toBe(1);

            buggy.recompile(); // second call — compares all 200 elements
            expect(buggy.getComparisonCount()).toBe(BUILDER_COUNT);

            buggy.recompile(); // third call — compares again
            expect(buggy.getComparisonCount()).toBe(BUILDER_COUNT * 2);
        });

        it('comparison count scales linearly with builder count', () => {
            const buggy = createBuggyRecompile(() => builders);
            buggy.recompile(); // compile

            const REQUEST_COUNT = 100;
            for (let i = 0; i < REQUEST_COUNT; i++) {
                buggy.recompile();
            }

            // O(N) per request × 100 requests = 20,000 comparisons
            expect(buggy.getComparisonCount()).toBe(BUILDER_COUNT * REQUEST_COUNT);
        });
    });

    describe('FIXED behavior: O(1) dirty flag', () => {
        it('compiles once, then returns cached result with zero work', () => {
            const fixed = createFixedRecompile(() => builders);

            const r1 = fixed.recompile(); // first call — compiles
            expect(fixed.getCompileCount()).toBe(1);

            const r2 = fixed.recompile(); // second call — O(1) return
            expect(fixed.getCompileCount()).toBe(1); // no recompile
            expect(r2).toBe(r1); // same cached result
        });

        it('does not spread builders on cached calls', () => {
            const fixed = createFixedRecompile(() => builders);

            fixed.recompile(); // compile
            expect(fixed.getSpreadCount()).toBe(1);

            for (let i = 0; i < 100; i++) {
                fixed.recompile();
            }

            // No additional spreads — O(1) on every call
            expect(fixed.getSpreadCount()).toBe(1);
        });

        it('recompiles after invalidate()', () => {
            const fixed = createFixedRecompile(() => builders);

            const r1 = fixed.recompile();
            expect(fixed.getCompileCount()).toBe(1);

            fixed.recompile.invalidate();
            const r2 = fixed.recompile();
            expect(fixed.getCompileCount()).toBe(2);
            expect(r2).not.toBe(r1);
        });

        it('returns O(1) again after re-invalidate cycle', () => {
            const fixed = createFixedRecompile(() => builders);

            fixed.recompile();
            fixed.recompile.invalidate();
            fixed.recompile(); // recompile after invalidate

            // Now 100 more calls — all O(1)
            for (let i = 0; i < 100; i++) {
                fixed.recompile();
            }

            expect(fixed.getCompileCount()).toBe(2); // only 2 compiles total
            expect(fixed.getSpreadCount()).toBe(2);
        });

        it('detects builder additions via invalidate()', () => {
            let currentBuilders = [...builders];
            const fixed = createFixedRecompile(() => currentBuilders);

            const r1 = fixed.recompile();

            // Add a new builder
            currentBuilders = [...currentBuilders, { id: 999 }];
            fixed.recompile.invalidate();

            const r2 = fixed.recompile();
            expect(r2).not.toBe(r1);
            expect(fixed.getCompileCount()).toBe(2);
        });

        it('detects late-registered builders via count change (no invalidate needed)', () => {
            let currentBuilders = [...builders];
            const fixed = createFixedRecompile(() => currentBuilders);

            const r1 = fixed.recompile();
            expect(fixed.getCompileCount()).toBe(1);

            // Late addition — no invalidate() call
            currentBuilders = [...currentBuilders, { id: 999 }];

            const r2 = fixed.recompile();
            expect(r2).not.toBe(r1); // count mismatch triggers recompile
            expect(fixed.getCompileCount()).toBe(2);
        });
    });
});
