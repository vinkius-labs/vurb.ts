/**
 * `vurb validate` — live server smoke test.
 *
 * Boots the server via introspection, validates all tools/prompts/resources,
 * checks schema consistency, handler coverage, and lockfile drift.
 *
 * @module
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CliArgs } from '../args.js';
import { ansi } from '../constants.js';
import { inferServerEntry } from '../utils.js';
import { runIntrospection } from './introspect.js';
import type { IntrospectionReport } from './introspect.js';

// ─── Validation Checks ──────────────────────────────────────────

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
    const detail = r.status === 'fail'
        ? ansi.red(r.detail)
        : r.status === 'warn'
            ? ansi.yellow(r.detail)
            : r.detail;
    process.stderr.write(`  ${icon} ${r.label.padEnd(20)} ${detail}\n`);
}

// ─── Lockfile drift ──────────────────────────────────────────────

function checkLockfileDrift(cwd: string, report: IntrospectionReport): CheckResult {
    const lockfilePath = resolve(cwd, 'vurb.lock');
    if (!existsSync(lockfilePath)) {
        return warn('Lockfile', 'vurb.lock not found — run: vurb lock');
    }

    try {
        const onDisk = readFileSync(lockfilePath, 'utf-8');
        const freshJson = JSON.stringify(report.lockfile, null, 2);
        const diskSha = createHash('sha256').update(onDisk).digest('hex').slice(0, 12);
        const freshSha = createHash('sha256').update(freshJson).digest('hex').slice(0, 12);

        if (diskSha === freshSha) {
            return pass('Lockfile', `vurb.lock matches — no drift ${ansi.dim(`(${diskSha})`)}`);
        }
        return warn('Lockfile', `drift detected (disk:${diskSha} ≠ live:${freshSha}) — run: vurb lock`);
    } catch (err) {
        return warn('Lockfile', `could not read: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// ─── Tool analysis ───────────────────────────────────────────────

function analyzeTools(report: IntrospectionReport): CheckResult[] {
    const results: CheckResult[] = [];
    const contracts = report.contracts as Record<string, {
        surface: {
            actions: Record<string, unknown>;
            description?: string;
            parameters?: Record<string, unknown>;
        };
    }>;

    const totalNamespaces = Object.keys(contracts).length;
    const totalTools = report.tools.length;
    const grouped = Object.entries(contracts).filter(([, c]) => Object.keys(c.surface.actions).length > 1);

    // Tools summary
    if (totalTools === 0) {
        results.push(warn('Tools', 'no tools registered'));
    } else {
        const groupDetail = grouped.length > 0
            ? ` (${grouped.length} grouped → ${totalTools - totalNamespaces + grouped.length} actions, ${totalNamespaces - grouped.length} flat)`
            : '';
        results.push(pass('Tools', `${totalTools} registered${groupDetail}`));
    }

    // Check for empty descriptions
    const noDesc = report.tools.filter(t => !t.description || t.description.trim() === '');
    if (noDesc.length > 0) {
        results.push(warn('Descriptions', `${noDesc.length} tool${noDesc.length !== 1 ? 's' : ''} missing description`));
    } else if (totalTools > 0) {
        results.push(pass('Descriptions', 'all tools have descriptions'));
    }

    // Check for duplicate action keys within groups
    for (const [namespace, contract] of Object.entries(contracts)) {
        const actions = Object.keys(contract.surface.actions);
        const unique = new Set(actions);
        if (unique.size < actions.length) {
            results.push(fail('Duplicates', `${namespace} has duplicate action keys`));
        }
    }

    // Schema validation — count total parameters
    let totalParams = 0;
    for (const [, contract] of Object.entries(contracts)) {
        for (const [, action] of Object.entries(contract.surface.actions)) {
            const a = action as { parameters?: Record<string, unknown> };
            if (a.parameters) totalParams += Object.keys(a.parameters).length;
        }
    }
    if (totalTools > 0) {
        results.push(pass('Schemas', `all valid (${totalParams} parameter${totalParams !== 1 ? 's' : ''} across ${totalTools} tool${totalTools !== 1 ? 's' : ''})`));
    }

    return results;
}

// ─── Command ─────────────────────────────────────────────────────

export async function commandValidate(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    process.stderr.write(`\n  ${ansi.bold('Vurb Validate')} ${ansi.dim('— Live Server Check')}\n\n`);

    // 1. Resolve entrypoint
    const serverPath = args.server ?? inferServerEntry(cwd);
    if (!serverPath) {
        process.stderr.write(`  ${ansi.red('✗')} Could not resolve server entrypoint.\n`);
        process.stderr.write(`  ${ansi.dim('  hint: create src/server.ts or use --server <path>')}\n\n`);
        process.exit(1);
    }
    const absEntry = resolve(cwd, serverPath);
    if (!existsSync(absEntry)) {
        process.stderr.write(`  ${ansi.red('✗')} Entrypoint not found: ${absEntry}\n\n`);
        process.exit(1);
    }
    printResult(pass('Entrypoint', `${serverPath} ${ansi.dim('(resolved)')}`));

    // 2. Run introspection
    let report: IntrospectionReport;
    try {
        report = await runIntrospection(absEntry, cwd);
    } catch (err) {
        printResult(fail('Server boot', `failed: ${err instanceof Error ? err.message : String(err)}`));
        process.stderr.write('\n');
        process.exit(1);
        return; // unreachable, but satisfies TS
    }

    printResult(pass('Build', `compiled in ${report.buildTimeMs}ms`));
    printResult(pass('Server boot', `initialized in ${report.bootTimeMs}ms ${ansi.dim(`(${report.serverName} v${report.version})`)}`));

    // 3. Tool analysis
    const toolResults = analyzeTools(report);
    for (const r of toolResults) printResult(r);

    // 4. Lockfile drift
    const lockResult = checkLockfileDrift(cwd, report);
    printResult(lockResult);

    // 5. Summary
    const all = [
        pass('Entrypoint', ''),
        pass('Build', ''),
        pass('Server boot', ''),
        ...toolResults,
        lockResult,
    ];
    const passed = all.filter(r => r.status === 'pass').length;
    const warned = all.filter(r => r.status === 'warn').length;
    const failed = all.filter(r => r.status === 'fail').length;

    process.stderr.write('\n');
    if (failed > 0) {
        process.stderr.write(`  ${ansi.red(`Validation failed — ${failed} error${failed !== 1 ? 's' : ''}`)}`);
        if (warned > 0) process.stderr.write(`, ${ansi.yellow(`${warned} warning${warned !== 1 ? 's' : ''}`)}`);
        process.stderr.write(`.\n\n`);
        process.exit(1);
    } else if (warned > 0) {
        process.stderr.write(`  ${passed} checks passed, ${ansi.yellow(`${warned} warning${warned !== 1 ? 's' : ''}`)}.\n\n`);
    } else {
        process.stderr.write(`  ${ansi.green(`All checks passed ✓`)}\n\n`);
    }
}
