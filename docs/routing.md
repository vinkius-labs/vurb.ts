# Namespaces & Routing

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Set up file-based routing with tool groups — billing, users, analytics — with shared auth middleware and action discriminators."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">CONTEXT WINDOW OPTIMIZATION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">500 flat endpoints → 5 smart tools.<br><span style="color:rgba(255,255,255,0.25)">Action consolidation.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Instead of overwhelming the AI with hundreds of endpoints, Vurb hierarchically groups tools with discriminators — drastically reducing token consumption.</div>
</div>

## File-Based Routing — `autoDiscover()` {#auto-discover}

`autoDiscover()` scans a directory and registers all exported tools:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/server.ts</span>
</div>
<div style="padding:20px">

```typescript
import { initVurb, autoDiscover } from '@vurb/core';

const f = initVurb<AppContext>();
const registry = f.registry();

await autoDiscover(registry, './src/tools');
```

</div>
</div>

Your file structure becomes the routing table:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">directory → MCP tool names</span>
</div>
<div style="padding:20px">

```text
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   ├── pay.ts          → billing.pay
│   └── refund.ts       → billing.refund
├── users/
│   ├── list.ts         → users.list
│   ├── invite.ts       → users.invite
│   └── ban.ts          → users.ban
└── analytics/
    └── dashboard.ts    → analytics.dashboard
```

</div>
</div>

Add a file — it's registered. Delete a file — it's gone. Each tool file exports a builder:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/tools/billing/pay.ts</span>
</div>
<div style="padding:20px">

```typescript
import { f } from '../../vurb';

export default f.mutation('billing.pay')
  .describe('Process a payment for an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Payment amount')
  .handle(async (input, ctx) => {
    return await ctx.billing.charge(input.invoice_id, input.amount);
  });
```

</div>
</div>

Pair `autoDiscover()` with `vurb dev` for hot-reload. See the [HMR Dev Server](/cookbook/hmr-dev-server).

## Fluent Router — `f.router()` {#fluent-router}

When multiple tools share a prefix, middleware, and tags:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/routers/users.ts</span>
</div>
<div style="padding:20px">

```typescript
const users = f.router('users')
    .describe('User management')
    .use(requireAuth)
    .tags('core');

export const listUsers = users.query('list')
    .describe('List all users')
    .withOptionalNumber('limit', 'Max results')
    .handle(async (input, ctx) => {
        return ctx.db.users.findMany({ take: input.limit ?? 50 });
    });

export const banUser = users.mutation('ban')
    .describe('Permanently ban a user')
    .withString('user_id', 'User ID to ban')
    .handle(async (input, ctx) => {
        await ctx.db.users.update({ where: { id: input.user_id }, data: { banned: true } });
    });
```

</div>
</div>

### Semantic Verbs

| Method | Semantic Defaults |
|--------|------------------|
| `users.query('list')` | `readOnly: true` |
| `users.action('invite')` | No defaults (neutral) |
| `users.mutation('ban')` | `destructive: true` |

> [!TIP]
> Middleware added to the router via `.use()` runs on **every** child tool. Add tool-specific middleware via `.use()` on the individual builder.

## Discriminators {#discriminators}

When a tool has multiple actions, the framework compiles them behind a single MCP endpoint with an `enum` discriminator — reducing the LLM's cognitive load:

```jsonc
{
  "properties": {
    "action": { "type": "string", "enum": ["list", "create", "delete"] },
    "workspace_id": { "type": "string" },
    "name": { "type": "string" }
  }
}
```

The `action` field forces the agent to select from a constrained enum instead of guessing between similar tool names.

## Common Schema {#shared-schemas}

With `createTool()`, inject common parameters into every action:

```typescript
const projects = createTool<AppContext>('projects')
  .description('Manage workspace projects')
  .commonSchema(z.object({
    workspace_id: z.string().describe('Workspace identifier'),
  }))
  .action({
    name: 'list',
    readOnly: true,
    handler: async (ctx, args) => {
      return success(await ctx.db.projects.findMany({
        where: { workspaceId: args.workspace_id },
      }));
    },
  })
  .action({
    name: 'create',
    schema: z.object({ name: z.string() }),
    handler: async (ctx, args) => {
      return success(await ctx.db.projects.create({
        workspaceId: args.workspace_id,
        name: args.name,
      }));
    },
  });
```

> [!TIP]
> With the Fluent API (`f.query()` / `f.mutation()`), each tool defines its own params. Use `createTool()` with `.commonSchema()` when you need a shared field across actions behind a single MCP endpoint.

## Hierarchical Groups {#hierarchical}

Groups organize actions into namespaces, each with its own middleware:

```typescript
const platform = createTool<AppContext>('platform')
    .description('Central API for the Platform')
    .commonSchema(z.object({
        workspace_id: z.string().describe('Workspace ID'),
    }))
    .use(authMiddleware)
    .group('users', 'User management', g => {
        g.use(requireAdmin)
         .action({ name: 'invite', schema: z.object({ email: z.string() }), handler: inviteUser })
         .action({ name: 'ban', destructive: true, schema: z.object({ user_id: z.string() }), handler: banUser });
    })
    .group('billing', 'Billing operations', g => {
        g.action({ name: 'refund', destructive: true, schema: z.object({ invoice_id: z.string() }), handler: issueRefund });
    });
```

Discriminator values become dot-notation paths: `users.invite`, `users.ban`, `billing.refund`.

## Tool Exposition {#exposition}

By default, grouped actions expand into independent flat tools. To keep grouped behavior:

```typescript
registry.attachToServer(server, { toolExposition: 'grouped' });
```

See the [Tool Exposition Guide](/tool-exposition) for the full comparison.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/middleware" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">GUARD</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Middleware</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Auth, rate limiting, logging.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/error-handling" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">RECOVERY</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Error Handling</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Self-healing errors for AI agents.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/tool-exposition" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">EXPOSITION</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Tool Exposition</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Flat vs grouped tool discovery.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>