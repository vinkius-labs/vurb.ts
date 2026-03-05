/**
 * .fusionrc management — local cloud config, .env loading.
 * @module
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { RemoteConfig } from './types.js';
import { ansi } from './constants.js';

// ─── Constants ───────────────────────────────────────────────────

export const FUSIONRC = '.fusionrc';

// ─── Environment ─────────────────────────────────────────────────

/** Load .env file from cwd into process.env (won't overwrite existing). */
export function loadEnv(cwd: string): void {
    try {
        const content = readFileSync(resolve(cwd, '.env'), 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) process.env[key] = val;
        }
    } catch { /* No .env file — env vars may be set directly (CI/CD) */ }
}

// ─── .gitignore ──────────────────────────────────────────────────

/** Ensure .fusionrc is listed in .gitignore. */
export function ensureGitignore(cwd: string): void {
    const gitignorePath = resolve(cwd, '.gitignore');
    try {
        const content = existsSync(gitignorePath)
            ? readFileSync(gitignorePath, 'utf-8')
            : '';
        if (!content.split('\n').some(l => l.trim() === FUSIONRC)) {
            const nl = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
            writeFileSync(gitignorePath, `${content}${nl}${FUSIONRC}\n`);
            process.stderr.write(`  ${ansi.yellow('⚠')} Added ${FUSIONRC} to .gitignore\n`);
        }
    } catch { /* No git project — skip silently */ }
}

// ─── Read / Write ────────────────────────────────────────────────

/** Read .fusionrc from project root. */
export function readFusionRc(cwd: string): Partial<RemoteConfig> {
    const rcPath = resolve(cwd, FUSIONRC);
    if (!existsSync(rcPath)) return {};
    try {
        return JSON.parse(readFileSync(rcPath, 'utf-8'));
    } catch {
        return {};
    }
}

/** Write .fusionrc and ensure .gitignore coverage. */
export function writeFusionRc(cwd: string, config: Partial<RemoteConfig>): void {
    const existing = readFusionRc(cwd);
    const merged = { ...existing, ...config };
    writeFileSync(resolve(cwd, FUSIONRC), JSON.stringify(merged, null, 2) + '\n');
    ensureGitignore(cwd);
}
