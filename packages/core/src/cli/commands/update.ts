/**
 * `vurb update` — update all @vurb/* packages to the latest version.
 * @module
 */
import type { CliArgs } from '../args.js';
import { ansi } from '../constants.js';
import {
    scanDeclaredVurbPackages,
    getInstalledVersion,
    fetchLatestVersion,
} from '../npm-registry.js';

// ─── Types ───────────────────────────────────────────────────────

interface UpdateEntry {
    name: string;
    current: string;
    latest: string;
    needsUpdate: boolean;
}

// ─── Command ─────────────────────────────────────────────────────

export async function commandUpdate(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    process.stderr.write(`\n  ${ansi.bold('Vurb Update')}\n\n`);

    // 1. Scan declared @vurb/* packages
    const declared = scanDeclaredVurbPackages(cwd);
    if (declared.length === 0) {
        process.stderr.write(`  ${ansi.yellow('⚠')} No @vurb/* packages found in package.json\n\n`);
        return;
    }

    // 2. Fetch latest + current for each
    process.stderr.write(`  ${ansi.dim('Checking')} ${declared.length} package${declared.length !== 1 ? 's' : ''}${ansi.dim('...')}\n\n`);

    const entries: UpdateEntry[] = await Promise.all(
        declared.map(async (name) => {
            const current = getInstalledVersion(cwd, name) ?? '0.0.0';
            const latest = await fetchLatestVersion(name) ?? current;
            return { name, current, latest, needsUpdate: current !== latest };
        }),
    );

    // 3. Display table
    const maxName = Math.max(...entries.map(e => e.name.length));
    for (const entry of entries) {
        const padded = entry.name.padEnd(maxName + 2);
        if (entry.needsUpdate) {
            process.stderr.write(
                `  ${padded} ${ansi.dim(entry.current)}  ${ansi.yellow('→')}  ${ansi.green(entry.latest)}  ${ansi.yellow('↑ update')}\n`,
            );
        } else {
            process.stderr.write(
                `  ${padded} ${entry.current}  ${ansi.green('✓ latest')}\n`,
            );
        }
    }

    // 4. Install updates
    const toUpdate = entries.filter(e => e.needsUpdate);
    if (toUpdate.length === 0) {
        process.stderr.write(`\n  ${ansi.green('✓')} All packages up to date.\n\n`);
        return;
    }

    process.stderr.write(`\n  ${ansi.dim('Installing updates...')}\n`);

    const installArgs = toUpdate.map(e => `${e.name}@${e.latest}`);
    const { execSync } = await import('node:child_process');
    const npmFlags = '--prefer-online --no-fund --no-audit';

    // Try batch install with one automatic retry
    let batchOk = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            execSync(`npm install ${npmFlags} ${installArgs.join(' ')}`, {
                cwd,
                stdio: 'pipe',
                timeout: 120_000,
            });
            batchOk = true;
            break;
        } catch {
            if (attempt === 1) {
                process.stderr.write(`  ${ansi.dim('Retrying...')}\n`);
            }
        }
    }

    if (batchOk) {
        process.stderr.write(`\n  ${ansi.green('✓')} ${toUpdate.length} package${toUpdate.length !== 1 ? 's' : ''} updated.\n\n`);
        return;
    }

    // Batch failed twice — fall back to one-by-one install
    process.stderr.write(`  ${ansi.dim('Batch install failed. Installing individually...')}\n`);
    let succeeded = 0;
    let failed = 0;
    for (const entry of toUpdate) {
        const spec = `${entry.name}@${entry.latest}`;
        try {
            execSync(`npm install ${npmFlags} ${spec}`, {
                cwd,
                stdio: 'pipe',
                timeout: 60_000,
            });
            succeeded++;
        } catch {
            process.stderr.write(`  ${ansi.red('✗')} Failed to install ${spec}\n`);
            failed++;
        }
    }

    if (failed === 0) {
        process.stderr.write(`\n  ${ansi.green('✓')} ${succeeded} package${succeeded !== 1 ? 's' : ''} updated.\n\n`);
    } else if (succeeded > 0) {
        process.stderr.write(`\n  ${ansi.yellow('⚠')} ${succeeded} updated, ${failed} failed.\n\n`);
        process.exit(1);
    } else {
        process.stderr.write(`\n  ${ansi.red('✗')} All ${failed} packages failed to install.\n\n`);
        process.exit(1);
    }
}
