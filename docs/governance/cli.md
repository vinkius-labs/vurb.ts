---
title: "CLI Reference"
description: "The Vurb CLI — create, develop, deploy, and manage MCP servers from the command line."
---

# CLI Reference

- [Installation](#install)
- [Commands Overview](#commands)
- [vurb create](#create)
- [vurb dev](#dev)
- [vurb lock](#lock)
- [vurb deploy](#deploy)
- [vurb remote](#remote)
- [vurb token](#token)
- [vurb inspect](#inspect)
- [Exit Codes](#exit)
- [Progress Reporting](#progress)
- [Programmatic API](#programmatic)

The Vurb CLI manages the full lifecycle of an MCP server: scaffolding, development, governance, deployment, and runtime inspection.


## Installation {#install}

The CLI is included in `@vurb/core` and available via npx:

```bash
npx vurb --help
```

Or install globally:

```bash
npm install -g @vurb/core
vurb --help
```


## Commands Overview {#commands}

| Command | Description |
|---|---|
| `vurb create <name>` | Scaffold a new Vurb server |
| `vurb dev` | Start HMR dev server with auto-reload |
| `vurb lock` | Generate or verify a capability lockfile |
| `vurb deploy` | Bundle, compress & deploy to Vinkius Edge |
| `vurb remote` | Manage remote cloud configuration |
| `vurb token` | Manage deploy tokens |
| `vurb inspect` | Launch the real-time TUI dashboard |


## `vurb create` {#create}

Scaffold a new Vurb server with an interactive wizard or CLI flags.

```bash
vurb create my-server
vurb create my-server -y
vurb create my-server --vector prisma --transport sse
```

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--transport <stdio\|sse>` | — | `stdio` | Transport layer |
| `--vector <type>` | — | — | Ingestion vector: `vanilla`, `prisma`, `n8n`, `openapi`, `oauth` |
| `--testing` | — | `true` | Include `@vurb/testing` + Vitest |
| `--no-testing` | — | — | Skip test suite |
| `--yes` | `-y` | — | Skip prompts, use defaults |


## `vurb dev` {#dev}

Start the HMR development server with auto-reload on file changes.

```bash
vurb dev --server ./src/server.ts
vurb dev --server ./src/server.ts --dir ./src/tools
```

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | Auto-detect | Path to server entrypoint |
| `--dir <path>` | `-d` | Auto-detect | Directory to watch for changes |


## `vurb lock` {#lock}

Generate and verify capability lockfiles. The `lock` command captures the behavioral surface of your server. Use `--check` in CI to gate builds against unreviewed capability changes.

### Generating a Lockfile

```bash
vurb lock --server ./src/server.ts
```

```
  vurb lock — Generating vurb.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Computing behavioral digests (120ms)
  ● Writing vurb.lock (5ms)

✓ vurb.lock generated (8 tools, 3 prompts).
  Integrity: sha256:a1b2c3d4e5f6...
```

### Verifying in CI

```bash
vurb lock --check --server ./src/server.ts
```

`--check` compares the existing lockfile against the live server surface without writing. Exits with code 0 if up-to-date, code 1 if stale:

```
  vurb lock — Verifying vurb.lock

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

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | — | Path to server entrypoint. **Required.** |
| `--name <name>` | `-n` | Auto-detected | Server name for the lockfile header |
| `--cwd <dir>` | — | `process.cwd()` | Project root directory |
| `--check` | — | — | Verify mode — compare without writing |

### Registry Auto-Discovery

The CLI resolves a `ToolRegistry` from your server entrypoint. It tries three export patterns in order:

Named `registry` export:

```typescript
export const registry = new ToolRegistry();
export const serverName = 'payments-api';
```

Named `vurb` export (from `initVurb`):

```typescript
export const vurb = initVurb({
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

### CI/CD Integration {#ci}

#### GitHub Actions

```yaml
jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: vurb lock --check --server ./src/server.ts
```

#### GitLab CI

```yaml
governance:
  script:
    - npm ci
    - vurb lock --check --server ./src/server.ts
```

#### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit
vurb lock --check --server ./src/server.ts
```


## `vurb deploy` {#deploy}

Bundle your server into a self-contained Fat Bundle (IIFE), compress it, and deploy to Vinkius Edge.

```bash
vurb deploy
vurb deploy --server ./src/server.ts
```

### Prerequisites

Before deploying, configure the target server and deploy token:

```bash
# Quick setup (one-liner)
vurb remote --server-id <uuid> --token <token>

# Or configure separately
vurb remote --server-id <uuid>
vurb token <token>
```

### Token Resolution

The deploy command resolves the token from three sources, in priority order:

1. **`--token` flag** — highest priority, one-time override
2. **`VURB_DEPLOY_TOKEN` env var** — ideal for CI/CD pipelines
3. **`.vurbrc` file** — persisted via `vurb token` or `vurb remote --token`

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | Auto-detect | Path to server entrypoint |
| `--token <token>` | — | — | Override deploy token (one-time) |
| `--allow-insecure` | — | — | Suppress HTTP plaintext warning |

### Security

The CLI warns when a token is about to be sent over plaintext HTTP to a non-localhost endpoint. Use `--allow-insecure` to suppress this warning, or switch to HTTPS.

### Bundle Limits

The maximum bundle size is **500KB** (before compression). The Fat Bundle includes all dependencies (Zod, MCP SDK, Vurb), so most servers fit well within this limit.


## `vurb remote` {#remote}

Manage the cloud configuration stored in `.vurbrc`. This file is automatically added to `.gitignore`.

### Setting Configuration

```bash
# Set server ID (uses default Vinkius Cloud endpoint)
vurb remote --server-id 019d0250-7baf-7172-9732-096c8baa4478

# Set server ID + token at once (full one-liner setup)
vurb remote --server-id 019d0250-7baf-7172-9732-096c8baa4478 --token vk_live_9hfaJlIPOv5x

# Override API endpoint
vurb remote http://localhost:8080 --server-id abc-123-def
```

### Viewing Configuration

```bash
vurb remote
```

```
  Remote Configuration

  API:       https://cloud.vinkius.com
  Server:    019d0250-7baf-7172-9732-096c8baa4478
  Token:     configured
  Config:    /home/dev/my-server/.vurbrc
```

### Options

| Option | Default | Description |
|---|---|---|
| `<url>` (positional) | Vinkius Cloud | Override API endpoint |
| `--server-id <id>` | — | Target server UUID |
| `--token <token>` | — | Save deploy token to `.vurbrc` |


## `vurb token` {#token}

Manage deploy tokens stored in `.vurbrc`. Tokens are displayed in masked form for security (`vk_live_••••••••5tWc`).

### Setting a Token

```bash
vurb token vk_live_9hfaJlIPOv5xZhJEtjIYM0mcWBgo5tWcEePbwp96
```

```
  ✓ Token saved to .vurbrc (vk_live_••••••••wp96)
```

### Viewing Token Status

```bash
vurb token
```

```
  Token Configuration

  .vurbrc:   vk_live_••••••••wp96
  env:       not set
```

### Removing a Token

```bash
vurb token --clear
```

```
  ✓ Token removed from .vurbrc
```

### Options

| Option | Description |
|---|---|
| `<token>` (positional) | Token value to save |
| `--clear` | Remove the token from `.vurbrc` |

### Security Notes

- The `.vurbrc` file is automatically added to `.gitignore` to prevent accidental exposure.
- Tokens are **never** displayed in full — only a masked preview is shown.
- For CI/CD, prefer the `VURB_DEPLOY_TOKEN` environment variable instead of persisting tokens locally.


## `vurb inspect` {#inspect}

Launch the real-time TUI (Terminal User Interface) dashboard for monitoring your MCP server.

```bash
vurb inspect
vurb insp --demo
vurb insp --pid 12345
```

::: tip
Requires the optional `@vurb/inspector` package:
```bash
npm install @vurb/inspector
```
:::

### Aliases

`vurb inspect`, `vurb insp`, `vurb debug`, `vurb dbg` are all equivalent.

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--demo` | `-d` | — | Launch with built-in simulator (no server needed) |
| `--out <mode>` | `-o` | `tui` | Output: `tui` (default), `stderr` (headless ECS/K8s) |
| `--pid <pid>` | `-p` | — | Connect to a specific server PID |
| `--path <path>` | — | — | Custom IPC socket/pipe path |


## Exit Codes {#exit}

| Code | Meaning |
|---|---|
| `0` | Command completed successfully |
| `1` | Error — lockfile stale, missing config, server not found, etc. |


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
  commandToken,
  resolveRegistry,
  ProgressTracker,
  createDefaultReporter,
} from '@vurb/core/cli';
```

See [Capability Lockfile](/governance/capability-lockfile) for the full programmatic lockfile API (`generateLockfile`, `readLockfile`, `checkLockfile`, `writeLockfile`).
