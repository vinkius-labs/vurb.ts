/**
 * npm-registry — Unit Tests
 *
 * Covers:
 *   - scanDeclaredVurbPackages: happy path, empty, no file, corrupt JSON, mixed deps
 *   - getInstalledVersion: installed, missing, corrupt package.json
 *   - scanInstalledVurbPackages: combines declared + node_modules discovery
 *   - fetchLatestVersion: mock fetch success, 404, timeout, bad JSON
 *   - enrichWithLatest: parallel enrichment, partial failures
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    scanDeclaredVurbPackages,
    getInstalledVersion,
    scanInstalledVurbPackages,
    fetchLatestVersion,
    enrichWithLatest,
    VURB_SCOPE,
} from '../../src/cli/npm-registry.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeTmp(): string {
    const dir = join(tmpdir(), `vurb-npm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

// ============================================================================
// scanDeclaredVurbPackages
// ============================================================================

describe('scanDeclaredVurbPackages', () => {
    let tmpDir: string;
    beforeEach(() => { tmpDir = makeTmp(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

    it('extracts @vurb/* from dependencies only', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { '@vurb/core': '^3.8.0', 'zod': '^3.0.0' },
        }));
        const result = scanDeclaredVurbPackages(tmpDir);
        expect(result).toEqual(['@vurb/core']);
    });

    it('extracts from devDependencies and peerDependencies', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            devDependencies: { '@vurb/test': '^1.0.0' },
            peerDependencies: { '@vurb/inspector': '>=2.0.0' },
        }));
        const result = scanDeclaredVurbPackages(tmpDir);
        expect(result).toEqual(['@vurb/inspector', '@vurb/test']);
    });

    it('deduplicates across dependency sections', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { '@vurb/core': '^3.0.0' },
            devDependencies: { '@vurb/core': '^3.0.0' },
            peerDependencies: { '@vurb/core': '>=3.0.0' },
        }));
        const result = scanDeclaredVurbPackages(tmpDir);
        expect(result).toEqual(['@vurb/core']);
    });

    it('returns sorted results', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: {
                '@vurb/z-last': '^1.0.0',
                '@vurb/a-first': '^1.0.0',
                '@vurb/m-middle': '^1.0.0',
            },
        }));
        const result = scanDeclaredVurbPackages(tmpDir);
        expect(result).toEqual(['@vurb/a-first', '@vurb/m-middle', '@vurb/z-last']);
    });

    it('returns empty when no package.json exists', () => {
        expect(scanDeclaredVurbPackages(tmpDir)).toEqual([]);
    });

    it('returns empty when package.json is corrupt', () => {
        writeFileSync(join(tmpDir, 'package.json'), 'not-json{{');
        expect(scanDeclaredVurbPackages(tmpDir)).toEqual([]);
    });

    it('returns empty when no @vurb packages in deps', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { 'express': '^4.0.0', 'zod': '^3.0.0' },
        }));
        expect(scanDeclaredVurbPackages(tmpDir)).toEqual([]);
    });

    it('handles package.json with no dependency sections', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            name: 'my-project',
            version: '1.0.0',
        }));
        expect(scanDeclaredVurbPackages(tmpDir)).toEqual([]);
    });

    it('ignores non-@vurb scoped packages', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: {
                '@vurb/core': '^3.0.0',
                '@modelcontextprotocol/sdk': '^1.0.0',
                '@types/node': '^20.0.0',
                'vurb-plugin': '^1.0.0',  // no scope — should be excluded
            },
        }));
        const result = scanDeclaredVurbPackages(tmpDir);
        expect(result).toEqual(['@vurb/core']);
    });
});

// ============================================================================
// getInstalledVersion
// ============================================================================

describe('getInstalledVersion', () => {
    let tmpDir: string;
    beforeEach(() => { tmpDir = makeTmp(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

    it('reads version from installed package', () => {
        const pkgDir = join(tmpDir, 'node_modules', '@vurb', 'core');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '3.11.1' }));

        expect(getInstalledVersion(tmpDir, '@vurb/core')).toBe('3.11.1');
    });

    it('returns undefined when package is not installed', () => {
        expect(getInstalledVersion(tmpDir, '@vurb/nonexistent')).toBeUndefined();
    });

    it('returns undefined when package.json is corrupt', () => {
        const pkgDir = join(tmpDir, 'node_modules', '@vurb', 'broken');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), '{{{invalid');

        expect(getInstalledVersion(tmpDir, '@vurb/broken')).toBeUndefined();
    });

    it('handles non-scoped package paths', () => {
        const pkgDir = join(tmpDir, 'node_modules', 'zod');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '3.22.4' }));

        expect(getInstalledVersion(tmpDir, 'zod')).toBe('3.22.4');
    });
});

// ============================================================================
// scanInstalledVurbPackages
// ============================================================================

describe('scanInstalledVurbPackages', () => {
    let tmpDir: string;
    beforeEach(() => { tmpDir = makeTmp(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

    it('combines declared + node_modules discovery', () => {
        // Declare @vurb/core in package.json
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { '@vurb/core': '^3.0.0' },
        }));

        // Install @vurb/core and @vurb/test (transitive, not in package.json)
        for (const pkg of ['core', 'test']) {
            const dir = join(tmpDir, 'node_modules', '@vurb', pkg);
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '3.11.1' }));
        }

        const result = scanInstalledVurbPackages(tmpDir);
        expect(result).toHaveLength(2);
        expect(result.map(p => p.name)).toEqual(['@vurb/core', '@vurb/test']);
        expect(result.every(p => p.current === '3.11.1')).toBe(true);
    });

    it('returns empty when no @vurb scope in node_modules', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({}));
        expect(scanInstalledVurbPackages(tmpDir)).toEqual([]);
    });

    it('excludes declared but not installed packages', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { '@vurb/core': '^3.0.0' },
        }));
        // No node_modules — package is declared but not installed
        const result = scanInstalledVurbPackages(tmpDir);
        expect(result).toEqual([]); // not installed → filtered out
    });

    it('handles missing node_modules/@vurb directory gracefully', () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({}));
        mkdirSync(join(tmpDir, 'node_modules'), { recursive: true });
        // @vurb folder doesn't exist
        expect(scanInstalledVurbPackages(tmpDir)).toEqual([]);
    });
});

// ============================================================================
// fetchLatestVersion
// ============================================================================

describe('fetchLatestVersion', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = originalFetch; });

    it('returns version on successful response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ version: '4.0.0' }),
        }) as unknown as typeof fetch;

        const result = await fetchLatestVersion('@vurb/core');
        expect(result).toBe('4.0.0');
    });

    it('returns undefined on 404', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        }) as unknown as typeof fetch;

        const result = await fetchLatestVersion('@vurb/nonexistent');
        expect(result).toBeUndefined();
    });

    it('returns undefined on network error', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(
            new Error('ENOTFOUND'),
        ) as unknown as typeof fetch;

        const result = await fetchLatestVersion('@vurb/core');
        expect(result).toBeUndefined();
    });

    it('returns undefined on malformed JSON response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}), // no version field
        }) as unknown as typeof fetch;

        const result = await fetchLatestVersion('@vurb/core');
        expect(result).toBeUndefined();
    });

    it('returns undefined on fetch abort (timeout)', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(
            new DOMException('The operation was aborted', 'AbortError'),
        ) as unknown as typeof fetch;

        const result = await fetchLatestVersion('@vurb/core');
        expect(result).toBeUndefined();
    });
});

// ============================================================================
// enrichWithLatest
// ============================================================================

describe('enrichWithLatest', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = originalFetch; });

    it('enriches all packages with their latest versions', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ version: '5.0.0' }),
        }) as unknown as typeof fetch;

        const packages = [
            { name: '@vurb/core', current: '3.11.1' },
            { name: '@vurb/test', current: '3.11.1' },
        ];

        const result = await enrichWithLatest(packages);
        expect(result).toHaveLength(2);
        expect(result[0]!.latest).toBe('5.0.0');
        expect(result[1]!.latest).toBe('5.0.0');
    });

    it('handles partial failures gracefully', async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) return { ok: true, json: async () => ({ version: '5.0.0' }) };
            throw new Error('ENOTFOUND');
        }) as unknown as typeof fetch;

        const packages = [
            { name: '@vurb/core', current: '3.11.1' },
            { name: '@vurb/failing', current: '1.0.0' },
        ];

        const result = await enrichWithLatest(packages);
        expect(result[0]!.latest).toBe('5.0.0');
        expect(result[1]!.latest).toBeUndefined();
    });

    it('returns empty array for empty input', async () => {
        const result = await enrichWithLatest([]);
        expect(result).toEqual([]);
    });
});

// ============================================================================
// Constants
// ============================================================================

describe('npm-registry constants', () => {
    it('VURB_SCOPE is correct', () => {
        expect(VURB_SCOPE).toBe('@vurb');
    });
});
