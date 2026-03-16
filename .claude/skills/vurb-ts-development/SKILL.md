---
name: vurb-ts-development
description: >
  How to build production MCP servers with Vurb.ts using the MVA (Model-View-Agent) pattern.
  Use this skill whenever writing, modifying, or reviewing Vurb.ts code — including tools,
  Presenters, Models, middleware, prompts, routers, tests, or server configuration.
  Activate even when the user just says "create a tool", "add an endpoint", "write a Presenter",
  or mentions @vurb/core, defineModel, definePresenter, initVurb, FluentToolBuilder, or any
  Vurb.ts API. This skill covers the entire framework surface.
license: Apache-2.0
compatibility: Requires Node.js >= 18, TypeScript 5.7+
metadata:
  author: vinkius-labs
  version: "3.0"
  tags: mcp, typescript, framework, mva
---

# Vurb.ts Development Guide

Vurb.ts is a TypeScript framework for MCP servers built on the **MVA (Model-View-Agent)** pattern. The Model validates data, the Presenter (View) shapes what the AI perceives, and Tools (Agent layer) wire it all together.

> For the complete API reference with all type signatures, read [llms.txt](../../../llms.txt) at the root of the repository. This skill covers the essential patterns and rules.

## Reference Examples

Complete, runnable examples are available in `references/`. Read them for concrete implementation patterns:

| Example | Domain | Patterns Shown |
|---|---|---|
| [example-complete-crud.ts](references/example-complete-crud.ts) | Product Catalog | Full MVA lifecycle: Model → Presenter → Router → Query/Mutation/Action, ErrorBuilder, State Sync |
| [example-proxy-api.ts](references/example-proxy-api.ts) | Blog Platform | `.proxy()` API pass-through, `.fromModel()`, field aliases, path params (`:id`), `.handle()` vs `.proxy()` decision tree |
| [example-server-setup.ts](references/example-server-setup.ts) | Generic App | Full server bootstrap: context, `initVurb()`, middleware, `autoDiscover()`, prompts, State Sync policies, `startServer()` |
| [example-testing.ts](references/example-testing.ts) | Customer Service | `@vurb/testing`: Egress Firewall assertions, JIT System Rules, RBAC middleware, error handling, Symbol Invisibility |

## Project Structure

```
src/
├── models/               ← M — defineModel() declarations
│   ├── InvoiceModel.ts
│   └── UserModel.ts
├── views/                ← V — Presenters
│   ├── invoice.presenter.ts
│   └── user.presenter.ts
├── agents/               ← A — Tool definitions
│   ├── billing.tool.ts
│   └── users.tool.ts
├── index.ts              ← ToolRegistry + registerAll()
└── server.ts             ← attachToServer() bootstrap
```

**Layer import rule:** `agents/` → `views/` → `models/` → `@vurb/core`. Never import backwards.

## The Golden Rules

1. **ALWAYS use `defineModel()` for domain entity schemas** — never raw `z.object()`. Models go in `models/`.
2. **Presenters receive Models via `.schema(MyModel)`** — the Presenter is the egress firewall.
3. **`with*()` methods are for tool INPUT parameters only** (filters, IDs, pagination) — NOT for domain schemas.
4. **Handlers return raw data** — the framework wraps with `success()` automatically. No boilerplate.
5. **One Model + one Presenter per entity**, reused across every tool and prompt.
6. **Use semantic verbs**: `f.query()` = readOnly, `f.mutation()` = destructive, `f.action()` = neutral.

## defineModel() — The "M" in MVA

Every domain entity starts here. Produces a `Model` with a compiled Zod `.schema`.

```typescript
import { defineModel } from '@vurb/core';

export const InvoiceModel = defineModel('Invoice', m => {
    m.casts({
        id:           m.string(),
        amount_cents: m.number('CRITICAL: in CENTS. Divide by 100 for display.'),
        status:       m.enum('Status', ['paid', 'pending', 'overdue']),
        client_name:  m.string('Client name'),
    });
});

export const UserModel = defineModel('User', m => {
    m.casts({
        id:    m.string(),
        name:  m.string('Full name'),
        email: m.string('Email address'),
        role:  m.enum('Role', ['admin', 'member', 'guest']),
    });
    m.hidden(['password_hash', 'stripe_token']);  // Never exposed
    m.timestamps();                                // created_at + updated_at
    m.fillable({
        create: ['name', 'email', 'role'],
        update: ['name', 'email'],
    });
});
```

### Type Helpers

| Method | Produces | Use |
|---|---|---|
| `m.string(label?)` | `z.string()` | General text |
| `m.text(label?)` | `z.string()` | Markdown / long content |
| `m.number(label?)` | `z.number()` | Numeric |
| `m.boolean(label?)` | `z.boolean()` | Flags |
| `m.date(label?)` | `z.string()` | YYYY-MM-DD |
| `m.timestamp(label?)` | `z.string()` | ISO datetime |
| `m.uuid(label?)` | `z.string()` | UUID |
| `m.id(label?)` | `z.number()` | Always required |
| `m.enum(label, values)` | `z.enum()` | Valid values |

### FieldDef Chaining

```typescript
m.enum('Status', ['open', 'done']).default('open')
m.string('Display name').alias('displayName')     // agent says 'name', API gets 'displayName'
m.number('Score').examples([85, 92, 100])
```

### Model.toApi() — Alias Resolution

Strips undefined values and renames aliased fields. Used automatically by `.proxy()`, call explicitly in `.handle()`:

```typescript
const data = TaskModel.toApi(input);
// { title: 'X', body: 'Y' }  ← alias applied, undefined stripped
```

## Presenter — The "V" in MVA

The Presenter is the egress firewall between your handler and the wire. Schema MUST come from `defineModel()`.

### definePresenter() — Object Config (Recommended)

```typescript
import { definePresenter, ui } from '@vurb/core';

export const InvoicePresenter = definePresenter({
    name: 'Invoice',
    schema: InvoiceModel,                  // ← Model, never z.object()
    // autoRules: true (default) — .describe() annotations become system rules
    ui: (inv) => [ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] })],
    agentLimit: { max: 50, onTruncate: (n) => ui.summary({ omitted: n, hint: 'Use filters.' }) },
    suggestActions: (inv) => inv.status === 'pending'
        ? [{ tool: 'billing.pay', reason: 'Process payment', args: { id: inv.id } }]
        : [],
    embeds: [{ key: 'client', presenter: ClientPresenter }],
});
```

### createPresenter() — Fluent Builder

```typescript
import { createPresenter, ui } from '@vurb/core';

const UserPresenter = createPresenter('User')
    .schema(UserModel)
    .systemRules(['Display name in bold'])
    .uiBlocks((user) => [ui.summary({ total: 1, showing: 1 })])
    .agentLimit(50, { warningMessage: 'Showing {shown} of {total}. Use filters.' })
    .suggestActions((user) => [
        { tool: 'users.update', reason: 'Edit this user', args: { id: user.id } },
    ])
    .embed('team', TeamPresenter);
```

### Presenter Layers

| Layer | What It Does |
|---|---|
| Egress Firewall | `.parse()` strips undeclared fields — PII never reaches the wire |
| JIT System Rules | Rules travel with data, not in the global prompt |
| Server-Rendered UI | ECharts, Mermaid — deterministic, no hallucinated charts |
| Cognitive Guardrails | `.agentLimit()` truncates + injects guidance |
| Action Affordances | `.suggestActions()` — HATEOAS for agents |
| Relational Composition | `.embed()` — child Presenters inherit the full pipeline |
| Prompt Bridge | `PromptMessage.fromView()` — same source of truth for tools AND prompts |

## Fluent API — Tools

### Semantic Verbs

```typescript
import { initVurb } from '@vurb/core';

interface AppContext { db: PrismaClient; user: { id: string; role: string } }
export const f = initVurb<AppContext>();

// f.query()    — readOnly: true   (GET, no side effects)
// f.mutation() — destructive: true (DELETE, irreversible)
// f.action()   — neutral          (PUT/POST, no assumptions)
```

### Building a Tool

```typescript
export default f.query('billing.get_invoice')
    .describe('Get an invoice by ID')
    .withString('id', 'The invoice ID')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => {
        // input.id: string ✅ — fully typed, zero manual interfaces
        return await ctx.db.invoices.findUnique({ where: { id: input.id } });
        // ↑ Return raw data — Presenter handles validation, stripping, rendering
    });
```

### with*() Type-Chaining

Each call narrows the TypeScript generic — `input` is fully typed in `.handle()`:

| Method | Adds |
|---|---|
| `.withString(name, desc?)` | `Record<K, string>` |
| `.withOptionalString(name, desc?)` | `Partial<Record<K, string>>` |
| `.withNumber(name, desc?)` | `Record<K, number>` |
| `.withOptionalNumber(name, desc?)` | `Partial<Record<K, number>>` |
| `.withBoolean(name, desc?)` | `Record<K, boolean>` |
| `.withEnum(name, values, desc?)` | `Record<K, V>` (literal union) |
| `.withArray(name, itemType, desc?)` | `Record<K, T[]>` |

**Bulk variants** reduce verbosity — `.withStrings({...})`, `.withOptionalStrings({...})`, etc.:

```typescript
f.query('tasks.filter')
    .withStrings({
        company_slug: 'Workspace identifier',
        project_slug: 'Project identifier',
    })
    .withOptionalStrings({
        title: 'Filter by title',
        workflow: 'Column name',
    })
    .withOptionalNumbers({ per_page: 'Results per page' })
```

### .proxy() — Zero-Boilerplate API Proxying

Terminal method (alternative to `.handle()`) — auto-generates a handler that proxies to `ctx.client`:

```typescript
// HTTP method inferred from verb: query → GET, mutation → POST, action → PUT
// Path params resolved from input: ':id' consumes input.id
// Auto-unwraps { data: ... } envelopes
f.query('user.get')
    .withString('id', 'User UUID')
    .proxy('users/:id');  // → GET users/abc-123
```

**When to use:** `.proxy()` for simple pass-through, `.handle()` when you need business logic.

### .fromModel() — Model-Driven Input

Imports fillable fields from a Model's profile — zero manual `.with*()` calls:

```typescript
const createTask = f.mutation('tasks.create')
    .fromModel(TaskModel, 'create')  // imports title, description, status
    .proxy('tasks');

const updateTask = f.action('tasks.update')
    .fromModel(TaskModel, 'update')
    .handle(async (input, ctx) => {
        const data = TaskModel.toApi(input);  // alias applied, undefined stripped
        await ctx.client.put(`tasks/${input.id}`, data);
    });
```

**Decision tree:**
- **Simple CRUD, no logic** → `.fromModel()` + `.proxy()`
- **Custom logic** → `.fromModel()` + `.handle()` + `Model.toApi()`

### .instructions() — AI-First Guidance

```typescript
f.query('docs.search')
    .describe('Search internal documentation')
    .instructions('Use ONLY when the user asks about internal policies. Do NOT use for general questions.')
```

Injected as `[INSTRUCTIONS]` in the tool description — reduces hallucination.

## FluentRouter — Prefix Grouping

Shares prefix, middleware, and tags across child tools:

```typescript
const users = f.router('users')
    .describe('User management')
    .use(requireAuth)
    .tags('core');

const listUsers = users.query('list')
    .withOptionalNumber('limit', 'Max results')
    .handle(async (input, ctx) => ctx.db.users.findMany({ take: input.limit }));

const deleteUser = users.mutation('delete')
    .withString('id', 'User ID')
    .handle(async (input, ctx) => ctx.db.users.delete({ where: { id: input.id } }));
```

## Middleware

tRPC-style context derivation — enriches `ctx` type for `.handle()`:

```typescript
const requireAuth = f.middleware(async (ctx) => {
    const user = await db.getUser(ctx.token);
    if (!user) throw new Error('Unauthorized');
    return { user, permissions: user.permissions };
});

// ctx.user and ctx.permissions — fully typed downstream
f.mutation('admin.action')
    .use(requireAuth)
    .handle(async (input, ctx) => {
        ctx.user;        // ← typed!
        ctx.permissions; // ← typed!
    });
```

## ErrorBuilder — Self-Healing Errors

```typescript
const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
if (!project) {
    return f.error('NOT_FOUND', `Project "${input.id}" not found`)
        .suggest('Check the ID. Use projects.list to see valid IDs.')
        .actions('projects.list', 'projects.search')
        .details({ searched_id: input.id })
        .retryAfter(0);
}
```

## State Sync

Prevents temporal blindness — the agent knows when cached data is stale:

```typescript
f.query('geo.countries').cached();                    // immutable — cache forever
f.query('billing.balance').stale();                   // volatile — never cache
f.mutation('sprints.update').invalidates('sprints.*', 'tasks.*');  // causal invalidation
```

## Prompts — The Presenter Bridge

```typescript
import { definePrompt, PromptMessage } from '@vurb/core';

const AuditPrompt = definePrompt<AppContext>('audit', {
    args: { invoiceId: 'string' } as const,
    handler: async (ctx, { invoiceId }) => {
        const invoice = await ctx.db.getInvoice(invoiceId);
        return {
            messages: [
                PromptMessage.system('You are a Senior Financial Auditor.'),
                ...PromptMessage.fromView(InvoicePresenter.make(invoice, ctx)),
                PromptMessage.user('Begin the audit.'),
            ],
        };
    },
});
```

`PromptMessage.fromView()` decomposes a Presenter into XML-tagged messages — same schema, rules, and affordances in both tools and prompts.

## Testing with @vurb/testing

Runs the REAL execution pipeline in RAM — zero tokens consumed, deterministic:

```typescript
import { createVurbTester } from '@vurb/testing';

const tester = createVurbTester(registry, {
    contextFactory: () => ({ prisma: mockPrisma, tenantId: 't_42', role: 'ADMIN' }),
});

// Egress Firewall — PII physically absent
const result = await tester.callAction('db_user', 'find_many', { take: 5 });
expect(result.data[0]).not.toHaveProperty('passwordHash');

// JIT System Rules — travel with data
expect(result.systemRules).toContain('Email addresses are PII.');

// Middleware — GUEST blocked
const denied = await tester.callAction('db_user', 'find_many', { take: 5 }, { role: 'GUEST' });
expect(denied.isError).toBe(true);
```

Assert every MVA layer: `result.data`, `result.systemRules`, `result.uiBlocks`, `result.isError`.

## Common Anti-Patterns — What NOT to Do

### ❌ Using raw z.object() for domain schemas

```typescript
// WRONG:
const presenter = definePresenter({
    name: 'User',
    schema: z.object({ id: z.string(), name: z.string() }),  // ← NO!
});

// CORRECT:
const UserModel = defineModel('User', m => {
    m.casts({ id: m.string(), name: m.string() });
});
const presenter = definePresenter({ name: 'User', schema: UserModel });
```

### ❌ Manual success() wrapping

```typescript
// WRONG:
.handle(async (input, ctx) => {
    return success(await ctx.db.users.findMany());  // ← unnecessary
});

// CORRECT:
.handle(async (input, ctx) => {
    return await ctx.db.users.findMany();  // ← framework wraps automatically
});
```

### ❌ Manual if-checks for optional fields

```typescript
// WRONG:
.handle(async (input, ctx) => {
    const data: Record<string, unknown> = {};
    if (input.title) data.title = input.title;
    if (input.color) data.color = input.color;
    await ctx.client.updateItem(input.id, data);
});

// CORRECT:
.handle(async (input, ctx) => {
    const data = ItemModel.toApi(input);  // strips undefined, applies aliases
    await ctx.client.updateItem(input.id, data);
});
```

### ❌ Importing backwards between layers

```typescript
// WRONG: model importing from tool
// models/UserModel.ts
import { listUsers } from '../agents/users.tool';  // ← NO!

// CORRECT: agents → views → models → @vurb/core (one direction only)
```

### ❌ Duplicating Presenter logic across tools

```typescript
// WRONG: formatting response manually in each handler
// CORRECT: define Presenter ONCE in views/, use .returns(Presenter) in every tool
```

### ❌ Using .withString() for domain entity fields

```typescript
// WRONG: defining domain fields as tool input params
f.mutation('users.create')
    .withString('name', 'User name')
    .withString('email', 'Email')        // ← These are domain fields!
    .withString('role', 'User role')

// CORRECT: use .fromModel() for domain fields
f.mutation('users.create')
    .fromModel(UserModel, 'create')      // ← imports from Model's fillable profile
```

## Quick Reference

| I want to... | Use |
|---|---|
| Define a domain entity | `defineModel('Name', m => { ... })` |
| Shape what the AI sees | `definePresenter({ schema: MyModel, ... })` |
| Create a read tool | `f.query('entity.list')` |
| Create a write tool | `f.mutation('entity.delete')` |
| Create an update tool | `f.action('entity.update')` |
| Group related tools | `f.router('prefix')` |
| Add auth middleware | `.use(requireAuth)` |
| Return self-healing errors | `f.error('CODE', 'message').suggest(...)` |
| Proxy to an API | `.proxy('endpoint/:id')` |
| Import fields from Model | `.fromModel(MyModel, 'profile')` |
| Test MVA pipeline | `createVurbTester(registry, { contextFactory })` |
| Control caching | `.cached()`, `.stale()`, `.invalidates()` |
| Build a prompt | `definePrompt('name', { handler })` |
| Bridge Presenter to prompt | `PromptMessage.fromView(presenter.make(data, ctx))` |
