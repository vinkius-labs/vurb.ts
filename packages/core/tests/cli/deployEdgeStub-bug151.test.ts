/**
 * Bug #151 — Deploy edge-stub resolution
 *
 * The deploy command must correctly locate `edge-stub.js` to alias
 * Node.js built-in modules for edge V8 isolate deployment.
 *
 * Previously, `edgeStubAliases()` used `require.resolve('vurb')` which:
 *   1. Referenced a non-existent package (correct name is `@vurb/core`)
 *   2. Even with the correct name, `createRequire().resolve()` uses CJS
 *      resolution, but `@vurb/core` only exports ESM (`"import"` condition)
 *
 * The fix uses `fileURLToPath(new URL('../../edge-stub.js', import.meta.url))`
 * — a relative path from the file itself, eliminating external resolution.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const SRC_PATH = resolve(__dirname, '../../src/cli/commands/deploy.ts');
const DIST_PATH = resolve(__dirname, '../../dist/cli/commands/deploy.js');
const EDGE_STUB_DIST = resolve(__dirname, '../../dist/edge-stub.js');
const EDGE_STUB_SRC = resolve(__dirname, '../../src/edge-stub.ts');

const deploySource = readFileSync(SRC_PATH, 'utf-8');

// ── Source Analysis ─────────────────────────────────────────────────

describe('Bug #151 — edgeStubAliases() module resolution', () => {
    it('should NOT use require.resolve to locate edge-stub', () => {
        // The old broken patterns — must never appear
        expect(deploySource).not.toContain("require.resolve('vurb')");
        expect(deploySource).not.toContain('require.resolve("vurb")');
        expect(deploySource).not.toContain("require.resolve('@vurb/core')");
        expect(deploySource).not.toContain('require.resolve("@vurb/core")');
    });

    it('should NOT import createRequire', () => {
        // createRequire is no longer needed in deploy.ts
        expect(deploySource).not.toContain('createRequire');
    });

    it('should use import.meta.url relative resolution', () => {
        expect(deploySource).toContain("new URL('../../edge-stub.js', import.meta.url)");
    });

    it('should import fileURLToPath from node:url', () => {
        expect(deploySource).toMatch(/import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*['"]node:url['"]/);
    });

    it('should NOT have unused dirname import', () => {
        // dirname was used in the old pattern: dirname(require.resolve(...))
        // After the fix, only resolve should be imported from node:path
        const pathImport = deploySource.match(/import\s*\{([^}]*)\}\s*from\s*['"]node:path['"]/);
        expect(pathImport).toBeTruthy();
        expect(pathImport![1]).not.toContain('dirname');
        expect(pathImport![1]).toContain('resolve');
    });
});

// ── Edge Stub File Existence ────────────────────────────────────────

describe('Bug #151 — edge-stub.js physical existence', () => {
    it('should have edge-stub.ts in source', () => {
        expect(existsSync(EDGE_STUB_SRC)).toBe(true);
    });

    it('should have edge-stub.js in dist after build', () => {
        expect(existsSync(EDGE_STUB_DIST)).toBe(true);
    });

    it('should have deploy.js in dist after build', () => {
        expect(existsSync(DIST_PATH)).toBe(true);
    });

    it('should maintain correct relative distance between deploy.js and edge-stub.js', () => {
        // deploy.js is at dist/cli/commands/deploy.js
        // edge-stub.js is at dist/edge-stub.js
        // relative path from deploy.js dir to edge-stub.js must be ../../edge-stub.js
        const deployDir = resolve(DIST_PATH, '..');
        const rel = relative(deployDir, EDGE_STUB_DIST).replace(/\\/g, '/');
        expect(rel).toBe('../../edge-stub.js');
    });
});

// ── Edge Stub Aliases Coverage ──────────────────────────────────────

describe('Bug #151 — edgeStubAliases() completeness', () => {
    it('should alias both node: prefixed and bare specifiers', () => {
        // Must map both `node:fs` and `fs` to stubPath
        expect(deploySource).toContain('`node:${mod}`');
        expect(deploySource).toContain('stubs[mod]');
    });

    it('should include all critical Node.js built-ins for edge stubbing', () => {
        const requiredModules = [
            'child_process', 'fs', 'net', 'events', 'stream',
            'http', 'https', 'tls', 'os', 'path', 'url', 'crypto',
            'buffer', 'util', 'zlib',
        ];
        for (const mod of requiredModules) {
            expect(deploySource).toContain(`'${mod}'`);
        }
    });

    it('should include string_decoder and querystring for full SDK compat', () => {
        expect(deploySource).toContain("'string_decoder'");
        expect(deploySource).toContain("'querystring'");
    });
});

// ── Compiled deploy.js Verification ─────────────────────────────────

describe('Bug #151 — compiled deploy.js correctness', () => {
    it('should compile without require.resolve references', () => {
        if (!existsSync(DIST_PATH)) return; // skip if not built
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).not.toContain("require.resolve('vurb')");
        expect(compiled).not.toContain("require.resolve('@vurb/core')");
    });

    it('should contain the relative URL resolution in compiled output', () => {
        if (!existsSync(DIST_PATH)) return;
        const compiled = readFileSync(DIST_PATH, 'utf-8');
        expect(compiled).toContain('../../edge-stub.js');
        expect(compiled).toContain('import.meta.url');
    });
});

// ── autoDiscover Warning ────────────────────────────────────────────

describe('Deploy — autoDiscover() edge warning', () => {
    it('should detect autoDiscover usage and warn', () => {
        expect(deploySource).toContain('autoDiscover');
        expect(deploySource).toContain('fs.readdir');
        expect(deploySource).toContain('Edge V8 isolates do not support filesystem access');
    });

    it('should suggest explicit imports as replacement', () => {
        expect(deploySource).toContain('registry.register(tool)');
    });
});
