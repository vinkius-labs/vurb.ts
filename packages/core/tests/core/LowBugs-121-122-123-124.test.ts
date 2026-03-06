/**
 * Regression tests for BUGS-v4 low-severity bugs #121, #122, #123, #124.
 *
 * Bug #121 — Empty param names accepted (FluentToolBuilder)
 * Bug #122 — Empty tool names accepted (FluentToolBuilder)
 * Bug #123 — Multiple .handle() calls allowed (FluentToolBuilder)
 * Bug #124 — .annotations() replaces instead of merging (FluentToolBuilder)
 */
import { describe, it, expect } from 'vitest';
import { FluentToolBuilder } from '../../src/core/builder/FluentToolBuilder.js';
import { success } from '../../src/core/response.js';

// ── Bug #121 — Empty param names rejected ────────────────

describe('Bug #121 — Empty param names rejected', () => {
    it('should throw when param name is empty string', () => {
        const builder = new FluentToolBuilder('test.tool');
        expect(() =>
            builder.withString('', 'A description'),
        ).toThrow(/empty parameter name/i);
    });

    it('should throw when param name is whitespace-only', () => {
        const builder = new FluentToolBuilder('test.tool');
        expect(() =>
            builder.withNumber('   ', 'A number'),
        ).toThrow(/empty parameter name/i);
    });

    it('should accept valid param names', () => {
        const builder = new FluentToolBuilder('test.tool');
        expect(() =>
            builder.withString('name', 'User name'),
        ).not.toThrow();
    });
});

// ── Bug #122 — Empty tool names rejected ─────────────────

describe('Bug #122 — Empty tool names rejected', () => {
    it('should throw when tool name is empty string', () => {
        expect(() =>
            new FluentToolBuilder(''),
        ).toThrow(/non-empty string/i);
    });

    it('should throw when tool name is whitespace-only', () => {
        expect(() =>
            new FluentToolBuilder('   '),
        ).toThrow(/non-empty string/i);
    });

    it('should accept valid tool names', () => {
        expect(() =>
            new FluentToolBuilder('users.list'),
        ).not.toThrow();
    });
});

// ── Bug #123 — Multiple handle() calls rejected ─────────

describe('Bug #123 — Multiple handle() calls rejected', () => {
    it('should throw on second handle() call', () => {
        const builder = new FluentToolBuilder('test.tool');
        builder.withString('id', 'ID');

        // First handle — should succeed
        builder.handle(async () => success('ok'));

        // Second handle — should throw
        expect(() =>
            builder.handle(async () => success('other')),
        ).toThrow(/handle\(\) already called/i);
    });

    it('should throw on resolve() after handle()', () => {
        const builder = new FluentToolBuilder('test.tool');
        builder.handle(async () => success('ok'));

        expect(() =>
            builder.resolve(async () => success('other')),
        ).toThrow(/handle\(\) already called/i);
    });

    it('should allow single handle() call', () => {
        const builder = new FluentToolBuilder('test.tool');
        expect(() =>
            builder.handle(async () => success('ok')),
        ).not.toThrow();
    });
});

// ── Bug #124 — annotations() merges instead of replacing ─

describe('Bug #124 — annotations() merges instead of replacing', () => {
    it('should merge multiple annotations() calls', () => {
        const builder = new FluentToolBuilder('test.tool');
        builder
            .annotations({ title: 'A' })
            .annotations({ readOnlyHint: true });

        expect(builder._annotations).toEqual({
            title: 'A',
            readOnlyHint: true,
        });
    });

    it('should allow later calls to override specific keys', () => {
        const builder = new FluentToolBuilder('test.tool');
        builder
            .annotations({ title: 'Original', version: 1 })
            .annotations({ title: 'Updated' });

        expect(builder._annotations).toEqual({
            title: 'Updated',
            version: 1,
        });
    });

    it('should work with single annotations() call', () => {
        const builder = new FluentToolBuilder('test.tool');
        builder.annotations({ foo: 'bar' });

        expect(builder._annotations).toEqual({ foo: 'bar' });
    });
});
