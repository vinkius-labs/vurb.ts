/**
 * `vurb doctor` — Unit Tests
 *
 * Covers:
 *   - parseArgs: recognizes `doctor` command
 *   - Node.js version check: pass on v18+, warn on < v18
 *   - .vurbrc detection: missing, empty, configured
 *   - Token validation: no token, API reachable, API unreachable, expired token
 *   - Entrypoint detection: found, not found
 *   - esbuild detection: installed, missing
 *   - Lockfile detection: present, missing
 *   - Summary line: all pass, warnings, errors
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from '../../src/cli/vurb.js';
import { commandDoctor } from '../../src/cli/commands/doctor.js';

// ─── Helpers ─────────────────────────────────────────────────────

function captureStderr(fn: () => Promise<void>): Promise<string> {
    return new Promise(async (resolve) => {
        let output = '';
        const original = process.stderr.write;
        process.stderr.write = ((chunk: string | Uint8Array) => {
            output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
            return true;
        }) as typeof process.stderr.write;
        try { await fn(); } finally { process.stderr.write = original; }
        resolve(output);
    });
}

function makeTmp(): string {
    const dir = join(tmpdir(), `vurb-doc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

// ============================================================================
// parseArgs
// ============================================================================

describe('parseArgs recognizes doctor command', () => {
    it('parses "doctor" command', () => {
        expect(parseArgs(['node', 'vurb', 'doctor']).command).toBe('doctor');
    });
});

// ============================================================================
// commandDoctor
// ============================================================================

describe('commandDoctor', () => {
    let tmpDir: string;
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        tmpDir = makeTmp();
        // Block all external calls
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('blocked')) as unknown as typeof fetch;
        delete process.env['VURB_DEPLOY_TOKEN'];
    });

    afterEach(() => {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
        globalThis.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it('prints header "Vurb Doctor"', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('Vurb Doctor');
    });

    it('checks Node.js version (passes on current runtime)', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        // We're running vi test on Node 18+, so should pass
        expect(output).toContain(process.version);
    });

    it('checks @vurb/core version', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('@vurb/core');
    });

    it('warns when .vurbrc is missing', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('.vurbrc');
        expect(output).toContain('not found');
    });

    it('passes when .vurbrc is configured', async () => {
        writeFileSync(join(tmpDir, '.vurbrc'), JSON.stringify({
            token: 'vk_live_test',
            remote: 'https://api.vinkius.com',
        }));

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('configured');
        expect(output).toContain('token');
        expect(output).toContain('remote');
    });

    it('warns when .vurbrc exists but is empty object', async () => {
        writeFileSync(join(tmpDir, '.vurbrc'), '{}');

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('exists but empty');
    });

    it('warns when connection token is not set', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('not set');
    });

    it('handles API unreachable for token validation', async () => {
        writeFileSync(join(tmpDir, '.vurbrc'), JSON.stringify({
            token: 'vk_live_test123',
            remote: 'https://unreachable.invalid',
        }));

        globalThis.fetch = vi.fn().mockRejectedValue(
            new Error('ENOTFOUND'),
        ) as unknown as typeof fetch;

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('API unreachable');
    });

    it('reports expired/invalid token from API', async () => {
        writeFileSync(join(tmpDir, '.vurbrc'), JSON.stringify({
            token: 'vk_live_expired',
            remote: 'https://api.vinkius.com',
        }));

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        }) as unknown as typeof fetch;

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('expired or invalid');
    });

    it('reports valid token from API', async () => {
        writeFileSync(join(tmpDir, '.vurbrc'), JSON.stringify({
            token: 'vk_live_valid',
            remote: 'https://api.vinkius.com',
        }));

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ server_name: 'my-server' }),
        }) as unknown as typeof fetch;

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('active');
        expect(output).toContain('my-server');
    });

    it('detects token from VURB_DEPLOY_TOKEN env var', async () => {
        process.env['VURB_DEPLOY_TOKEN'] = 'vk_env_token';

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ server_name: 'env-server' }),
        }) as unknown as typeof fetch;

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('active');
    });

    it('warns when server entrypoint is not found', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('Entrypoint');
        expect(output).toContain('not found');
    });

    it('detects server entrypoint', async () => {
        mkdirSync(join(tmpDir, 'src'), { recursive: true });
        writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {}');

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('src/server.ts');
    });

    it('warns when esbuild is not installed', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('esbuild');
        expect(output).toContain('not installed');
    });

    it('detects esbuild when installed', async () => {
        const esbuildDir = join(tmpDir, 'node_modules', 'esbuild');
        mkdirSync(esbuildDir, { recursive: true });
        writeFileSync(join(esbuildDir, 'package.json'), JSON.stringify({ version: '0.20.2' }));

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('0.20.2');
    });

    it('warns when vurb.lock is missing', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('vurb.lock');
        expect(output).toContain('missing');
    });

    it('passes when vurb.lock is present', async () => {
        writeFileSync(join(tmpDir, 'vurb.lock'), '{}');

        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        expect(output).toContain('vurb.lock');
        expect(output).toContain('present');
    });

    it('shows summary line with pass counts', async () => {
        const output = await captureStderr(() =>
            commandDoctor({ command: 'doctor', cwd: tmpDir, check: false, help: false }),
        );
        // Should have both passed and warnings (since many things are missing in tmpDir)
        expect(output).toMatch(/\d+ passed/);
    });
});
