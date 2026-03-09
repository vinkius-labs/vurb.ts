---
title: "CLI Reference"
description: "The Vurb.ts CLI — generate, verify, and manage capability lockfiles from the command line."
---

# CLI Reference

- [Installation](#install)
- [Generating a Lockfile](#generate)
- [Verifying in CI](#check)
- [Options](#options)
- [Registry Auto-Discovery](#discovery)
- [CI/CD Integration](#ci)
- [Exit Codes](#exit)
- [Progress Reporting](#progress)
- [Programmatic API](#programmatic)

The `Vurb.ts` CLI generates and verifies capability lockfiles from the command line. Two commands cover the entire workflow: `Vurb.ts lock` captures the behavioral surface, `Vurb.ts lock --check` gates the CI build.


## Installation {#install}

The CLI is included in `Vurb.ts` and available via npx:

```bash
npx @vurb/core lock --server ./src/server.ts
```

Or install globally:

```bash
npm install -g Vurb.ts
Vurb.ts lock --server ./src/server.ts
```


## Generating a Lockfile {#generate}

```bash
Vurb.ts lock --server ./src/server.ts
```

```
  Vurb.ts lock — Generating vurb.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Computing behavioral digests (120ms)
  ● Writing vurb.lock (5ms)

✓ vurb.lock generated (8 tools, 3 prompts).
  Integrity: sha256:a1b2c3d4e5f6...
```

The CLI imports your server entrypoint, resolves the `ToolRegistry`, compiles contracts from all registered builders, computes behavioral digests, and writes a deterministic, git-diffable lockfile.


## Verifying in CI {#check}

```bash
Vurb.ts lock --check --server ./src/server.ts
```

`--check` compares the existing lockfile against the live server surface without writing. Exits with code 0 if up-to-date, code 1 if stale:

```
  Vurb.ts lock — Verifying vurb.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Reading existing lockfile (3ms)
  ✗ Verifying integrity — stale (1ms)

✗ Lockfile is out of date.
  + Tools added: webhooks
  ~ Tools changed: invoices
  - Prompts removed: legacy-greeting
```

This is the command you put in your CI pipeline. When it fails, someone changed the behavioral surface without running `Vurb.ts lock`.


## Options {#options}

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | — | Path to server entrypoint. **Required.** |
| `--name <name>` | `-n` | Auto-detected | Server name for the lockfile header |
| `--cwd <dir>` | — | `process.cwd()` | Project root directory |
| `--check` | — | — | Verify mode — compare without writing |
| `--help` | `-h` | — | Show help message |


## Registry Auto-Discovery {#discovery}

The CLI needs to resolve a `ToolRegistry` from your server entrypoint. It tries three export patterns in order:

Named `registry` export:

```typescript
export const registry = new ToolRegistry();
export const serverName = 'payments-api';
```

Named `Vurb.ts` export (from `initVurb`):

```typescript
export const Vurb.ts = initVurb({
  name: 'payments-api',
  registry,
});
```

Default export:

```typescript
export default { registry, serverName: 'payments-api' };
```

If none of these patterns match, the CLI exits with a descriptive error explaining the expected export shapes.

The CLI also discovers prompt registries for inclusion in the lockfile. It looks for `promptRegistry`, `prompts`, or `promptsRegistry` exports in the same entrypoint.


## CI/CD Integration {#ci}

### GitHub Actions

```yaml
jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx @vurb/core lock --check --server ./src/server.ts
```

### GitLab CI

```yaml
governance:
  script:
    - npm ci
    - npx @vurb/core lock --check --server ./src/server.ts
```

### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit
npx @vurb/core lock --check --server ./src/server.ts
```


## Exit Codes {#exit}

| Code | Meaning |
|---|---|
| `0` | Lockfile generated or verification passed |
| `1` | Lockfile is stale, missing, or server could not be resolved |


## Progress Reporting {#progress}

The CLI outputs Composer/Yarn-style progress indicators to `stderr`:

| Icon | Status |
|---|---|
| `○` | Step queued |
| `◐` | Step in progress |
| `●` | Step completed |
| `✗` | Step failed |

Each step shows elapsed duration in milliseconds. Output goes to `stderr` so it doesn't interfere with piped `stdout`.


## Programmatic API {#programmatic}

The CLI logic is also available as importable functions:

```typescript
import {
  parseArgs,
  commandLock,
  resolveRegistry,
  ProgressTracker,
  createDefaultReporter,
} from 'Vurb.ts/cli';
```

See [Capability Lockfile](/governance/capability-lockfile) for the full programmatic lockfile API (`generateLockfile`, `readLockfile`, `checkLockfile`, `writeLockfile`).
