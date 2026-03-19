---
title: "Self-Healing Context"
description: "Automatic contract delta injection into validation errors, enabling LLMs to self-correct when behavioral contracts change."
---

# Self-Healing Context

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Enable self-healing: diff current contracts against the lockfile and inject contract deltas into Zod validation errors so the LLM can self-correct."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">ZERO-RETRY RECOVERY</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Errors that teach.<br><span style="color:rgba(255,255,255,0.25)">The LLM self-corrects on first retry.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">When a contract changes and validation fails, the error response includes the exact deltas — what changed, what the previous contract looked like, and what the current one requires. One retry, zero loops.</div>
</div>


Contract-Aware Self-Healing enriches validation error responses with contract delta context from the [Contract Diffing](/governance/contract-diffing) engine. The error XML includes which fields changed, what the previous contract looked like, and what the current contract requires. This gives the LLM enough context to self-correct on the next invocation instead of entering a retry loop.

When no contract changes exist, self-healing adds zero overhead. `createToolEnhancer()` checks for deltas at initialization and returns an identity function if none exist — no per-call filtering, no delta lookup, no XML generation.


## Enriching Validation Errors {#enrich}

```typescript
import {
  enrichValidationError,
  type SelfHealingConfig,
} from 'Vurb.ts/introspection';
import { diffContracts } from 'Vurb.ts/introspection';

// Compute deltas at startup (once)
const deltas = new Map<string, ContractDiffResult>();
for (const [toolName, current] of Object.entries(currentContracts)) {
  const previous = previousContracts[toolName];
  if (previous) {
    deltas.set(toolName, diffContracts(previous, current));
  }
}

const config: SelfHealingConfig = {
  activeDeltas: deltas,
};

const result = enrichValidationError(
  originalErrorXml,
  'invoices',
  'create',
  config,
);

if (result.injected) {
  console.log(`Injected ${result.deltaCount} contract deltas`);
}
```

Contract deltas are computed once at server startup by diffing current contracts against the last known-good lockfile. The delta map is then frozen and shared across all request handlers.


## Tool-Scoped Enhancer {#enhancer}

`createToolEnhancer()` is the primary integration point. It returns a pre-scoped function optimized for a specific tool:

```typescript
import { createToolEnhancer } from 'Vurb.ts/introspection';

const enhance = createToolEnhancer('invoices', config);

const enrichedXml = enhance(originalErrorXml, 'create');
```

If no deltas exist for the tool, `createToolEnhancer()` returns a literal identity function `(x) => x`. The JIT can inline this completely — the validation error path has zero additional cost when contracts are stable.


## The `<contract_awareness>` Block {#block}

When deltas are injected, the enriched error XML includes a `<contract_awareness>` block before the closing `</validation_error>` tag:

```xml
<validation_error>
  <tool>invoices</tool>
  <action>create</action>
  <error>Required field "currency" is missing</error>

  <contract_awareness>
    <system_note>
      IMPORTANT: The behavioral contract for tool "invoices" has
      changed since your last calibration.
    </system_note>
    <action>create</action>
    <change_count>2</change_count>
    <max_severity>BREAKING</max_severity>

    <instructions>
      Review the contract changes below and adjust your next
      invocation accordingly. These changes may explain why
      your previous arguments were rejected.
    </instructions>

    <contract_deltas>
      <delta severity="BREAKING" field="actions.create.inputSchema">
        <previous>{ amount: number, status: string }</previous>
        <current>{ amount: number, status: string, currency: string }</current>
      </delta>
      <delta severity="RISKY" field="cognitiveGuardrails.agentLimitMax">
        <previous>100</previous>
        <current>50</current>
      </delta>
    </contract_deltas>
  </contract_awareness>
</validation_error>
```

The `<contract_deltas>` block is generated by `formatDeltasAsXml()` from the [Contract Diffing](/governance/contract-diffing) module. Field values are sanitized to prevent XML injection.


## Delta Filtering {#filtering}

Not all contract changes are relevant to a specific validation error. The module applies two filters:

**Severity filter** — By default, only `BREAKING` and `RISKY` deltas are injected. `SAFE` and `COSMETIC` changes don't cause validation failures and would add noise:

```typescript
const config: SelfHealingConfig = {
  activeDeltas: deltas,
  includeAllSeverities: true,  // include SAFE + COSMETIC too
};
```

**Action scope filter** — Deltas are filtered by action relevance. Global deltas (e.g., `description`, `tags`) are always included. Action-specific deltas (e.g., `actions.create.inputSchema`) are included only if they match the failing action. A delta for `actions.list.egressSchema` won't be injected into a `create` validation error.

To prevent context flooding from large diffs, the number of injected deltas is capped:

```typescript
const config: SelfHealingConfig = {
  activeDeltas: deltas,
  maxDeltasPerError: 3,  // default: 5
};
```


## Full Setup Flow {#setup}

The typical integration reads the lockfile (last known-good contracts), compiles current contracts, diffs each tool, and creates per-tool enhancers:

```typescript
import { diffContracts } from 'Vurb.ts/introspection';
import { createToolEnhancer } from 'Vurb.ts/introspection';
import { readLockfile, compileContracts } from 'Vurb.ts/introspection';

const lockfile = await readLockfile(cwd);
const currentContracts = compileContracts(builders);

const deltas = new Map();
for (const [toolName, current] of Object.entries(currentContracts)) {
  const previous = lockfile.capabilities.tools[toolName];
  if (previous) {
    deltas.set(toolName, diffContracts(previous, current));
  }
}

const config = { activeDeltas: deltas };
const enhancers = new Map();
for (const toolName of Object.keys(currentContracts)) {
  enhancers.set(toolName, createToolEnhancer(toolName, config));
}
```

Tools with no changes get identity enhancers. Tools with breaking changes get enhancers that inject contract context into every validation error. The cost is proportional to the number of changes — zero for stable tools.


## Configuration {#config}

`SelfHealingConfig`:

| Field | Type | Default | Description |
|---|---|---|---|
| `activeDeltas` | `ReadonlyMap<string, ContractDiffResult>` | — | Contract diff results keyed by tool name |
| `includeAllSeverities` | `boolean` | `false` | When `false`, only BREAKING and RISKY deltas are injected |
| `maxDeltasPerError` | `number` | `5` | Maximum deltas to inject per error response |

`SelfHealingResult`:

| Field | Type | Description |
|---|---|---|
| `originalError` | `string` | The original validation error XML |
| `enrichedError` | `string` | The enriched XML (same as original if no deltas) |
| `injected` | `boolean` | Whether any contract context was injected |
| `deltaCount` | `number` | Number of deltas injected |
| `toolName` | `string` | The tool that failed validation |


## API Reference {#api}

| Function | Description |
|---|---|
| `enrichValidationError(originalError, toolName, actionKey, config)` | Enrich a validation error with contract change context |
| `createToolEnhancer(toolName, config)` | Create a pre-scoped enhancer. Returns identity function if no deltas exist. |

Both functions are pure — no logging, no writes, no network calls. Given the same deltas and error, the enriched output is always identical.
