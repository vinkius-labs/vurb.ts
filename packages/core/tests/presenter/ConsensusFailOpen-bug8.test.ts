/**
 * Bug #8 Regression: Consensus strategy passes with adapter errors when failOpen: true
 *
 * BUG: In consensus strategy, if 2 of 3 adapters returned ERROR and 1 returned
 * passed: true, the flow reached the `if (anyError)` branch and returned
 * `config.failOpen`. With `failOpen: true`, potentially dangerous content passed
 * the evaluation even though only 1/3 of judges succeeded — violating the
 * "ALL must agree" consensus contract.
 *
 * FIX: In consensus mode, adapter errors are treated as implicit rejections.
 * The consensus contract ("all must succeed AND agree") means errors = fail,
 * regardless of `failOpen`. failOpen only applies to fallback strategy.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { createJudgeChain } from '../../src/presenter/JudgeChain.js';
import type { SemanticProbeAdapter } from '../../src/introspection/SemanticProbe.js';

// ── Adapter factories ────────────────────────────────────

function passingAdapter(name: string): SemanticProbeAdapter {
    return {
        name,
        evaluate: async () => '{"safe": true}',
    };
}

function failingAdapter(name: string): SemanticProbeAdapter {
    return {
        name,
        evaluate: async () => { throw new Error('adapter timeout'); },
    };
}

function rejectingAdapter(name: string): SemanticProbeAdapter {
    return {
        name,
        evaluate: async () => '{"safe": false, "reason": "harmful content"}',
    };
}

function errorResponseAdapter(name: string): SemanticProbeAdapter {
    return {
        name,
        evaluate: async () => 'ERROR: connection refused',
    };
}

// ── Tests ────────────────────────────────────────────────

describe('Bug #8 — Consensus strategy ignores failOpen on adapter errors', () => {
    describe('consensus with failOpen: true (the vulnerable config)', () => {
        it('rejects when 2/3 adapters error and 1 passes', async () => {
            const chain = createJudgeChain({
                adapters: [failingAdapter('a'), failingAdapter('b'), passingAdapter('c')],
                strategy: 'consensus',
                failOpen: true,
            });

            const result = await chain.evaluate('test content');

            // Bug #8 fix: consensus errors = rejection, ignoring failOpen
            expect(result.passed).toBe(false);
            expect(result.fallbackTriggered).toBe(true);
        });

        it('rejects when all 3 adapters error', async () => {
            const chain = createJudgeChain({
                adapters: [failingAdapter('a'), failingAdapter('b'), failingAdapter('c')],
                strategy: 'consensus',
                failOpen: true,
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(false);
            expect(result.fallbackTriggered).toBe(true);
        });

        it('rejects when 1 adapter returns ERROR response string', async () => {
            const chain = createJudgeChain({
                adapters: [passingAdapter('a'), errorResponseAdapter('b'), passingAdapter('c')],
                strategy: 'consensus',
                failOpen: true,
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(false);
        });
    });

    describe('consensus correct behavior (not affected by fix)', () => {
        it('passes when all adapters agree safe', async () => {
            const chain = createJudgeChain({
                adapters: [passingAdapter('a'), passingAdapter('b'), passingAdapter('c')],
                strategy: 'consensus',
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(true);
            expect(result.fallbackTriggered).toBe(false);
        });

        it('rejects when any adapter explicitly rejects', async () => {
            const chain = createJudgeChain({
                adapters: [passingAdapter('a'), rejectingAdapter('b'), passingAdapter('c')],
                strategy: 'consensus',
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(false);
            expect(result.fallbackTriggered).toBe(false);
        });

        it('rejects when single adapter errors (failOpen false)', async () => {
            const chain = createJudgeChain({
                adapters: [passingAdapter('a'), failingAdapter('b')],
                strategy: 'consensus',
                failOpen: false,
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(false);
        });
    });

    describe('fallback strategy still uses failOpen correctly', () => {
        it('passes when all fallback adapters error and failOpen: true', async () => {
            const chain = createJudgeChain({
                adapters: [failingAdapter('a'), failingAdapter('b')],
                strategy: 'fallback',
                failOpen: true,
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(true);
            expect(result.fallbackTriggered).toBe(true);
        });

        it('rejects when all fallback adapters error and failOpen: false', async () => {
            const chain = createJudgeChain({
                adapters: [failingAdapter('a'), failingAdapter('b')],
                strategy: 'fallback',
                failOpen: false,
            });

            const result = await chain.evaluate('test content');
            expect(result.passed).toBe(false);
            expect(result.fallbackTriggered).toBe(true);
        });
    });

    describe('result metadata', () => {
        it('includes all adapter results in consensus error case', async () => {
            const chain = createJudgeChain({
                adapters: [failingAdapter('adapter-1'), passingAdapter('adapter-2')],
                strategy: 'consensus',
                failOpen: true,
            });

            const result = await chain.evaluate('test content');
            expect(result.results).toHaveLength(2);
            expect(result.results[0].rawResponse).toMatch(/^ERROR:/);
            expect(result.results[1].passed).toBe(true);
            // Despite one passing, consensus with errors = blocked
            expect(result.passed).toBe(false);
        });
    });
});
