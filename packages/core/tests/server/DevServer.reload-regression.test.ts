/**
 * DevServer.performReload — Regression Tests for Bug #2
 *
 * Bug: `performReload` passed `{} as ToolRegistryLike` to the user's setup
 * callback. The empty object had no `register()` method, so calling
 * `registry.register(builder)` inside setup threw:
 *   TypeError: registry.register is not a function
 *
 * The existing tests used `vi.fn()` (no-op) as the setup callback and
 * never actually called `registry.register()`, so they never caught the bug.
 *
 * Fix applied: `performReload` now creates a duck-typed registry with
 * working `register()` and `getBuilders()` methods.
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDevServer } from '../../src/server/DevServer.js';

// ============================================================================
// REGRESSION: Bug #2 — setup callback must receive usable registry
// ============================================================================

describe('Bug #2 Regression: DevServer reload must provide working registry', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('setup callback receives registry with working register() method', async () => {
        // This is the EXACT scenario that caused the crash:
        // The user's setup callback calls registry.register(builder)
        // BUG: registry was {}, so register() doesn't exist → TypeError
        // FIX: registry now has a real register() method

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let receivedRegistry: unknown = null;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                receivedRegistry = registry;
                // This line would throw TypeError with the old code:
                // TypeError: registry.register is not a function
                registry.register({ name: 'test-builder' });
            },
        });

        await devServer.reload('test');

        // Verify registry was received and has the register method
        expect(receivedRegistry).not.toBeNull();
        expect(typeof (receivedRegistry as { register: unknown }).register).toBe('function');

        // Verify NO error was logged (setup succeeded)
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('register() collects builders correctly during reload', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        let capturedBuilders: unknown[] = [];

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                // Register multiple builders like a real setup callback would
                registry.register({ name: 'users', type: 'grouped' });
                registry.register({ name: 'orders', type: 'grouped' });
                registry.register({ name: 'products', type: 'grouped' });

                // getBuilders should return all registered builders
                if (registry.getBuilders) {
                    capturedBuilders = registry.getBuilders();
                }
            },
        });

        await devServer.reload('test');

        expect(capturedBuilders).toHaveLength(3);
        expect(capturedBuilders[0]).toEqual({ name: 'users', type: 'grouped' });
        expect(capturedBuilders[1]).toEqual({ name: 'orders', type: 'grouped' });
        expect(capturedBuilders[2]).toEqual({ name: 'products', type: 'grouped' });

        consoleSpy.mockRestore();
    });

    it('each reload creates a fresh registry (no builder leaks between reloads)', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const builderCounts: number[] = [];

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                registry.register({ name: 'tool-a' });

                if (registry.getBuilders) {
                    builderCounts.push(registry.getBuilders().length);
                }
            },
        });

        // Reload 3 times
        await devServer.reload('change-1');
        await devServer.reload('change-2');
        await devServer.reload('change-3');

        // Each reload should see exactly 1 builder (fresh registry each time)
        // If the registry leaked between reloads, we'd see [1, 2, 3]
        expect(builderCounts).toEqual([1, 1, 1]);

        consoleSpy.mockRestore();
    });

    it('register() does not throw for any builder type', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                // Test with various builder shapes
                registry.register(null);
                registry.register(undefined);
                registry.register('string-builder');
                registry.register(42);
                registry.register({ complex: { nested: true } });
                registry.register(() => 'function-builder');
            },
        });

        // Should not throw or log errors
        await devServer.reload('test');
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('setup error after successful register() calls is handled gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                registry.register({ name: 'tool-a' });
                registry.register({ name: 'tool-b' });
                // Setup fails after some registrations
                throw new Error('Database connection lost');
            },
        });

        // Should not throw
        await devServer.reload('test');

        // Error should be logged
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Reload failed: Database connection lost'),
        );

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('async setup with register() works correctly', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let builderCount = 0;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: async (registry) => {
                // Simulate async discovery (like autoDiscover)
                await new Promise(resolve => setTimeout(resolve, 10));
                registry.register({ name: 'discovered-tool-1' });

                await new Promise(resolve => setTimeout(resolve, 10));
                registry.register({ name: 'discovered-tool-2' });

                if (registry.getBuilders) {
                    builderCount = registry.getBuilders().length;
                }
            },
        });

        await devServer.reload('test');

        expect(builderCount).toBe(2);
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('MCP notification is sent after successful setup with register()', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const sendNotification = vi.fn().mockResolvedValue(undefined);

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                registry.register({ name: 'my-tool' });
            },
            server: {
                notification: vi.fn(),
                sendNotification,
            },
        });

        await devServer.reload('file-change');

        // Notification should be sent after successful reload
        expect(sendNotification).toHaveBeenCalledWith({
            method: 'notifications/tools/list_changed',
        });

        consoleSpy.mockRestore();
    });

    it('MCP notification is NOT sent when setup with register() fails', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const sendNotification = vi.fn();

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registry) => {
                registry.register({ name: 'tool' });
                throw new Error('Setup boom');
            },
            server: {
                notification: vi.fn(),
                sendNotification,
            },
        });

        await devServer.reload('file-change');

        // Notification should NOT be sent because setup failed
        expect(sendNotification).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
});
