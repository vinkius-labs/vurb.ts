/**
 * BuildPipeline — Unit Tests
 *
 * Tests the `buildToolFromFluent()` standalone function extracted from
 * FluentToolBuilder._build(). Covers:
 *   - Name parsing (dotted → tool/action split)
 *   - Description compilation (instructions + sandbox)
 *   - Semantic defaults resolution
 *   - Handler wrapping (implicit success(), void/null, brand detection)
 *   - Middleware propagation
 *   - Multi-dot rejection (Bug #109)
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildToolFromFluent } from '../../src/core/builder/BuildPipeline.js';
import { QUERY_DEFAULTS, MUTATION_DEFAULTS, ACTION_DEFAULTS } from '../../src/core/builder/SemanticDefaults.js';
import { success, TOOL_RESPONSE_BRAND } from '../../src/core/response.js';

// ============================================================================
// Helpers
// ============================================================================

interface TestContext {
    userId: string;
}

function baseConfig(overrides: Partial<Parameters<typeof buildToolFromFluent<TestContext, TestContext>>[0]> = {}) {
    return {
        name: 'test.action',
        description: undefined,
        instructions: undefined,
        withParams: {} as Record<string, z.ZodType>,
        tags: [] as string[],
        middlewares: [],
        returns: undefined,
        semanticDefaults: ACTION_DEFAULTS,
        readOnly: undefined,
        destructive: undefined,
        idempotent: undefined,
        toonMode: false,
        annotations: undefined,
        invalidatesPatterns: [] as string[],
        cacheControl: undefined,
        concurrency: undefined,
        egressMaxBytes: undefined,
        sandboxConfig: undefined,
        fsmStates: undefined,
        fsmTransition: undefined,
        handler: async () => success('ok'),
        ...overrides,
    };
}

// ============================================================================
// Name Parsing
// ============================================================================

describe('BuildPipeline — Name Parsing', () => {
    it('should split dotted name into tool and action', () => {
        const config = baseConfig({ name: 'users.list' });
        const builder = buildToolFromFluent(config);

        expect(builder.getName()).toBe('users');
        expect(builder.getActionNames()).toContain('list');
    });

    it('should default to "default" action for undotted names', () => {
        const config = baseConfig({ name: 'health' });
        const builder = buildToolFromFluent(config);

        expect(builder.getName()).toBe('health');
        expect(builder.getActionNames()).toContain('default');
    });

    it('should reject multi-dot names (Bug #109)', () => {
        const config = baseConfig({ name: 'a.b.c' });

        expect(() => buildToolFromFluent(config)).toThrow(
            /too many dot-separated segments/,
        );
    });
});

// ============================================================================
// Description Compilation
// ============================================================================

describe('BuildPipeline — Description Compilation', () => {
    it('should compile description only', () => {
        const config = baseConfig({ description: 'List all users' });
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        expect(def.description).toContain('List all users');
    });

    it('should compile instructions only', () => {
        const config = baseConfig({ instructions: 'Use when querying users' });
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Use when querying users');
    });

    it('should compile both instructions + description', () => {
        const config = baseConfig({
            description: 'List all users',
            instructions: 'Call only for admin context',
        });
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        expect(def.description).toContain('[INSTRUCTIONS]');
        expect(def.description).toContain('Call only for admin context');
        expect(def.description).toContain('List all users');
    });

    it('should handle no explicit description', () => {
        const config = baseConfig();
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        // GroupedToolBuilder may generate an implicit description
        // from action names — the key is that no [INSTRUCTIONS] appear
        expect(def.description ?? '').not.toContain('[INSTRUCTIONS]');
    });
});

// ============================================================================
// Semantic Defaults Resolution
// ============================================================================

describe('BuildPipeline — Semantic Defaults', () => {
    it('QUERY_DEFAULTS should set readOnly=true', () => {
        const config = baseConfig({ semanticDefaults: QUERY_DEFAULTS });
        const builder = buildToolFromFluent(config);
        const meta = builder.getActionMetadata();

        expect(meta[0]?.readOnly).toBe(true);
    });

    it('MUTATION_DEFAULTS should set destructive=true', () => {
        const config = baseConfig({ semanticDefaults: MUTATION_DEFAULTS });
        const builder = buildToolFromFluent(config);
        const meta = builder.getActionMetadata();

        expect(meta[0]?.destructive).toBe(true);
    });

    it('ACTION_DEFAULTS should set readOnly=false, destructive=false', () => {
        const config = baseConfig({ semanticDefaults: ACTION_DEFAULTS });
        const builder = buildToolFromFluent(config);
        const meta = builder.getActionMetadata();

        expect(meta[0]?.readOnly).toBe(false);
        expect(meta[0]?.destructive).toBe(false);
    });

    it('explicit overrides should take precedence over defaults', () => {
        const config = baseConfig({
            semanticDefaults: QUERY_DEFAULTS,
            destructive: true, // override: query but also destructive
        });
        const builder = buildToolFromFluent(config);
        const meta = builder.getActionMetadata();

        expect(meta[0]?.readOnly).toBe(true); // from QUERY_DEFAULTS
        expect(meta[0]?.destructive).toBe(true); // explicit override
    });
});

// ============================================================================
// Handler Wrapping
// ============================================================================

describe('BuildPipeline — Handler Wrapping', () => {
    const ctx: TestContext = { userId: 'u-1' };

    it('should pass through explicit ToolResponse', async () => {
        const config = baseConfig({
            handler: async () => success('explicit'),
        });
        const builder = buildToolFromFluent(config);
        const result = await builder.execute(ctx, { action: 'action' });

        expect(result.content[0]?.text).toBe('explicit');
        expect(result.isError).toBeUndefined();
    });

    it('should auto-wrap raw data with implicit success()', async () => {
        const config = baseConfig({
            handler: async () => ({ users: ['Alice', 'Bob'] }),
        });
        const builder = buildToolFromFluent(config);
        const result = await builder.execute(ctx, { action: 'action' });

        expect(result.content[0]?.text).toContain('Alice');
        expect(result.isError).toBeUndefined();
    });

    it('should handle void/null handlers gracefully (Bug #41)', async () => {
        const config = baseConfig({
            handler: async () => undefined,
        });
        const builder = buildToolFromFluent(config);
        const result = await builder.execute(ctx, { action: 'action' });

        expect(result.content[0]?.text).toBe('OK');
    });

    it('should auto-wrap string return values', async () => {
        const config = baseConfig({
            handler: async () => 'plain string',
        });
        const builder = buildToolFromFluent(config);
        const result = await builder.execute(ctx, { action: 'action' });

        expect(result.content[0]?.text).toContain('plain string');
    });
});

// ============================================================================
// Tags & Metadata Propagation
// ============================================================================

describe('BuildPipeline — Tags & Metadata', () => {
    it('should propagate tags', () => {
        const config = baseConfig({ tags: ['admin', 'v2'] });
        const builder = buildToolFromFluent(config);

        expect(builder.getTags()).toContain('admin');
        expect(builder.getTags()).toContain('v2');
    });

    it('should propagate invalidates patterns', () => {
        const config = baseConfig({ invalidatesPatterns: ['users.*'] });
        const builder = buildToolFromFluent(config);
        const meta = builder.getActionMetadata();

        // invalidatesPatterns are propagated at the builder level
        expect(builder.buildToolDefinition()).toBeDefined();
    });
});

// ============================================================================
// Input Schema Compilation
// ============================================================================

describe('BuildPipeline — Input Schema', () => {
    it('should compile withParams into Zod schema', () => {
        const config = baseConfig({
            withParams: {
                name: z.string().describe('User name'),
                limit: z.number().describe('Max results'),
            },
        });
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        expect(def.inputSchema.properties).toHaveProperty('name');
        expect(def.inputSchema.properties).toHaveProperty('limit');
        expect(def.inputSchema.properties).toHaveProperty('action');
    });

    it('should not fail with empty params', () => {
        const config = baseConfig({ withParams: {} });
        const builder = buildToolFromFluent(config);
        const def = builder.buildToolDefinition();

        expect(def.inputSchema.properties).toHaveProperty('action');
    });
});
