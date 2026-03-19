---
title: "CLI Reference"
description: "The Vurb CLI — create, develop, deploy, and manage MCP servers from the command line."
---

# CLI Reference

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">FULL LIFECYCLE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Scaffold. Develop. Deploy.<br><span style="color:rgba(255,255,255,0.25)">One CLI, zero friction.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The Vurb CLI manages the full lifecycle of an MCP server: scaffolding, HMR development, governance lockfiles, deployment, and runtime inspection.</div>
</div>

## Installation {#install}

```bash
npx vurb --help
```

Or install globally:

```bash
npm install -g @vurb/core
vurb --help
```

---

## Commands Overview {#commands}

<!-- Feature grid: commands -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(52,211,153,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb create</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Scaffold a new Vurb server with interactive wizard or CLI flags.</div>
</div>

<div style="border:1px solid rgba(34,211,238,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(34,211,238,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb dev</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">HMR dev server with auto-reload on file changes.</div>
</div>

<div style="border:1px solid rgba(245,158,11,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(245,158,11,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb lock</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Generate or verify a capability lockfile for CI governance.</div>
</div>

<div style="border:1px solid rgba(192,132,252,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(192,132,252,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb deploy</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Bundle, compress & deploy to Vinkius Edge. Under 40 seconds.</div>
</div>

<div style="border:1px solid rgba(129,140,248,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(129,140,248,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb remote</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Manage remote cloud configuration stored in <code style="font-size:10px">.vurbrc</code>.</div>
</div>

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(239,68,68,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">vurb inspect</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Real-time TUI dashboard for monitoring your MCP server.</div>
</div>

</div>

---

## `vurb create` {#create}

Scaffold a new Vurb server:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:20px">

```bash
vurb create my-server
vurb create my-server -y
vurb create my-server --vector prisma --transport sse
```

</div>
</div>

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--transport <stdio\|sse>` | — | `stdio` | Transport layer |
| `--vector <type>` | — | — | Ingestion vector: `vanilla`, `prisma`, `n8n`, `openapi`, `oauth` |
| `--testing` | — | `true` | Include `@vurb/testing` + Vitest |
| `--no-testing` | — | — | Skip test suite |
| `--yes` | `-y` | — | Skip prompts, use defaults |

> [!TIP]
> `vurb create` auto-injects **SKILL.md** into your IDE's rule files — `.cursorrules`, `.windsurfrules`, `.clinerules`. Your AI agent becomes a framework expert on first scaffold.

---

## `vurb dev` {#dev}

HMR development server with auto-reload:

```bash
vurb dev --server ./src/server.ts
vurb dev --server ./src/server.ts --dir ./src/tools
```

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | Auto-detect | Path to server entrypoint |
| `--dir <path>` | `-d` | Auto-detect | Directory to watch for changes |

---

## `vurb lock` {#lock}

Generate and verify capability lockfiles. The `lock` command captures the behavioral surface of your server. Use `--check` in CI to gate builds against unreviewed capability changes.

### Generating a Lockfile

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:20px">

```bash
vurb lock --server ./src/server.ts
```

```text
  vurb lock — Generating vurb.lock

  ● Resolving server entrypoint — payments-api (12ms)
  ● Compiling tool contracts — 8 tools (45ms)
  ● Discovering prompts — 3 prompts (2ms)
  ● Computing behavioral digests (120ms)
  ● Writing vurb.lock (5ms)

✓ vurb.lock generated (8 tools, 3 prompts).
  Integrity: sha256:a1b2c3d4e5f6...
```

</div>
</div>

### Verifying in CI

```bash
vurb lock --check --server ./src/server.ts
```

`--check` compares the existing lockfile against the live server surface without writing. Exits `0` if up-to-date, `1` if stale.

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | — | Path to server entrypoint. **Required.** |
| `--name <name>` | `-n` | Auto-detected | Server name for lockfile header |
| `--cwd <dir>` | — | `process.cwd()` | Project root directory |
| `--check` | — | — | Verify mode — compare without writing |

### CI/CD Integration {#ci}

<!-- Feature grid: CI platforms -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(129,140,248,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:8px">GitHub Actions</div>

```yaml
- run: vurb lock --check --server ./src/server.ts
```

</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(245,158,11,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:8px">GitLab CI</div>

```yaml
governance:
  script:
    - vurb lock --check --server ./src/server.ts
```

</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:16px 20px">
<div style="font-size:12px;color:rgba(52,211,153,0.7);font-weight:600;font-family:Inter,sans-serif;margin-bottom:8px">Pre-commit Hook</div>

```bash
#!/bin/sh
vurb lock --check --server ./src/server.ts
```

</div>

</div>

---

## `vurb deploy` {#deploy}

Bundle your server into a self-contained Fat Bundle (IIFE), compress it, and deploy to Vinkius Edge:

```bash
vurb deploy
vurb deploy --server ./src/server.ts
```

### Prerequisites

```bash
# Quick setup (one-liner)
vurb remote --server-id <uuid> --token <token>

# Or configure separately
vurb remote --server-id <uuid>
vurb token <token>
```

### Token Resolution

<!-- Numbered steps -->
<div style="margin:24px 0">
<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px;padding:12px 16px;border-left:2px solid rgba(129,140,248,0.3);background:rgba(129,140,248,0.02);border-radius:0 6px 6px 0">
<span style="font-size:16px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:24px">1</span>
<div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:Inter,sans-serif"><code style="font-size:10px">--token</code> flag — highest priority, one-time override</div>
</div>
<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:12px;padding:12px 16px;border-left:2px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.02);border-radius:0 6px 6px 0">
<span style="font-size:16px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:24px">2</span>
<div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:Inter,sans-serif"><code style="font-size:10px">VURB_DEPLOY_TOKEN</code> env var — ideal for CI/CD</div>
</div>
<div style="display:flex;align-items:flex-start;gap:16px;padding:12px 16px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 6px 6px 0">
<span style="font-size:16px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:24px">3</span>
<div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:Inter,sans-serif"><code style="font-size:10px">.vurbrc</code> file — persisted via <code style="font-size:10px">vurb token</code> or <code style="font-size:10px">vurb remote --token</code></div>
</div>
</div>

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--server <path>` | `-s` | Auto-detect | Path to server entrypoint |
| `--token <token>` | — | — | Override deploy token (one-time) |
| `--allow-insecure` | — | — | Suppress HTTP plaintext warning |

### Security

The CLI warns when a token reaches a non-localhost HTTP endpoint. Use `--allow-insecure` to suppress, or switch to HTTPS.

### Bundle Limits

Maximum **500KB** (before compression). The Fat Bundle includes all dependencies (Zod, MCP SDK, Vurb) — most servers fit well within this.

---

## `vurb remote` {#remote}

Manage cloud configuration stored in `.vurbrc`:

```bash
# Set server ID (uses default Vinkius Cloud endpoint)
vurb remote --server-id 019d0250-7baf-7172-9732-096c8baa4478

# Set server ID + token (full setup)
vurb remote --server-id 019d0250-7baf-7172-9732-096c8baa4478 --token vk_live_9hfaJlIPOv5x

# View current config
vurb remote
```

| Option | Default | Description |
|---|---|---|
| `<url>` (positional) | Vinkius Cloud | Override API endpoint |
| `--server-id <id>` | — | Target server UUID |
| `--token <token>` | — | Save deploy token to `.vurbrc` |

---

## `vurb token` {#token}

Manage deploy tokens stored in `.vurbrc`. Tokens are displayed in masked form (`vk_live_••••••••wp96`):

```bash
vurb token vk_live_9hfaJlIPOv5xZhJEtjIYM0mcWBgo5tWcEePbwp96
# ✓ Token saved to .vurbrc (vk_live_••••••••wp96)

vurb token          # View token status
vurb token --clear  # Remove token
```

> [!WARNING]
> The `.vurbrc` file is auto-added to `.gitignore`. Tokens are **never** displayed in full. For CI/CD, prefer the `VURB_DEPLOY_TOKEN` environment variable.

---

## `vurb inspect` {#inspect}

Real-time TUI dashboard for monitoring:

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

| Option | Short | Default | Description |
|---|---|---|---|
| `--demo` | `-d` | — | Launch with simulator (no server needed) |
| `--out <mode>` | `-o` | `tui` | Output: `tui` or `stderr` (headless ECS/K8s) |
| `--pid <pid>` | `-p` | — | Connect to a specific server PID |
| `--path <path>` | — | — | Custom IPC socket/pipe path |

Aliases: `vurb inspect`, `vurb insp`, `vurb debug`, `vurb dbg`

---

## Exit Codes {#exit}

| Code | Meaning |
|---|---|
| `0` | Command completed successfully |
| `1` | Error — lockfile stale, missing config, server not found |

## Progress Reporting {#progress}

CLI outputs Composer/Yarn-style progress to `stderr`:

| Icon | Status |
|---|---|
| `○` | Queued |
| `◐` | In progress |
| `●` | Completed |
| `✗` | Failed |

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

See [Capability Lockfile](/governance/capability-lockfile) for the full programmatic lockfile API.
