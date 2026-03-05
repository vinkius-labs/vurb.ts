/**
 * `fusion deploy` — bundle, compress & upload to Edge.
 *
 * Produces a Fat Bundle (IIFE, platform: browser) that is fully
 * self-contained for execution in a V8 Isolate. All dependencies
 * (zod, mcp-fusion, MCP SDK) are bundled inside. Node.js built-in
 * modules are aliased to edge-stub.ts (AST-compatible stubs).
 *
 * @module
 */
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import type { CliArgs } from '../args.js';
import { ProgressTracker } from '../progress.js';
import { ansi, VINKIUS_CLOUD_URL } from '../constants.js';
import { inferServerEntry } from '../utils.js';
import { loadEnv, readFusionRc } from '../rc.js';

// ── Edge Stub Aliases ────────────────────────────────────────────────────────
// Maps node:* to edge-stub.ts (internal, NOT in package.json exports).
// These stubs satisfy esbuild AST so the MCP SDK compiles without errors.
// The stubs are NEVER called at runtime — startServer() intercepts before
// any transport is created.
function edgeStubAliases(): Record<string, string> {
    const require = createRequire(import.meta.url);
    const pkgDir = dirname(require.resolve('@vinkius-core/mcp-fusion'));
    const stubPath = resolve(pkgDir, 'edge-stub.js');
    const stubs: Record<string, string> = {};
    for (const mod of [
        'child_process', 'fs', 'net', 'events', 'stream',
        'http', 'https', 'tls', 'os', 'path', 'url', 'crypto', 'buffer',
    ]) {
        stubs[`node:${mod}`] = stubPath;
        stubs[mod] = stubPath; // bare specifiers used by some libs
    }
    return stubs;
}

export async function commandDeploy(args: CliArgs): Promise<void> {
    const progress = new ProgressTracker();
    const cwd = args.cwd;
    const deployStart = Date.now();

    // ── Step 1: read-config ──
    progress.start('read-config', 'Reading configuration');
    loadEnv(cwd);

    const rc = readFusionRc(cwd);
    const remote = rc.remote ?? VINKIUS_CLOUD_URL;
    const serverId = rc.serverId;
    const token = args.token ?? process.env['FUSION_DEPLOY_TOKEN'];

    if (!serverId) {
        progress.fail('read-config', 'Reading configuration', 'run: fusion remote --server-id <uuid>');
        process.exit(1);
    }
    if (!token) {
        progress.fail('read-config', 'Reading configuration', 'set FUSION_DEPLOY_TOKEN=<connection-token> in .env');
        process.exit(1);
    }
    progress.done('read-config', 'Reading configuration');

    // ── Step 2: resolve entrypoint ──
    progress.start('resolve', 'Resolving entrypoint');
    const entrypoint = args.server ?? inferServerEntry(cwd);
    if (!entrypoint) {
        progress.fail('resolve', 'Resolving entrypoint', 'use --server <path>');
        process.exit(1);
    }
    const absEntry = resolve(cwd, entrypoint);
    if (!existsSync(absEntry)) {
        progress.fail('resolve', 'Resolving entrypoint', `file not found: ${absEntry}`);
        process.exit(1);
    }
    progress.done('resolve', `Resolving entrypoint (${entrypoint})`);

    // ── Step 3: bundle (esbuild) ──
    progress.start('bundle', 'Bundling with esbuild');
    let esbuild: typeof import('esbuild');
    try {
        esbuild = await import('esbuild');
    } catch {
        // Auto-install esbuild — zero friction
        progress.done('bundle', 'Bundling with esbuild');
        progress.start('bundle', 'Installing esbuild');
        try {
            const { execSync } = await import('node:child_process');
            execSync('npm install -D esbuild', { cwd, stdio: 'ignore' });
            esbuild = await import('esbuild');
        } catch {
            progress.fail('bundle', 'Installing esbuild', 'failed to install — run: npm install -D esbuild');
            process.exit(1);
        }
        progress.done('bundle', 'Installing esbuild');
        progress.start('bundle', 'Bundling with esbuild');
    }

    let buildResult: Awaited<ReturnType<typeof esbuild.build>>;
    try {
        buildResult = await esbuild.build({
            entryPoints: [absEntry],
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: 'es2022',
            treeShaking: true,
            minify: true,
            write: false,
            logLevel: 'silent',
            external: [],
            alias: edgeStubAliases(),
        });
    } catch (err: unknown) {
        const buildErr = err as { errors?: Array<{ text: string; location?: { file: string; line: number; column: number } }> };
        if (buildErr.errors?.length) {
            const first = buildErr.errors[0]!;
            const loc = first.location
                ? ` (${first.location.file}:${first.location.line}:${first.location.column})`
                : '';
            progress.fail('bundle', 'Bundling', `${first.text}${loc}`);
            for (const e of buildErr.errors.slice(1, 4)) {
                const eLoc = e.location ? ` (${e.location.file}:${e.location.line})` : '';
                process.stderr.write(`  error: ${e.text}${eLoc}\n`);
            }
            if (buildErr.errors.length > 4) {
                process.stderr.write(`  ${ansi.dim(`... and ${buildErr.errors.length - 4} more errors`)}\n`);
            }
        } else {
            progress.fail('bundle', 'Bundling', String(err));
        }
        process.exit(1);
    }

    const outFile = buildResult.outputFiles?.[0];
    if (!outFile) {
        progress.fail('bundle', 'Bundling', 'esbuild produced no output');
        process.exit(1);
    }
    const rawCode = new TextDecoder().decode(outFile.contents);
    progress.done('bundle', 'Bundling with esbuild');

    // ── Step 4: size-check ──
    const rawSizeBytes = Buffer.byteLength(rawCode, 'utf-8');
    const MAX_BUNDLE_SIZE = 512_000; // 500KB (fat bundle includes all deps)
    if (rawSizeBytes > MAX_BUNDLE_SIZE) {
        const sizeKB = (rawSizeBytes / 1024).toFixed(1);
        process.stderr.write(
            `\nfatal: bundle too large: ${sizeKB}KB (max 500KB)\n` +
            `hint: remove unused imports — the fat bundle includes all dependencies\n\n`,
        );
        process.exit(1);
    }

    // ── Step 5: hash + compress ──
    progress.start('compress', 'Compressing');
    const hash = createHash('sha256').update(rawCode).digest('hex');
    const compressed = gzipSync(Buffer.from(rawCode, 'utf-8'));
    const payload = compressed.toString('base64');
    const compressedKB = (compressed.length / 1024).toFixed(1);
    const rawKB = (rawSizeBytes / 1024).toFixed(1);
    const ratio = rawSizeBytes > 0
        ? Math.round((1 - compressed.length / rawSizeBytes) * 100)
        : 0;
    progress.done('compress', `Compressing (${rawKB}KB -> ${compressedKB}KB gzip, ${ratio}% smaller)`);

    // ── Step 6: upload ──
    progress.start('upload', 'Deploying to Edge');
    const url = `${remote.replace(/\/+$/, '')}/servers/${serverId}/deploy`;

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                bundle: payload,
                hash,
                raw_size: rawSizeBytes,
            }),
        });
    } catch (netErr: unknown) {
        const msg = netErr instanceof Error ? netErr.message : String(netErr);
        if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
            progress.fail('upload', 'Deploying to Edge', 'DNS resolution failed — check your remote URL');
        } else if (msg.includes('ECONNREFUSED')) {
            progress.fail('upload', 'Deploying to Edge', 'connection refused — is the API running?');
        } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
            progress.fail('upload', 'Deploying to Edge', 'request timed out — check your network');
        } else {
            progress.fail('upload', 'Deploying to Edge', `network error: ${msg}`);
        }
        process.exit(1);
    }

    if (!res.ok) {
        const errBody = await res.text();
        let message = `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(errBody);
            message = parsed.message ?? message;
        } catch { /* use status code */ }

        if (res.status === 401) {
            message = 'connection token revoked or invalid — check your dashboard';
        } else if (res.status === 403) {
            message = 'connection token does not belong to this server';
        } else if (res.status === 404) {
            message = 'server not found — check your server ID';
        } else if (res.status === 422 && message.startsWith('HTTP')) {
            message = 'invalid payload — check your entrypoint';
        }

        progress.fail('upload', 'Deploying to Edge', message);
        process.exit(1);
    }

    const data = await res.json() as {
        status: string;
        deployment_id: string;
        server_id: string;
        server_name: string;
        url: string;
        message: string;
    };

    progress.done('upload', 'Deploying to Edge');

    // ── Step 7: done ──
    const elapsed = ((Date.now() - deployStart) / 1000).toFixed(1);

    process.stderr.write('\n');
    if (data.status === 'restored') {
        process.stderr.write(`  ${ansi.bold(data.server_name)} — unchanged (rollback match)\n`);
    } else {
        process.stderr.write(`  ${ansi.bold(data.server_name)} — deployed to edge\n`);
    }
    process.stderr.write(`  ${ansi.dim('id:')}      ${data.deployment_id}\n`);
    process.stderr.write(`  ${ansi.dim('entry:')}   ${entrypoint}\n`);
    process.stderr.write(`  ${ansi.dim('size:')}    ${rawKB}KB -> ${compressedKB}KB gzip (${ratio}% smaller)\n`);
    process.stderr.write(`  ${ansi.dim('url:')}     ${ansi.cyan(data.url)}\n`);
    process.stderr.write(`  ${ansi.dim('time:')}    ${elapsed}s\n`);
    process.stderr.write(`\n  ${ansi.dim('MCP Fusion')} ${ansi.dim('->')} ${ansi.cyan('Vinkius Edge')}\n\n`);
}
