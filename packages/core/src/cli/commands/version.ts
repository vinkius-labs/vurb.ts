/**
 * `vurb version` — display CLI version and installed @vurb/* packages.
 * @module
 */
import type { CliArgs } from '../args.js';
import { ansi, VURB_VERSION } from '../constants.js';
import { scanInstalledVurbPackages } from '../npm-registry.js';

export async function commandVersion(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    // ── Runtime info ──
    const nodeVersion = process.version;

    process.stderr.write('\n');
    process.stderr.write(`  ${ansi.bold('Vurb CLI')}         ${ansi.cyan(VURB_VERSION)}\n`);
    process.stderr.write(`  ${ansi.bold('Node.js')}          ${nodeVersion}\n`);
    process.stderr.write(`  ${ansi.bold('OS')}               ${process.platform}-${process.arch}\n`);

    // ── Installed packages ──
    const packages = scanInstalledVurbPackages(cwd);

    if (packages.length > 0) {
        process.stderr.write(`\n  ${ansi.dim('Installed Packages:')}\n`);
        const maxName = Math.max(...packages.map(p => p.name.length));
        for (const pkg of packages) {
            const padded = pkg.name.padEnd(maxName + 2);
            process.stderr.write(`  ${ansi.dim(padded)} ${pkg.current}\n`);
        }
    }

    process.stderr.write('\n');
}
