/**
 * `vurb lock` — generate or verify capability lockfile.
 * @module
 */
import { compileContracts } from '../../introspection/ToolContract.js';
import {
    generateLockfile,
    writeLockfile,
    readLockfile,
    checkLockfile,
    LOCKFILE_NAME,
    type PromptBuilderLike,
} from '../../introspection/CapabilityLockfile.js';
import type { CliArgs } from '../args.js';
import type { ProgressReporter } from '../progress.js';
import { ProgressTracker } from '../progress.js';
import { VURB_VERSION } from '../constants.js';
import { resolveRegistry } from '../registry.js';
import { inferServerEntry } from '../utils.js';

/** @internal exported for testing */
export async function commandLock(args: CliArgs, reporter?: ProgressReporter): Promise<void> {
    const progress = new ProgressTracker(reporter);

    if (!args.server) {
        const detected = inferServerEntry(args.cwd);
        if (!detected) {
            console.error('Error: Could not auto-detect server entrypoint.\n');
            console.error('Usage: vurb lock --server ./src/server.ts');
            process.exit(1);
        }
        args.server = detected;
    }

    // Step 1: Resolve & load
    progress.start('resolve', 'Resolving server entrypoint');
    const { registry, name: serverName, promptRegistry } = await resolveRegistry(args.server);
    const displayName = args.name ?? serverName;
    progress.done('resolve', `Resolving (${displayName})`);

    // Step 2: Compile tool contracts
    progress.start('compile', 'Compiling tool contracts');
    const builders = [...registry.getBuilders()];
    const contracts = await compileContracts(builders);
    const toolCount = Object.keys(contracts).length;
    progress.done('compile', 'Compiling tool contracts', `${toolCount} tool${toolCount !== 1 ? 's' : ''}`);

    // Step 3: Discover prompts
    progress.start('prompts', 'Discovering prompts');
    const promptBuilders: PromptBuilderLike[] = [];
    if (promptRegistry && typeof promptRegistry.getBuilders === 'function') {
        promptBuilders.push(...promptRegistry.getBuilders());
    }
    const options = promptBuilders.length > 0 ? { prompts: promptBuilders } : undefined;
    const promptCount = promptBuilders.length;
    progress.done('prompts', 'Discovering prompts', `${promptCount} prompt${promptCount !== 1 ? 's' : ''}`);

    if (args.check) {
        // ── Check Mode ──
        progress.start('read', 'Reading existing lockfile');
        const existing = await readLockfile(args.cwd);
        if (!existing) {
            progress.fail('read', 'Reading existing lockfile', `${LOCKFILE_NAME} not found — run: vurb lock`);
            process.exit(1);
        }
        progress.done('read', 'Reading existing lockfile');

        progress.start('verify', 'Verifying integrity');
        const result = await checkLockfile(existing, contracts);
        if (result.ok) {
            progress.done('verify', 'Verifying integrity', 'up to date');
            console.log(`\n✓ ${LOCKFILE_NAME} is up to date.`);
            process.exit(0);
        } else {
            progress.fail('verify', 'Verifying integrity', 'stale');
            console.error(`\n✗ ${result.message}`);
            if (result.added.length > 0) console.error(`  + Tools added: ${result.added.join(', ')}`);
            if (result.removed.length > 0) console.error(`  - Tools removed: ${result.removed.join(', ')}`);
            if (result.changed.length > 0) console.error(`  ~ Tools changed: ${result.changed.join(', ')}`);
            if (result.addedPrompts.length > 0) console.error(`  + Prompts added: ${result.addedPrompts.join(', ')}`);
            if (result.removedPrompts.length > 0) console.error(`  - Prompts removed: ${result.removedPrompts.join(', ')}`);
            if (result.changedPrompts.length > 0) console.error(`  ~ Prompts changed: ${result.changedPrompts.join(', ')}`);
            process.exit(1);
        }
    } else {
        // ── Generate Mode ──
        progress.start('generate', 'Computing behavioral digests');
        const lockfile = await generateLockfile(displayName, contracts, VURB_VERSION, options);
        progress.done('generate', 'Computing behavioral digests');

        progress.start('write', `Writing ${LOCKFILE_NAME}`);
        await writeLockfile(lockfile, args.cwd);
        progress.done('write', `Writing ${LOCKFILE_NAME}`);

        const tc = Object.keys(lockfile.capabilities.tools).length;
        const pc = lockfile.capabilities.prompts ? Object.keys(lockfile.capabilities.prompts).length : 0;
        const parts = [`${tc} tool${tc !== 1 ? 's' : ''}`];
        if (pc > 0) parts.push(`${pc} prompt${pc !== 1 ? 's' : ''}`);
        console.log(`\n✓ ${LOCKFILE_NAME} generated (${parts.join(', ')}).`);
        console.log(`  Integrity: ${lockfile.integrityDigest}`);
    }
}
