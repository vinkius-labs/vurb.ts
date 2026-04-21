/**
 * .interactive() — Fluent Builder Integration
 *
 * Tests the .interactive() fluent step on FluentToolBuilder, FluentRouter,
 * and propagation through BuildPipeline → GroupedToolBuilder.
 *
 * Covers:
 * - .interactive() on FluentToolBuilder
 * - .interactive() on FluentRouter with child inheritance
 * - Router inheritance does NOT leak to non-interactive children
 * - .interactive() propagates through BuildPipeline to GroupedToolBuilder
 * - .interactive() does not affect tools that don't use it
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { initVurb } from '../../src/core/initVurb.js';

describe('.interactive() — FluentToolBuilder', () => {
    it('marks the built GroupedToolBuilder as interactive', () => {
        const f = initVurb<void>();

        const tool = f.mutation('deploy.execute')
            .withString('app_id', 'App ID')
            .interactive()
            .handle(async () => ({ ok: true }));

        // GroupedToolBuilder exposes isInteractive() for internal checks
        expect(typeof (tool as unknown as { isInteractive: () => boolean }).isInteractive).toBe('function');
        expect((tool as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);
    });

    it('tools without .interactive() are NOT interactive', () => {
        const f = initVurb<void>();

        const tool = f.query('users.list')
            .withString('query', 'Search')
            .handle(async () => []);

        expect((tool as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(false);
    });

    it('.interactive() can be called before or after .withString()', () => {
        const f = initVurb<void>();

        // interactive() before with*
        const tool1 = f.action('a.b')
            .interactive()
            .withString('x', 'X')
            .handle(async () => ({}));
        expect((tool1 as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);

        // interactive() after with*
        const tool2 = f.action('c.d')
            .withString('y', 'Y')
            .interactive()
            .handle(async () => ({}));
        expect((tool2 as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);
    });

    it('.interactive() does not affect the handler execution without ask()', async () => {
        const f = initVurb<void>();
        const reg = f.registry();

        reg.register(
            f.mutation('simple.run')
                .interactive()
                .handle(async () => ({ status: 'done' })),
        );

        // Tool should execute normally even with .interactive() when no ask() is called
        const result = await reg.routeCall(undefined as never, 'simple', { action: 'run' });
        expect(result.isError).toBeFalsy();
    });
});

describe('.interactive() — FluentRouter inheritance', () => {
    it('all children of an interactive router are interactive', () => {
        const f = initVurb<void>();

        const admin = f.router('admin')
            .describe('Admin tools')
            .interactive();

        const tool1 = admin.mutation('delete_user')
            .withString('id', 'User ID')
            .handle(async () => ({}));

        const tool2 = admin.query('list_users')
            .handle(async () => []);

        expect((tool1 as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);
        expect((tool2 as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);
    });

    it('non-interactive router does NOT make children interactive', () => {
        const f = initVurb<void>();

        const api = f.router('api')
            .describe('API tools');

        const tool = api.query('health')
            .handle(async () => 'ok');

        expect((tool as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(false);
    });

    it('child can opt-in independently from router', () => {
        const f = initVurb<void>();

        const api = f.router('api');

        // Only this specific child is interactive
        const tool = api.mutation('dangerous')
            .interactive()
            .handle(async () => ({}));

        const normalTool = api.query('safe')
            .handle(async () => ({}));

        expect((tool as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(true);
        expect((normalTool as unknown as { isInteractive: () => boolean }).isInteractive()).toBe(false);
    });
});

describe('.interactive() — registration and execution', () => {
    it('interactive tools can be registered and called normally', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('deploy.start')
                .withString('env', 'Environment')
                .interactive()
                .handle(async (input) => ({
                    deployed: true,
                    env: input.env,
                })),
        );

        const result = await registry.routeCall(
            undefined as never,
            'deploy',
            { action: 'start', env: 'production' },
        );

        expect(result.isError).toBeFalsy();
        const text = (result.content[0] as { text: string }).text;
        const parsed = JSON.parse(text);
        expect(parsed.deployed).toBe(true);
        expect(parsed.env).toBe('production');
    });
});
