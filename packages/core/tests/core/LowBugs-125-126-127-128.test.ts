/**
 * Regression tests for BUGS-v4 low-severity bugs #125, #126, #127, #128.
 *
 * Bug #125 — ActionGroupBuilder non-null assertion on optional handler
 * Bug #126 — FluentRouter description conditional always true
 * Bug #127 — ToolResponse detection false-positive risk
 * Bug #128 — DevServer recursive watch Linux compatibility
 */
import { describe, it, expect } from 'vitest';
import { GroupedToolBuilder } from '../../src/core/builder/GroupedToolBuilder.js';
import { ActionGroupBuilder } from '../../src/core/builder/ActionGroupBuilder.js';
import { FluentRouter } from '../../src/core/builder/FluentRouter.js';
import { FluentToolBuilder } from '../../src/core/builder/FluentToolBuilder.js';
import { success, error, required, toonSuccess, toolError, TOOL_RESPONSE_BRAND } from '../../src/core/response.js';

// ── Bug #125 — ActionGroupBuilder handler guard ──────────

describe('Bug #125 — ActionGroupBuilder handler guard', () => {
    it('should throw when 2-arg shorthand is called without a handler', () => {
        const builder = new ActionGroupBuilder('test-group', 'Test');
        expect(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (builder as any).action('invite'),
        ).toThrow(/requires a handler function/i);
    });

    it('should throw when handler is undefined explicitly', () => {
        const builder = new ActionGroupBuilder('test-group', 'Test');
        expect(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (builder as any).action('invite', undefined),
        ).toThrow(/requires a handler function/i);
    });

    it('should accept valid 2-arg shorthand', () => {
        const builder = new ActionGroupBuilder('test-group', 'Test');
        expect(() =>
            builder.action('invite', async () => success('ok')),
        ).not.toThrow();
    });

    it('should accept config object without hitting the guard', () => {
        const builder = new ActionGroupBuilder('test-group', 'Test');
        expect(() =>
            builder.action({
                name: 'invite',
                handler: async () => success('ok'),
            }),
        ).not.toThrow();
    });
});

// ── Bug #126 — FluentRouter description fallback ─────────

describe('Bug #126 — FluentRouter description', () => {
    it('should inherit router description on child builder', () => {
        const router = new FluentRouter('users');
        router.describe('User management');

        const child = router.query('list');
        expect(child._description).toBe('User management');
    });

    it('should set description on freshly created builder (dead branch removed)', () => {
        // Before fix: `!builder._description` was always true since builder is new.
        // The fix removes the redundant check. Behavior unchanged, code cleaned.
        const router = new FluentRouter('users');
        router.describe('Users API');

        const child = router.mutation('delete');
        expect(child._description).toBe('Users API');
    });

    it('should not set description when router has none', () => {
        const router = new FluentRouter('users');
        const child = router.query('list');
        expect(child._description).toBeUndefined();
    });
});

// ── Bug #127 — ToolResponse brand detection ──────────────

describe('Bug #127 — ToolResponse brand prevents false positives', () => {
    it('should stamp brand on success() responses', () => {
        const resp = success('hello');
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);
    });

    it('should stamp brand on error() responses', () => {
        const resp = error('fail');
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);
    });

    it('should stamp brand on required() responses', () => {
        const resp = required('field');
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);
    });

    it('should stamp brand on toonSuccess() responses', () => {
        const resp = toonSuccess([{ a: 1 }]);
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);
    });

    it('should stamp brand on toolError() responses', () => {
        const resp = toolError('RateLimited', { message: 'Too fast' });
        expect(TOOL_RESPONSE_BRAND in resp).toBe(true);
    });

    it('brand should be non-enumerable', () => {
        const resp = success('test');
        expect(Object.keys(resp)).not.toContain(TOOL_RESPONSE_BRAND.toString());
        // JSON.stringify should not include the brand
        const json = JSON.stringify(resp);
        expect(json).not.toContain('mcp-fusion');
    });

    it('should NOT wrap branded response with success() in handler', async () => {
        const builder = new FluentToolBuilder('test.tool');
        const grouped = builder.handle(async () => success({ data: 'hello' }));
        // The handler result should pass through as-is, not double-wrapped
        const actions = grouped._actions;
        expect(actions).toHaveLength(1);
        const result = await actions[0].handler({} as never, {});
        expect(result.content[0].text).toContain('hello');
        expect(result.isError).toBeUndefined();
    });

    it('should wrap domain data that looks like ToolResponse but lacks brand', async () => {
        const builder = new FluentToolBuilder('test.tool');
        // Domain data that coincidentally matches ToolResponse shape but has extra keys
        const domainData = {
            content: [{ type: 'text', text: 'domain value' }],
            metadata: 'extra',
        };
        const grouped = builder.handle(async () => domainData);
        const actions = grouped._actions;
        const result = await actions[0].handler({} as never, {});
        // Should be wrapped with success() since domain data has extra 'metadata' key
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveProperty('content');
        expect(parsed).toHaveProperty('metadata');
    });
});

// ── Bug #128 — DevServer Linux warning ──────────────────

describe('Bug #128 — DevServer recursive watch Linux compat', () => {
    it('should have recursive watch option in DevServer source', async () => {
        // Structural test: verify the warning code exists in the source
        const { readFile } = await import('node:fs/promises');
        const source = await readFile(
            new URL('../../src/server/DevServer.ts', import.meta.url),
            'utf-8',
        );
        expect(source).toContain('process.platform');
        expect(source).toContain('recursive fs.watch()');
        expect(source).toContain('Node.js < 20');
    });
});
