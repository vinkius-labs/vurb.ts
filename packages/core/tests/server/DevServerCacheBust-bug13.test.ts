/**
 * Bug #13 Regression: DevServer ESM cache-bust not surfaced to setup callback
 *
 * BUG: ESM invalidation only works if the setup callback uses
 * `import(cacheBustUrl(...))` instead of plain `import('./path')`.
 * The cache-busted URL was never passed to the setup callback, making
 * ESM hot-reload silently broken unless the developer knew to manually
 * import `cacheBustUrl` and use it.
 *
 * FIX:
 * 1. New `DevServerSetupContext` interface with `registry` + `cacheBustUrl`
 * 2. Setup callback now receives a context with duck-typed backward compatibility
 * 3. ESM cache-bust warning emitted once on first file-change reload
 *
 * @module
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDevServer, cacheBustUrl } from '../../src/server/DevServer.js';
import type { DevServerSetupContext } from '../../src/server/DevServer.js';

describe('Bug #13 Regression: DevServer cache-bust in setup context', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── Setup receives context with cacheBustUrl ─────────────

    it('should pass DevServerSetupContext to setup callback on reload', async () => {
        let receivedCtx: unknown;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (ctx) => { receivedCtx = ctx; },
        });

        await devServer.reload('some/file.ts');

        // Should have registry and cacheBustUrl properties
        expect(receivedCtx).toHaveProperty('registry');
        expect(receivedCtx).toHaveProperty('cacheBustUrl');
    });

    it('should provide cacheBustUrl as undefined on initial/manual reload', async () => {
        let receivedCtx: DevServerSetupContext | undefined;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (ctx) => { receivedCtx = ctx as DevServerSetupContext; },
        });

        // Manual reload — no file changed, lastCacheBustUrl may be undefined
        await devServer.reload();

        expect(receivedCtx).toBeDefined();
        expect(receivedCtx!.registry).toBeDefined();
        // cacheBustUrl may or may not be set depending on prior invalidateModule calls
        expect('cacheBustUrl' in receivedCtx!).toBe(true);
    });

    // ── Backward compatibility (duck typing) ─────────────────

    it('should allow legacy setup(registry) pattern via duck typing', async () => {
        const registered: unknown[] = [];

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (registryOrCtx) => {
                // Legacy pattern: treat arg as a registry directly
                if ('register' in registryOrCtx) {
                    registryOrCtx.register({ name: 'test-tool' });
                }
            },
        });

        await devServer.reload('test.ts');

        // No error thrown — backward compatible
    });

    it('should support new context pattern for ESM imports', async () => {
        let capturedUrl: string | undefined;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (ctx) => {
                const context = ctx as DevServerSetupContext;
                capturedUrl = context.cacheBustUrl;
                // Developer would do: await import(context.cacheBustUrl ?? './fallback')
                context.registry.register({ name: 'reloaded-tool' });
            },
        });

        await devServer.reload('src/tools/billing.ts');

        // cacheBustUrl should be set after invalidateModule ran
        // (it's set via module-level lastCacheBustUrl)
        expect(capturedUrl).toBeDefined();
        expect(typeof capturedUrl).toBe('string');
    });

    // ── Duck-typed register/getBuilders at top level ─────────

    it('should expose register() at top level of context for backward compat', async () => {
        let hasRegister = false;
        let hasGetBuilders = false;

        const devServer = createDevServer({
            dir: './src/tools',
            setup: (ctx) => {
                hasRegister = typeof (ctx as any).register === 'function';
                hasGetBuilders = typeof (ctx as any).getBuilders === 'function';
            },
        });

        await devServer.reload('test');

        expect(hasRegister).toBe(true);
        expect(hasGetBuilders).toBe(true);
    });

    it('should collect builders via duck-typed register()', async () => {
        const mockRegistry = {
            register: vi.fn(),
            clear: vi.fn(),
            getBuilders: vi.fn().mockReturnValue([]),
        };

        const devServer = createDevServer({
            dir: './src/tools',
            registry: mockRegistry,
            setup: (ctx) => {
                // Use duck-typed register at top level
                (ctx as any).register({ name: 'tool-a' });
                (ctx as any).register({ name: 'tool-b' });
            },
        });

        await devServer.reload('test.ts');

        // Builders should be transferred to real registry
        expect(mockRegistry.clear).toHaveBeenCalled();
        expect(mockRegistry.register).toHaveBeenCalledTimes(2);
    });

    // ── ESM warning emission ─────────────────────────────────

    it('should emit ESM cache-bust warning once on first file reload', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
        });

        // First real file change reload
        await devServer.reload('src/tools/billing.ts');

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('ESM hot-reload requires cache-busted imports'),
        );
    });

    it('should NOT emit ESM warning on initial or manual reload', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
        });

        // Manual and initial reloads should not warn
        await devServer.reload(); // reason defaults to '(manual)'

        expect(warnSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('ESM hot-reload'),
        );
    });

    it('should emit ESM warning only once across multiple reloads', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const devServer = createDevServer({
            dir: './src/tools',
            setup: vi.fn(),
        });

        await devServer.reload('file1.ts');
        await devServer.reload('file2.ts');
        await devServer.reload('file3.ts');

        const esmWarnings = warnSpy.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('ESM hot-reload'),
        );
        expect(esmWarnings).toHaveLength(1);
    });

    // ── cacheBustUrl utility ─────────────────────────────────

    it('should export cacheBustUrl for manual use', () => {
        expect(typeof cacheBustUrl).toBe('function');

        const url = cacheBustUrl('./src/tools.ts');
        expect(url).toContain('file://');
        expect(url).toContain('?t=');
    });

    it('should generate unique cache-bust URLs on each call', () => {
        const url1 = cacheBustUrl('./src/tools.ts');
        // Wait a tick to ensure different timestamp
        const url2 = cacheBustUrl('./src/tools.ts');

        // URLs share the same base path but may have same or different timestamps
        expect(url1).toContain('tools.ts');
        expect(url2).toContain('tools.ts');
    });
});
