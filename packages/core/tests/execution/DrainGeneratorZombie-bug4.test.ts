/**
 * Bug #4 Regression: drainGenerator zombie handlers on slow I/O
 *
 * BUG: The loop that drains async generators checked AbortSignal only between
 * iterations. If the generator's yield does slow I/O (e.g. 30s DB query),
 * the signal could fire during `await gen.next()` but the handler keeps
 * running until the next yield — creating "zombie" handlers.
 *
 * FIX: Use `Promise.race([gen.next(), abortPromise])` so cancellation is
 * honored in real-time during each yield, not just between iterations.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

// ── Types ────────────────────────────────────────────────

interface ToolResponse {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
}

function errorResponse(msg: string): ToolResponse {
    return { content: [{ type: 'text', text: msg }], isError: true };
}

// ── Simulate the OLD (buggy) drainGenerator ──────────────

async function drainGeneratorBuggy(
    gen: AsyncGenerator<unknown, ToolResponse, undefined>,
    signal?: AbortSignal,
): Promise<ToolResponse> {
    let result = await gen.next();
    while (!result.done) {
        if (signal?.aborted) {
            await gen.return(errorResponse('Request cancelled.'));
            return errorResponse('Request cancelled.');
        }
        result = await gen.next(); // ⚠️ blocks here without checking signal
    }
    return result.value;
}

// ── Simulate the NEW (fixed) drainGenerator ──────────────

async function drainGeneratorFixed(
    gen: AsyncGenerator<unknown, ToolResponse, undefined>,
    signal?: AbortSignal,
): Promise<ToolResponse> {
    const abortPromise = signal && !signal.aborted
        ? new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
                reject(new DOMException('Request cancelled.', 'AbortError'));
            }, { once: true });
        })
        : undefined;
    abortPromise?.catch(() => {});

    let result = await gen.next();
    while (!result.done) {
        if (signal?.aborted) {
            await gen.return(errorResponse('Request cancelled.'));
            return errorResponse('Request cancelled.');
        }

        if (abortPromise) {
            try {
                result = await Promise.race([gen.next(), abortPromise]);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    // Fire-and-forget: gen.return() may also block on stuck I/O
                    gen.return(errorResponse('Request cancelled.')).catch(() => {});
                    return errorResponse('Request cancelled.');
                }
                throw err;
            }
        } else {
            result = await gen.next();
        }
    }
    return result.value;
}

// ── Test Helpers ─────────────────────────────────────────

/**
 * Creates a generator that simulates slow I/O on the 2nd yield.
 * The slow step resolves only when `unblock()` is called (or never).
 */
function createSlowGenerator(opts: {
    onCleanup?: () => void;
    onSlowStart?: () => void;
}) {
    let unblock: () => void;
    const blockPromise = new Promise<void>(resolve => { unblock = resolve; });

    async function* slowGen(): AsyncGenerator<unknown, ToolResponse, undefined> {
        try {
            yield 'step-1'; // fast
            opts.onSlowStart?.();
            await blockPromise; // simulate slow I/O
            yield 'step-2'; // only reached if unblocked
            return { content: [{ type: 'text', text: 'done' }] };
        } finally {
            opts.onCleanup?.();
        }
    }

    return { gen: slowGen(), unblock: unblock! };
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #4 — drainGenerator zombie handler cancellation', () => {
    describe('generators without signals work normally', () => {
        it('drains a simple generator to completion', async () => {
            async function* simple(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 'a';
                yield 'b';
                return { content: [{ type: 'text', text: 'done' }] };
            }
            const result = await drainGeneratorFixed(simple());
            expect(result.content[0].text).toBe('done');
        });

        it('drains an empty generator (no yields)', async () => {
            async function* empty(): AsyncGenerator<unknown, ToolResponse, undefined> {
                return { content: [{ type: 'text', text: 'empty' }] };
            }
            const result = await drainGeneratorFixed(empty());
            expect(result.content[0].text).toBe('empty');
        });
    });

    describe('BUGGY: old implementation blocks on slow I/O', () => {
        it('does NOT cancel during await gen.next() — zombie handler', async () => {
            const cleanup = vi.fn();
            const slowStart = vi.fn();
            const ac = new AbortController();
            const { gen } = createSlowGenerator({ onCleanup: cleanup, onSlowStart: slowStart });

            // Start draining — will get stuck on the slow yield
            const drainPromise = drainGeneratorBuggy(gen, ac.signal);

            // Wait for the slow step to start
            await vi.waitFor(() => expect(slowStart).toHaveBeenCalled());

            // Abort! The buggy version won't detect this until the slow I/O finishes
            ac.abort();

            // Give it some time — the drain should NOT resolve because
            // the generator is stuck on the slow I/O
            const raceResult = await Promise.race([
                drainPromise.then(() => 'resolved'),
                new Promise<string>(r => setTimeout(() => r('timeout'), 100)),
            ]);

            // The buggy drain is STILL stuck — it didn't cancel
            expect(raceResult).toBe('timeout');
            expect(cleanup).not.toHaveBeenCalled(); // zombie!
        });
    });

    describe('FIXED: new implementation cancels during slow I/O', () => {
        it('cancels immediately when signal fires during gen.next()', async () => {
            const slowStart = vi.fn();
            const ac = new AbortController();
            let unblock: () => void;
            const blockPromise = new Promise<void>(resolve => { unblock = resolve; });

            async function* slowGen(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 'step-1';
                slowStart();
                await blockPromise;
                yield 'step-2';
                return { content: [{ type: 'text', text: 'done' }] };
            }

            const drainPromise = drainGeneratorFixed(slowGen(), ac.signal);

            // Wait for slow step to start
            await vi.waitFor(() => expect(slowStart).toHaveBeenCalled());

            // Abort during slow I/O
            ac.abort();

            // The fixed version should resolve quickly via Promise.race
            const result = await drainPromise;

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Request cancelled.');

            // Unblock to avoid dangling promise
            unblock!();
        });

        it('handles pre-aborted signal at loop entry', async () => {
            const cleanup = vi.fn();
            const ac = new AbortController();
            ac.abort(); // pre-abort

            async function* gen(): AsyncGenerator<unknown, ToolResponse, undefined> {
                try {
                    yield 'should-not-reach';
                    return { content: [{ type: 'text', text: 'done' }] };
                } finally {
                    cleanup();
                }
            }

            const result = await drainGeneratorFixed(gen(), ac.signal);
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe('Request cancelled.');
        });

        it('completes normally when signal never fires', async () => {
            const ac = new AbortController();
            async function* gen(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 'a';
                yield 'b';
                yield 'c';
                return { content: [{ type: 'text', text: 'completed' }] };
            }

            const result = await drainGeneratorFixed(gen(), ac.signal);
            expect(result.isError).toBeUndefined();
            expect(result.content[0].text).toBe('completed');
        });

        it('cancels on first yield if abort fires immediately after', async () => {
            const ac = new AbortController();
            let yieldCount = 0;
            let unblock: () => void;
            const blockPromise = new Promise<void>(resolve => { unblock = resolve; });

            async function* gen(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 'first';
                yieldCount++;
                await blockPromise; // slow I/O that gets aborted
                yieldCount++;
                yield 'second';
                return { content: [{ type: 'text', text: 'done' }] };
            }

            const drainPromise = drainGeneratorFixed(gen(), ac.signal);

            // Small delay then abort
            await new Promise(r => setTimeout(r, 20));
            ac.abort();

            const result = await drainPromise;
            expect(result.isError).toBe(true);
            // Generator was cancelled, not all yields completed
            expect(yieldCount).toBeLessThanOrEqual(1);

            // Unblock to avoid dangling promise
            unblock!();
        });

        it('propagates non-abort errors from generator', async () => {
            async function* failing(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 'ok';
                throw new Error('DB connection lost');
            }

            await expect(drainGeneratorFixed(failing())).rejects.toThrow('DB connection lost');
        });

        it('works without signal (no abort promise created)', async () => {
            async function* gen(): AsyncGenerator<unknown, ToolResponse, undefined> {
                yield 1;
                yield 2;
                return { content: [{ type: 'text', text: 'no-signal' }] };
            }

            const result = await drainGeneratorFixed(gen(), undefined);
            expect(result.content[0].text).toBe('no-signal');
        });
    });
});
