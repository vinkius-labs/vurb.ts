/**
 * `vurb doctor` — environment diagnostics.
 *
 * Checks Node version, installed packages, .vurbrc config, token validity,
 * entrypoint resolution, esbuild availability, and lockfile status.
 *
 * @module
 */
import type { CliArgs } from '../args.js';
import { ansi, VURB_VERSION, VINKIUS_CLOUD_URL } from '../constants.js';
import { readVurbRc } from '../rc.js';
import { inferServerEntry } from '../utils.js';
import { scanInstalledVurbPackages, enrichWithLatest } from '../npm-registry.js';

// ─── Diagnostic Helpers ──────────────────────────────────────────

type CheckResult = { status: 'pass' | 'warn' | 'fail'; label: string; detail: string };

function pass(label: string, detail: string): CheckResult {
    return { status: 'pass', label, detail };
}

function warn(label: string, detail: string): CheckResult {
    return { status: 'warn', label, detail };
}

function fail(label: string, detail: string): CheckResult {
    return { status: 'fail', label, detail };
}

function printResult(r: CheckResult): void {
    const icon = r.status === 'pass'
        ? ansi.green('✓')
        : r.status === 'warn'
            ? ansi.yellow('⚠')
            : ansi.red('✗');
    const detail = r.status === 'warn' || r.status === 'fail'
        ? ansi.yellow(r.detail)
        : r.detail;
    process.stderr.write(`  ${icon} ${r.label.padEnd(20)} ${detail}\n`);
}

// ─── Individual Checks ──────────────────────────────────────────

function checkNode(): CheckResult {
    const major = parseInt(process.version.slice(1), 10);
    if (major < 18) return warn('Node.js', `${process.version} — v18+ recommended`);
    return pass('Node.js', process.version);
}

function checkCore(): CheckResult {
    return pass('@vurb/core', VURB_VERSION);
}

async function checkPackageVersions(cwd: string): Promise<CheckResult[]> {
    const packages = scanInstalledVurbPackages(cwd);
    if (packages.length === 0) return [];

    const enriched = await enrichWithLatest(packages);
    const results: CheckResult[] = [];
    for (const pkg of enriched) {
        if (!pkg.latest || pkg.current === pkg.latest) {
            results.push(pass(pkg.name, `${pkg.current} ${ansi.dim('(latest)')}`));
        } else {
            results.push(warn(pkg.name, `${pkg.current} → ${pkg.latest} ${ansi.dim('(run: vurb update)')}`));
        }
    }
    return results;
}

function checkVurbRc(cwd: string): CheckResult[] {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    const rcPath = resolve(cwd, '.vurbrc');

    if (!existsSync(rcPath)) {
        return [warn('.vurbrc', 'not found — run: vurb remote <url>')];
    }

    const config = readVurbRc(cwd);
    const parts: string[] = [];
    if (config.token) parts.push('token');
    if (config.remote) parts.push('remote');
    if (config.serverId) parts.push('serverId');

    if (parts.length === 0) {
        return [warn('.vurbrc', 'exists but empty')];
    }
    return [pass('.vurbrc', `configured (${parts.join(' + ')})`)];
}

async function checkToken(cwd: string): Promise<CheckResult> {
    const config = readVurbRc(cwd);
    const token = config.token ?? process.env['VURB_DEPLOY_TOKEN'];

    if (!token) return warn('Connection token', 'not set (run: vurb token <token>)');

    const remote = config.remote ?? VINKIUS_CLOUD_URL;
    try {
        const res = await fetch(`${remote.replace(/\/+$/, '')}/token/info`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
            const data = await res.json() as { server_name?: string };
            return pass('Connection token', `active${data.server_name ? ` (${data.server_name})` : ''}`);
        }
        if (res.status === 401) return fail('Connection token', 'expired or invalid');
        return warn('Connection token', `API returned ${res.status}`);
    } catch {
        return warn('Connection token', 'API unreachable — could not verify');
    }
}

function checkEntrypoint(cwd: string): CheckResult {
    const entry = inferServerEntry(cwd);
    if (!entry) return warn('Entrypoint', 'not found (expected src/server.ts)');
    return pass('Entrypoint', entry);
}

function checkEsbuild(cwd: string): CheckResult {
    try {
        const { resolve } = require('node:path') as typeof import('node:path');
        const { existsSync } = require('node:fs') as typeof import('node:fs');
        const esbuildPkg = resolve(cwd, 'node_modules', 'esbuild', 'package.json');
        if (existsSync(esbuildPkg)) {
            const { readFileSync } = require('node:fs') as typeof import('node:fs');
            const pkg = JSON.parse(readFileSync(esbuildPkg, 'utf-8'));
            return pass('esbuild', pkg.version);
        }
        return warn('esbuild', 'not installed (required for vurb deploy)');
    } catch {
        return warn('esbuild', 'not installed (required for vurb deploy)');
    }
}

function checkLockfile(cwd: string): CheckResult {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    if (existsSync(resolve(cwd, 'vurb.lock'))) {
        return pass('vurb.lock', 'present');
    }
    return warn('vurb.lock', 'missing (run: vurb lock)');
}

// ─── Command ─────────────────────────────────────────────────────

export async function commandDoctor(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    process.stderr.write(`\n  ${ansi.bold('Vurb Doctor')}\n\n`);

    const results: CheckResult[] = [];

    // Synchronous checks
    results.push(checkNode());
    results.push(checkCore());

    // Async checks — run concurrently
    const [packageResults, tokenResult] = await Promise.all([
        checkPackageVersions(cwd),
        checkToken(cwd),
    ]);

    results.push(...packageResults);
    results.push(...checkVurbRc(cwd));
    results.push(tokenResult);
    results.push(checkEntrypoint(cwd));
    results.push(checkEsbuild(cwd));
    results.push(checkLockfile(cwd));

    // Print
    for (const r of results) printResult(r);

    const passed = results.filter(r => r.status === 'pass').length;
    const warned = results.filter(r => r.status === 'warn').length;
    const failed = results.filter(r => r.status === 'fail').length;

    process.stderr.write('\n');
    if (failed > 0) {
        process.stderr.write(`  ${ansi.red(`${failed} error${failed !== 1 ? 's' : ''}`)}`);
        if (warned > 0) process.stderr.write(`, ${ansi.yellow(`${warned} warning${warned !== 1 ? 's' : ''}`)}`);
        process.stderr.write(`, ${passed} passed.\n\n`);
    } else if (warned > 0) {
        process.stderr.write(`  ${passed} passed, ${ansi.yellow(`${warned} warning${warned !== 1 ? 's' : ''}`)}.\n\n`);
    } else {
        process.stderr.write(`  ${ansi.green(`All ${passed} checks passed ✓`)}\n\n`);
    }
}
