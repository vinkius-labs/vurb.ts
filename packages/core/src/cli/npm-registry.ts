/**
 * Shared npm-registry utilities — fetch latest versions, scan installed packages.
 *
 * Used by `vurb version`, `vurb update`, and `vurb doctor`.
 * @module
 */
import { resolve, join } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// ─── Constants ───────────────────────────────────────────────────

/** Scope prefix for Vurb packages. */
export const VURB_SCOPE = '@vurb';

/** npm registry URL for fetching latest versions. */
const NPM_REGISTRY = 'https://registry.npmjs.org';

// ─── Types ───────────────────────────────────────────────────────

export interface PackageVersion {
    name: string;
    current: string;
    latest?: string | undefined;
}

// ─── Local Scanning ──────────────────────────────────────────────

/**
 * Read `@vurb/*` dependencies from the project's `package.json`.
 *
 * Returns a deduplicated list of package names found across
 * `dependencies`, `devDependencies`, and `peerDependencies`.
 */
export function scanDeclaredVurbPackages(cwd: string): string[] {
    const pkgPath = resolve(cwd, 'package.json');
    if (!existsSync(pkgPath)) return [];
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const names = new Set<string>();
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
            const deps: Record<string, string> | undefined = pkg[section];
            if (!deps) continue;
            for (const name of Object.keys(deps)) {
                if (name.startsWith(`${VURB_SCOPE}/`)) names.add(name);
            }
        }
        return [...names].sort();
    } catch { return []; }
}

/**
 * Read the installed version from `node_modules/<pkg>/package.json`.
 * Returns `undefined` if the package is not installed.
 */
export function getInstalledVersion(cwd: string, pkgName: string): string | undefined {
    const pkgJsonPath = join(cwd, 'node_modules', ...pkgName.split('/'), 'package.json');
    try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        return pkg.version as string;
    } catch { return undefined; }
}

/**
 * Scan `node_modules/@vurb/` to discover all installed Vurb packages.
 *
 * Combines packages declared in `package.json` with those physically
 * present in `node_modules` for a complete view.
 */
export function scanInstalledVurbPackages(cwd: string): PackageVersion[] {
    const declared = scanDeclaredVurbPackages(cwd);
    const found = new Set<string>(declared);

    // Also discover transitive installs not in package.json
    const scopeDir = join(cwd, 'node_modules', VURB_SCOPE);
    try {
        for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
            if (entry.isDirectory()) found.add(`${VURB_SCOPE}/${entry.name}`);
        }
    } catch { /* no @vurb scope installed */ }

    const results: PackageVersion[] = [];
    for (const name of [...found].sort()) {
        const current = getInstalledVersion(cwd, name);
        if (current) results.push({ name, current });
    }
    return results;
}

// ─── npm Registry ────────────────────────────────────────────────

/**
 * Fetch the latest published version of a package from npm.
 *
 * Uses the abbreviated metadata endpoint for speed (~100ms per call).
 * Returns `undefined` on network/parse failure.
 */
export async function fetchLatestVersion(pkgName: string): Promise<string | undefined> {
    try {
        const url = `${NPM_REGISTRY}/${pkgName}/latest`;
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return undefined;
        const data = await res.json() as { version?: string };
        return data.version;
    } catch { return undefined; }
}

/**
 * Enrich a list of installed packages with their latest npm versions.
 *
 * All fetches run in parallel for speed.
 */
export async function enrichWithLatest(packages: PackageVersion[]): Promise<PackageVersion[]> {
    const results = await Promise.all(
        packages.map(async (pkg): Promise<PackageVersion> => {
            const latest = await fetchLatestVersion(pkg.name);
            return { name: pkg.name, current: pkg.current, latest };
        }),
    );
    return results;
}
