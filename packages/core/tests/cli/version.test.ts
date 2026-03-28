/**
 * `vurb version` — Unit Tests
 *
 * Covers:
 *   - Happy path: prints CLI version, Node.js, OS
 *   - With installed packages: displays package list
 *   - Without installed packages: no package section
 *   - parseArgs recognizes `version`, `-v`, `--version`
 *   - HELP text includes version command
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs, HELP, VURB_VERSION } from '../../src/cli/vurb.js';
import { commandVersion } from '../../src/cli/commands/version.js';

// ─── Stderr capture ──────────────────────────────────────────────

function captureStderr(fn: () => Promise<void>): Promise<string> {
    return new Promise(async (resolve) => {
        let output = '';
        const originalWrite = process.stderr.write;
        process.stderr.write = ((chunk: string | Uint8Array) => {
            output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
            return true;
        }) as typeof process.stderr.write;
        try {
            await fn();
        } finally {
            process.stderr.write = originalWrite;
        }
        resolve(output);
    });
}

function makeTmp(): string {
    const dir = join(tmpdir(), `vurb-ver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

// ============================================================================
// parseArgs — version command recognition
// ============================================================================

describe('parseArgs recognizes version command', () => {
    it('parses "version" command', () => {
        expect(parseArgs(['node', 'vurb', 'version']).command).toBe('version');
    });

    it('parses "-v" shortcut', () => {
        expect(parseArgs(['node', 'vurb', '-v']).command).toBe('version');
    });

    it('parses "--version" flag', () => {
        expect(parseArgs(['node', 'vurb', '--version']).command).toBe('version');
    });
});

// ============================================================================
// commandVersion
// ============================================================================

describe('commandVersion', () => {
    let tmpDir: string;
    beforeEach(() => { tmpDir = makeTmp(); });
    afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } });

    it('outputs CLI version, Node.js version, and OS', async () => {
        const output = await captureStderr(() =>
            commandVersion({ command: 'version', cwd: tmpDir, check: false, help: false }),
        );

        expect(output).toContain('Vurb CLI');
        expect(output).toContain(VURB_VERSION);
        expect(output).toContain(process.version); // Node.js
        expect(output).toContain(process.platform);
        expect(output).toContain(process.arch);
    });

    it('displays installed @vurb packages when present', async () => {
        // Create fake installed packages
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { '@vurb/core': '^3.0.0' },
        }));
        const pkgDir = join(tmpDir, 'node_modules', '@vurb', 'core');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ version: '3.11.1' }));

        const output = await captureStderr(() =>
            commandVersion({ command: 'version', cwd: tmpDir, check: false, help: false }),
        );

        expect(output).toContain('Installed Packages');
        expect(output).toContain('@vurb/core');
        expect(output).toContain('3.11.1');
    });

    it('skips package list when no @vurb packages installed', async () => {
        writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
            dependencies: { 'express': '^4.0.0' },
        }));

        const output = await captureStderr(() =>
            commandVersion({ command: 'version', cwd: tmpDir, check: false, help: false }),
        );

        expect(output).not.toContain('Installed Packages');
    });

    it('works with empty directory (no package.json)', async () => {
        const output = await captureStderr(() =>
            commandVersion({ command: 'version', cwd: tmpDir, check: false, help: false }),
        );

        expect(output).toContain('Vurb CLI');
        expect(output).toContain(VURB_VERSION);
        expect(output).not.toContain('Installed Packages');
    });
});

// ============================================================================
// HELP text
// ============================================================================

describe('HELP text includes version command', () => {
    it('contains version command entry', () => {
        expect(HELP).toContain('vurb version');
    });

    it('contains update command entry', () => {
        expect(HELP).toContain('vurb update');
    });

    it('contains doctor command entry', () => {
        expect(HELP).toContain('vurb doctor');
    });

    it('contains validate command entry', () => {
        expect(HELP).toContain('vurb validate');
    });
});
