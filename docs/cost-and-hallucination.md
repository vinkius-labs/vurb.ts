# Cost Reduction & Anti-Hallucination

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`npx @vurb/core create`](/quickstart-lightspeed).
:::

- [Before & After](#before-after)
- [Design Thesis](#thesis)
- [The 8 Mechanisms](#mechanisms)
- [① Action Consolidation](#consolidation)
- [② TOON Encoding](#toon)
- [③ Zod .strict()](#strict)
- [④ Self-Healing Errors](#self-healing)
- [⑤ Cognitive Guardrails](#guardrails)
- [⑥ Agentic Affordances](#affordances)
- [⑦ JIT Context](#jit)
- [⑧ State Sync](#state-sync)
- [How They Compound](#compounding)
- [Token Budget Preview](#preview)

## Before & After {#before-after}

**Before — raw MCP server:**

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
        case 'create_user':
            const user = await db.users.create(args);  // no validation
            return { content: [{ type: 'text', text: JSON.stringify(user) }] };
            // leaks tenant_id, password_hash, internal_flags
        case 'list_invoices':
            const invoices = await db.invoices.findMany();  // no limit
            return { content: [{ type: 'text', text: JSON.stringify(invoices) }] };
            // 10,000 rows × ~500 tokens = 5,000,000 tokens
        // ...46 more cases
    }
});
```

50 tools × ~200 tokens each = ~10,000 tokens of schemas. Plus a ~2,000-token system prompt with rules for every domain entity — sent even when the agent just calls `tasks.list`. Total: ~12,000 tokens of prompt tax per turn, mostly irrelevant.

**After — Vurb.ts with MVA:**

```text
Tool 1/5: users     — 350 tokens (6 actions)
Tool 2/5: projects  — 340 tokens (5 actions)
Tool 3/5: billing   — 380 tokens (8 actions)
Tool 4/5: tasks     — 320 tokens (6 actions)
Tool 5/5: reports   — 280 tokens (3 actions)
Total: ~1,670 tokens. Same 50 operations. System prompt rules: 0 tokens.
```

Domain rules travel just-in-time with data — not in the system prompt. Response is a structured perception package:

```text
Block 1 — DATA: {"id":"INV-001","amount_cents":45000,"status":"pending"}
Block 2 — UI: [echarts gauge chart config]
Block 3 — DOMAIN RULES: "amount_cents is in CENTS. Divide by 100."
Block 4 — NEXT ACTIONS: → billing.pay: "Invoice is pending"
```

No guessing. Undeclared fields rejected. Next actions data-driven.

## Design Thesis {#thesis}

```text
Fewer Tokens + Fewer Requests = Less Hallucination + Less Cost
```

Cost and hallucination are two symptoms of the same root cause: too many tokens in the context window, and too many requests because the agent didn't get adequate context on the first call.

If your goal is to **Reduce LLM API Costs** and **Prevent AI Hallucinations in Production**, the solution is not better prompting. The solution is structural. 

Without **Context DDoS Prevention**, raw MCP servers routinely trigger **LLM OOM (Out of Memory)** failures or bankrupt companies with runaway API bills from Anthropic and OpenAI. By employing the MVA architecture to implement strict **LLM Token Economics** — aggressively tree-shaking the context window and shrinking the API surface — Vurb.ts protects your infrastructure while dramatically increasing agent accuracy.

## The 8 Mechanisms {#mechanisms}

```text
① Action Consolidation        → fewer tools in context     → ↓ tokens
② TOON Encoding               → compact descriptions       → ↓ tokens
③ Zod .strict()               → no hallucinated params     → ↓ retries
④ Self-Healing Errors          → fix on first retry         → ↓ retries
⑤ Cognitive Guardrails         → bounded response size      → ↓ tokens
⑥ Agentic Affordances          → correct next action        → ↓ retries
⑦ JIT Context (System Rules)   → no guessing domain logic   → ↓ retries
⑧ State Sync                   → no stale-data re-reads     → ↓ requests
```

## ① Action Consolidation {#consolidation}

Operations grouped behind a single tool with a discriminator enum. Schema surface shrinks significantly:

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

const list = f.query('projects.list')
  .describe('List projects')
  .handle(async (input, ctx) => ctx.db.projects.findMany());

const get = f.query('projects.get')
  .describe('Get project')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => ctx.db.projects.findUnique(input.id));

const create = f.mutation('projects.create')
  .describe('Create project')
  .withString('name', 'Name')
  .handle(async (input, ctx) => ctx.db.projects.create(input));
```

`SchemaGenerator.ts` compiles all actions into one `inputSchema` with a discriminator enum. `applyAnnotations()` adds per-field context telling the LLM which fields are needed for which action.

| Metric | Without Consolidation | With Consolidation |
|---|---|---|
| Tools in prompt | 50 | 1-5 |
| Schema tokens | ~10,000 | ~1,500 |

## ② TOON Encoding {#toon}

TOON (Token-Oriented Object Notation) replaces JSON structure with pipe-delimited tabular data. Enable with `.toonDescription()`:

```typescript
const projects = f.query('projects.list')
  .describe('List all projects')
  .toonDescription()
  .handle(async (input, ctx) => ctx.db.projects.findMany());
```

Output:
```text
action|desc|required
list|List all projects|
get|Get by ID|id
create|Create project|name
```

`toonSuccess()` provides opt-in response encoding. ~40-50% token reduction over equivalent JSON for tabular data.

## ③ Zod `.strict()` {#strict}

Every action's Zod schema compiled with `.strict()` at build time. Undeclared fields rejected with actionable error naming each invalid field:

```typescript
// ToolDefinitionCompiler.ts
const merged = base && specific ? base.merge(specific) : (base ?? specific);
return merged.strict();  // rejects all undeclared fields
```

Validation happens in `ExecutionPipeline.ts` before the handler — hallucinated parameters never reach application code.

## ④ Self-Healing Errors {#self-healing}

`ValidationErrorFormatter.ts` translates Zod errors into directive correction prompts:

```text
❌ Validation failed for 'users.create':
  • email — Invalid email format. You sent: 'admin@local'.
    Expected: a valid email address (e.g. user@example.com).
  • age — Number must be >= 18. You sent: 10.
  💡 Fix the fields above and call the action again.
```

For business-logic errors, `toolError()` provides structured recovery:

```typescript
return toolError('ProjectNotFound', {
    message: `Project '${args.project_id}' does not exist.`,
    suggestion: 'Call projects.list first to get valid IDs, then retry.',
    availableActions: ['projects.list'],
});
```

Or use the fluent `ErrorBuilder` via `f.error()`:

```typescript
return f.error('NOT_FOUND', `Project '${input.id}' not found`)
    .suggest('Call projects.list to find valid IDs')
    .actions('projects.list')
    .build();
```

## ⑤ Cognitive Guardrails {#guardrails}

`.limit()` / `.agentLimit()` truncates data before it reaches the LLM and injects a teaching block:

```typescript
const TaskPresenter = createPresenter('Task')
    .schema(taskSchema)
    .limit(50);
```

10,000 rows without guardrail → ~5,000,000 tokens. With `.limit(50)` → ~25,000 tokens.

## ⑥ Agentic Affordances {#affordances}

`.suggest()` / `.suggestActions()` provides HATEOAS-style next-action hints based on data state:

```typescript
.suggest((invoice, ctx) => {
    if (invoice.status === 'pending') {
        return [
            suggest('billing.pay', 'Process immediate payment'),
            suggest('billing.send_reminder', 'Send payment reminder'),
        ];
    }
    return [];
})
```

The agent receives explicit context: `[SYSTEM HINT]: → billing.pay: Process immediate payment`

## ⑦ JIT Context — Domain Rules That Travel with Data {#jit}

Rules travel with the data, not in the system prompt. Context Tree-Shaking ensures domain rules only appear when that specific domain is active:

```typescript
// Presenter.ts — _attachRules()
if (typeof this._rules === 'function') {
    const resolved = this._rules(singleData, ctx)
        .filter((r): r is string => r !== null && r !== undefined);
    if (resolved.length > 0) builder.rules(resolved);
}
```

## ⑧ State Sync {#state-sync}

Causal invalidation signals at the protocol layer, inspired by RFC 7234. Inline on the tool:

```typescript
const updateSprint = f.mutation('sprints.update')
    .describe('Update a sprint')
    .invalidates('sprints.*', 'tasks.*')
    .withString('id', 'Sprint ID')
    .handle(async (input, ctx) => ctx.db.sprints.update(input));
```

Or centralized via `f.stateSync()`:

```typescript
const sync = f.stateSync()
    .defaults(p => p.stale())
    .policy('sprints.update', p => p.invalidates('sprints.*'))
    .policy('tasks.update', p => p.invalidates('tasks.*', 'sprints.*'))
    .policy('countries.*', p => p.cached())
    .build();
```

After successful mutation: `[System: Cache invalidated for sprints.* — caused by sprints.update]`. Failed mutations emit nothing — state didn't change.

## The Structured Perception Package {#perception}

Two layers of precise context, all implemented in real code.

**Layer 1 — Tool Definition** (what the LLM sees in `tools/list`):

`DescriptionGenerator.ts` generates workflow annotations: `'get': Get project details. Requires: id` with `[DESTRUCTIVE]` tags from the action's `destructive: true` flag.

`SchemaGenerator.ts` adds per-field annotations: `"Required for: create. For: update"` — not a generic `"(optional)"`.

`AnnotationAggregator.ts` aggregates per-action metadata: `readOnlyHint` is `true` only if ALL actions are read-only, `destructiveHint` is `true` if ANY action is destructive.

**Layer 2 — Tool Response** (what the LLM sees in `tools/call`):

`ResponseBuilder.build()` composes a multi-block MCP response:

```text
Block 1 — DATA           Zod-validated, .strict()-ed JSON. Only declared fields.
Block 2 — UI BLOCKS       Server-rendered charts/diagrams with pass-through instruction.
Block 3 — EMBEDS          Rules and UI from child Presenters (via .embed()).
Block 4 — LLM HINTS       💡 Contextual hints based on data state.
Block 5 — DOMAIN RULES    [DOMAIN RULES]: scoped rules for this entity only.
Block 6 — ACTIONS         [SYSTEM HINT]: → billing.pay: Process immediate payment
```

Every block deterministic — from the builder, not the LLM. Domain rules appear only when active (Context Tree-Shaking). Action suggestions computed from actual data state. UI blocks passed through unchanged. Embedded Presenter blocks compose relational context into a single response.

## How They Compound {#compounding}

| Metric | Raw MCP Server | With Vurb.ts |
|---|---|---|
| Tools in `tools/list` | 50 | 5 (grouped) |
| Prompt schema tokens | ~10,000 | ~1,670 |
| System prompt domain rules | ~2,000 tokens (global) | 0 (JIT per response) |
| Total prompt tax per turn | ~12,000 | ~1,670 |
| Response to `tasks.list` (10K rows) | ~5,000,000 tokens | ~25,000 (`.limit()`) |
| Parameter hallucination | Leaks to handler | `.strict()` rejects with actionable error |
| Error guidance | Generic message | Directed correction prompt |
| Stale-data awareness | None | `[Cache-Control]` directives |

## Token Budget Preview {#preview}

Use `.previewPrompt()` on any built tool to see exactly what the LLM receives:

```typescript
const projects = f.query('projects.list')
    .describe('List all projects')
    .withString('workspace_id', 'Workspace ID')
    .handle(async (input, ctx) => ctx.db.projects.findMany());

console.log(projects.previewPrompt());

// ┌────────────────────────────────────────────────────────────┐
// │  MCP Tool Preview: projects                                │
// ├─── Description ───────────────────────────────────────────┤
// │  Manage workspace projects. Actions: list, create, ...     │
// ├─── Input Schema ──────────────────────────────────────────┤
// │  { "type": "object", ...  }                                │
// ├─── Token Estimate ────────────────────────────────────────┤
// │  ~342 tokens (1,368 chars)                                 │
// └────────────────────────────────────────────────────────────┘
```

See exactly what the LLM receives and estimate token cost before running a single request.
