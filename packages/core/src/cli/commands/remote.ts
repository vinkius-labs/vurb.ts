/**
 * `vurb remote` — manage .vurbrc cloud configuration.
 * @module
 */
import { resolve } from 'node:path';
import type { CliArgs } from '../args.js';
import { ansi, VINKIUS_CLOUD_URL } from '../constants.js';
import { VURBRC, readVurbRc, writeVurbRc } from '../rc.js';

export async function commandRemote(args: CliArgs): Promise<void> {
    const cwd = args.cwd;

    // vurb remote <url> [--server-id <id>] [--token <tok>] — set one or more at once
    // vurb remote --server-id <id>        — uses default Vinkius Cloud URL
    if (args.remoteUrl || args.serverId || args.token) {
        const remote = args.remoteUrl ?? VINKIUS_CLOUD_URL;

        writeVurbRc(cwd, {
            remote,
            ...(args.serverId ? { serverId: args.serverId } : {}),
            ...(args.token ? { token: args.token } : {}),
        });

        process.stderr.write(`  ${ansi.green('✓')} Remote set to ${ansi.cyan(remote)}${remote === VINKIUS_CLOUD_URL ? ansi.dim(' (default)') : ''}\n`);
        if (args.serverId) {
            process.stderr.write(`  ${ansi.green('✓')} Server ID set to ${ansi.cyan(args.serverId)}\n`);
        }
        if (args.token) {
            process.stderr.write(`  ${ansi.green('✓')} Token saved to .vurbrc\n`);
        }
        return;
    }

    // vurb remote — print current config
    const config = readVurbRc(cwd);
    if (!config.remote && !config.serverId) {
        process.stderr.write(`  ${ansi.yellow('⚠')} No remote configured.\n\n`);
        process.stderr.write(`  ${ansi.dim('Quick setup:')}\n`);
        process.stderr.write(`    ${ansi.cyan('$')} vurb remote --server-id <uuid>\n\n`);
        return;
    }

    process.stderr.write(`\n  ${ansi.bold('Remote Configuration')}\n\n`);
    process.stderr.write(`  ${ansi.dim('API:')}       ${config.remote ?? ansi.yellow('not set')}\n`);
    process.stderr.write(`  ${ansi.dim('Server:')}    ${config.serverId ?? ansi.yellow('not set')}\n`);
    process.stderr.write(`  ${ansi.dim('Token:')}     ${config.token ? ansi.green('configured') : ansi.yellow('not set')}\n`);
    process.stderr.write(`  ${ansi.dim('Config:')}    ${resolve(cwd, VURBRC)}\n\n`);
}
