/**
 * Bug #100 — VurbTester spread-order: action must come AFTER user args
 *
 * Verifies that user-provided `action` in args does NOT override the
 * discriminator injected by callAction().
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    createTool,
    ToolRegistry,
    success,
} from '@vurb/core';
import { VurbTester } from '../src/index.js';

describe('Bug #100 — VurbTester spread-order (action after spread)', () => {
    it('discriminator is NOT overridden by user args containing action key', async () => {
        const listSpy = vi.fn();
        const createSpy = vi.fn();

        const registry = new ToolRegistry();
        const tool = createTool('orders')
            .description('Order management')
            .action({
                name: 'list',
                description: 'List orders',
                schema: z.object({}).passthrough(),
                handler: async (_ctx, _args) => {
                    listSpy();
                    return success({ received: 'list-handler' });
                },
            } as any)
            .action({
                name: 'create',
                description: 'Create order',
                schema: z.object({}).passthrough(),
                handler: async (_ctx, _args) => {
                    createSpy();
                    return success({ received: 'create-handler' });
                },
            } as any);

        registry.registerAll(tool);

        const tester = new VurbTester(registry, {
            contextFactory: async () => ({}) as never,
        });

        // Call 'list' action but pass { action: 'create' } in user args
        // With bug: create handler would run (user override wins)
        // Fixed: list handler runs (action comes last in spread)
        const result = await tester.callAction('orders', 'list', { action: 'create' });
        expect(result.isError).toBe(false);
        expect(listSpy).toHaveBeenCalled();
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('works normally when user args do not contain action', async () => {
        const registry = new ToolRegistry();
        const tool = createTool('items')
            .description('Item management')
            .action({
                name: 'get',
                description: 'Get an item',
                schema: z.object({ id: z.number() }),
                handler: async (_ctx, args) => {
                    return success({ id: args.id });
                },
            } as any);

        registry.registerAll(tool);

        const tester = new VurbTester(registry, {
            contextFactory: async () => ({}) as never,
        });

        const result = await tester.callAction('items', 'get', { id: 42 });
        expect(result.isError).toBe(false);
    });
});
