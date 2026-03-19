---
title: "Capability Lockfile"
description: "Generate, verify, and integrate vurb.lock into CI/CD. A deterministic, git-diffable snapshot of the behavioral surface."
---

# Capability Lockfile

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Generate a vurb.lock for my server, add it to git, and create a GitHub Actions step that runs vurb lock --check on every PR."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(99,102,241,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(99,102,241,0.6);letter-spacing:3px;font-weight:700">BEHAVIORAL LOCKFILE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">package-lock.json for capabilities.<br><span style="color:rgba(255,255,255,0.25)">Pins what your server can do.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">A deterministic, canonical JSON snapshot of the complete behavioral surface — tool contracts, prompts, guardrails, entitlements. Git-diffable. CI-gatable.</div>
</div>


`vurb.lock` fills all three gaps. It is a deterministic, canonical JSON file that captures the complete behavioral surface of your MCP server — tool contracts, prompt definitions, cognitive guardrails, entitlements, and token economics. The behavioral equivalent of `package-lock.json`, except instead of pinning dependency versions, it pins what your server can do.

```text
Developer builds server → Vurb.ts lock → vurb.lock → git commit

CI runs build → Vurb.ts lock --check → compares live surface to committed lockfile (SOC2 Immutable Evidence)

If stale → CI fails → reviewer inspects the git diff before merge
```


## Generating the Lockfile {#generating}

From the command line:

```bash
vurb lock --server ./src/server.ts
```

Or programmatically:

```typescript
import {
  generateLockfile,
  writeLockfile,
} from 'Vurb.ts/introspection';

const contracts = compileContracts(registry.getBuilders());

const lockfile = generateLockfile('payments-api', contracts, '2.8.1', {
  prompts: promptRegistry.getBuilders?.() ?? [],
});

await writeLockfile(lockfile, process.cwd());
```

`generateLockfile()` is a pure function — given the same contracts, it always produces the same lockfile. The optional `prompts` parameter adds prompt snapshots alongside tool snapshots. `writeLockfile()` is the only side-effectful call — it writes the canonical JSON to disk.


## What the Lockfile Captures {#structure}

Each tool entry has four sections — surface, behavior, token economics, and entitlements:

```json
{
  "lockfileVersion": 1,
  "serverName": "payments-api",
  "vurbVersion": "2.8.1",
  "generatedAt": "2026-02-26T12:00:00.000Z",
  "integrityDigest": "sha256:a1b2c3...",
  "capabilities": {
    "tools": {
      "invoices": {
        "integrityDigest": "sha256:f6e5d4...",
        "surface": {
          "description": "Manage invoices",
          "actions": ["create", "list", "void"],
          "inputSchemaDigest": "sha256:...",
          "tags": ["billing"]
        },
        "behavior": {
          "egressSchemaDigest": "sha256:...",
          "systemRulesFingerprint": "static:abc123",
          "destructiveActions": ["void"],
          "readOnlyActions": ["list"],
          "middlewareChain": ["auth:mw"],
          "affordanceTopology": ["payments.refund"],
          "cognitiveGuardrails": {
            "agentLimitMax": 50,
            "egressMaxBytes": null
          }
        },
        "tokenEconomics": {
          "inflationRisk": "low",
          "schemaFieldCount": 5,
          "unboundedCollection": false
        },
        "entitlements": {
          "filesystem": false,
          "network": true,
          "subprocess": false,
          "crypto": false
        }
      }
    }
  }
}
```

This structure captures things you can't see from `tools/list`: whether system rules are static or dynamic, which actions are destructive, what middleware protects them, whether the handler uses subprocess calls, and how much token pressure the response generates. All of this is computed from the builder metadata you already declared — zero extra annotation.

When you provide prompt builders, the lockfile also captures prompt surfaces:

```json
"prompts": {
  "billing-summary": {
    "integrityDigest": "sha256:9a8b7c...",
    "description": "Summarize billing data",
    "title": "Billing Summary",
    "tags": ["billing", "finance"],
    "arguments": [
      { "name": "account_id", "description": null, "required": true },
      { "name": "month", "description": "Month in YYYY-MM", "required": true }
    ],
    "argumentsDigest": "sha256:d4e5f6...",
    "hasMiddleware": false,
    "hydrationTimeout": null
  }
}
```


## Why Canonical Serialization Matters {#canonical}

The lockfile is **canonical** — given the same inputs, it produces the same bytes. Object keys are sorted lexicographically. Arrays (actions, tags, middleware) are sorted before serialization. The file always ends with `\n`. Two-space indentation for readable diffs.

This means `git diff` works correctly: identical surfaces produce identical files, and every line change is semantically meaningful. There is no noise from key reordering or timestamp jitter (the `generatedAt` timestamp is excluded from integrity computation).

```typescript
import { serializeLockfile } from 'Vurb.ts/introspection';

const json = serializeLockfile(lockfile);
// Deterministic JSON — sorted keys, trailing newline
```


## Gating Your CI Build {#verification}

The primary CI integration is `checkLockfile()`:

```typescript
import { readLockfile, checkLockfile } from 'Vurb.ts/introspection';

const lockfile = await readLockfile(process.cwd());
if (!lockfile) {
  console.error('No lockfile found. Run `Vurb.ts lock` first.');
  process.exit(1);
}

const result = checkLockfile(lockfile, contracts, {
  prompts: promptRegistry.getBuilders?.() ?? [],
});

if (!result.ok) {
  console.error(result.message);
  // "Lockfile is stale. tools changed: [invoices]; prompts added: [billing-summary]."
  process.exit(1);
}
```

The `LockfileCheckResult` tells you exactly what drifted:

```typescript
interface LockfileCheckResult {
  readonly ok: boolean;
  readonly message: string;
  readonly added: readonly string[];        // tools in code but not lockfile
  readonly removed: readonly string[];      // tools in lockfile but not code
  readonly changed: readonly string[];      // tools whose digest changed
  readonly unchanged: readonly string[];
  readonly addedPrompts: readonly string[];
  readonly removedPrompts: readonly string[];
  readonly changedPrompts: readonly string[];
  readonly unchangedPrompts: readonly string[];
}
```

When the server-level `integrityDigest` matches, verification completes in $O(1)$ — a single string comparison. Per-tool comparison only runs when the overall digest differs.


## Reviewing Lockfile Diffs {#diffs}

When someone changes a tool's behavioral surface, the PR diff shows exactly what changed:

```diff
  "invoices": {
-   "integrityDigest": "sha256:f6e5d4c3b2a1...",
+   "integrityDigest": "sha256:9a8b7c6d5e4f...",
    "surface": {
      "description": "Manage invoices",
-     "actions": ["create", "list", "void"],
+     "actions": ["create", "list", "void", "delete"],
    },
    "behavior": {
-     "destructiveActions": ["void"],
+     "destructiveActions": ["void", "delete"],
      "readOnlyActions": ["list"],
    }
  }
```

A new action `delete` was added, and it was marked as destructive. Without the lockfile, this change would be invisible at the protocol level — the MCP client would discover it at runtime with no audit trail.

Prompt changes are equally visible:

```diff
  "billing-summary": {
-   "description": "Summarize billing data",
+   "description": "Summarize billing and compliance data",
-   "tags": ["billing"],
+   "tags": ["billing", "compliance"],
    "arguments": [
      { "name": "account_id", "description": null, "required": true },
-     { "name": "month", "description": "Month in YYYY-MM", "required": true }
+     { "name": "month", "description": "Month in YYYY-MM", "required": true },
+     { "name": "format", "description": "Output format", "required": false }
    ]
  }
```


## CI/CD Integration {#ci}

### GitHub Actions

```yaml
name: Capability Governance
on: [pull_request]

jobs:
  lockfile-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: vurb lock --check --server ./src/server.ts
```

### GitLab CI

```yaml
governance:lockfile:
  stage: test
  script:
    - npm ci
    - vurb lock --check --server ./src/server.ts
  rules:
    - if: $CI_MERGE_REQUEST_ID
```


## Parsing and Validation {#parsing}

`parseLockfile()` validates the structure and version before returning:

```typescript
import { parseLockfile } from 'Vurb.ts/introspection';

const lockfile = parseLockfile(rawJson);
if (!lockfile) {
  throw new Error('Invalid lockfile — wrong version or missing fields');
}
```

It checks that `lockfileVersion` equals the current version (`1`), that all required header fields exist, and that `capabilities.tools` is present.


## Best Practices {#best-practices}

Commit the lockfile — like `package-lock.json`, it belongs in version control. Run `Vurb.ts lock` after changing tool builders, Presenters, prompt definitions, middleware, or system rules. Run `Vurb.ts lock --check` in every CI pipeline. Train your team to review lockfile diffs in pull requests — especially changes to `systemRulesFingerprint`, `destructiveActions`, `entitlements`, and prompt `arguments`.

For cryptographic tamper detection beyond the lockfile, pair with [Zero-Trust Attestation](/governance/zero-trust-attestation) to sign the digest at build time and verify it at startup.
