# Middleware

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add auth middleware that validates JWT, injects tenant context, rate-limits by API key, and logs every tool call to an audit trail."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">CROSS-CUTTING CONCERNS</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Auth, audit, rate limiting.<br><span style="color:rgba(255,255,255,0.25)">Write once, apply everywhere.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Without middleware, you'd duplicate auth checks in every handler. Middleware extracts concerns into reusable, composable functions — fully typed context derivation at every step.</div>
</div>

<!-- Split-screen: Without vs With -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">
<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">WITHOUT MIDDLEWARE</span>
<div style="margin-top:12px">

```typescript
// ❌ Repeated in EVERY handler
.handle(async (input, ctx) => {
  const session = await checkAuth(ctx.token);
  if (!session) throw new Error('Unauthorized');
  if (!session.isAdmin) throw new Error('Forbidden');
  await ctx.db.auditLogs.create({ ... });
  // ...finally, the actual logic
})
```

</div>
</div>
<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">WITH MIDDLEWARE</span>
<div style="margin-top:12px">

```typescript
// ✅ Defined once, applied everywhere
const requireAuth = f.middleware(async (ctx) => {
  const user = await db.getUser(ctx.token);
  if (!user) throw new Error('Unauthorized');
  return { user, permissions: user.permissions };
});
```

</div>
</div>
</div>

## f.middleware() — Context Derivation {#f-middleware}

The primary pattern. Create a middleware that derives data and injects it into context — like tRPC's `.use()`:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/middleware/auth.ts</span>
</div>
<div style="padding:20px">

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

const requireAuth = f.middleware(async (ctx) => {
  const user = await db.getUser(ctx.token);
  if (!user) throw new Error('Unauthorized');
  return { user, permissions: user.permissions };
});
```

</div>
</div>

The returned object merges into `ctx` via `Object.assign`. Downstream handlers see `ctx.user` and `ctx.permissions` — fully typed, no annotations.

> [!TIP]
> `f.middleware()` returns a `MiddlewareDefinition`. Call `.toMiddlewareFn()` when passing it to a tool or group that expects a raw `MiddlewareFn`.

## defineMiddleware() — Standalone Packages {#define-middleware}

Same as `f.middleware()` but without needing an `initVurb()` instance — for shared utility packages:

```typescript
import { defineMiddleware } from '@vurb/core';

const addTenant = defineMiddleware(async (ctx: { orgId: string }) => {
  const tenant = await db.getTenant(ctx.orgId);
  return { tenant };
});
```

Use `defineMiddleware()` when building reusable middleware libraries that don't know the application's context type.

## Per-Tool .use() — Inline Chain {#per-tool}

Apply middleware to a single tool with `.use()`. Stack multiple calls for layered derivations:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">tools/admin/sensitive.ts</span>
</div>
<div style="padding:20px">

```typescript
export const sensitiveTool = f.query('admin.sensitive_data')
  .describe('Access restricted data')
  .use(async ({ ctx, next }) => {
    const session = await checkAuth(ctx.token);
    if (!session) throw new Error('Unauthorized');
    return next({ ...ctx, session });
  })
  .use(async ({ ctx, next }) => {
    if (!ctx.session.permissions.includes('read:sensitive')) {
      throw new Error('Insufficient permissions');
    }
    return next({ ...ctx, canReadSensitive: true });
  })
  .handle(async (input, ctx) => {
    // ctx.session AND ctx.canReadSensitive are both typed
    return ctx.db.sensitiveData.findMany();
  });
```

</div>
</div>

::: warning Architect's Check
Verify that auth middleware runs BEFORE business logic. If your AI agent stacked `.use()` calls in the wrong order — permissions check before authentication — the chain will fail silently. **Order matters.**
:::

## Raw MiddlewareFn {#raw}

For before/after hooks that need to wrap `next()` directly:

```typescript
import { type MiddlewareFn } from '@vurb/core';

const loggingMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  console.log(`[${new Date().toISOString()}] Action called`);
  const result = await next();
  console.log(`[${new Date().toISOString()}] Action completed`);
  return result;
};
```

Call `next()` to continue to the next middleware or handler. Don't call it to block the request.

---

## Execution Order {#order}

Middleware executes in declaration order, outermost first:

<!-- Feature grid: execution flow -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(129,140,248,0.15);border-radius:10px;background:#09090f;padding:20px 24px;text-align:center">
<div style="font-size:22px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif">01</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:4px">Global</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px">Registry-level middleware</div>
</div>

<div style="border:1px solid rgba(34,211,238,0.15);border-radius:10px;background:#09090f;padding:20px 24px;text-align:center">
<div style="font-size:22px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif">02</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:4px">Per-Tool .use()</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px">Tool-specific derivations</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:10px;background:#09090f;padding:20px 24px;text-align:center">
<div style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif">03</div>
<div style="font-size:13px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:4px">.handle()</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px">Your business logic</div>
</div>

</div>

Each step can:
- **Enrich**: Return `next({ ...ctx, newProp })` to add properties
- **Guard**: Throw or return an error to halt execution
- **Observe**: Call `const result = await next()` to run after the handler

## Pre-Compilation {#pre-compilation}

Middleware chains are compiled at registration time into a single nested function. No array iteration, no allocation per request:

```typescript
// What the compiler produces (conceptual):
const chain = (ctx, args) =>
  loggingMiddleware(ctx, args, () =>
    authMiddleware(ctx, args, () =>
      handler(ctx, args)
    )
  );
```

At runtime, handler execution is a `Map.get()` lookup + one function call. **O(1) dispatch.**

---

## Common Patterns {#patterns}

<!-- Feature grid: patterns -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0">

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(239,68,68,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Authentication Guard</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Block unauthenticated requests with <code style="font-size:10px">error()</code></div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(245,158,11,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Role Factory</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif"><code style="font-size:10px">requireRole('admin', 'editor')</code> — parametric guard</div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(34,211,238,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Audit Logging</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Capture result AFTER handler with <code style="font-size:10px">await next()</code></div>
</div>

<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(52,211,153,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Stacking Derivations</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Compose <code style="font-size:10px">withDatabase</code> + <code style="font-size:10px">withCurrentUser</code></div>
</div>

</div>

### Authentication Guard

```typescript
const authMiddleware: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  if (!ctx.session?.userId) {
    return error('Authentication required. Missing token.');
  }
  return next();
};
```

### Role Factory

```typescript
function requireRole(...roles: string[]): MiddlewareFn<AppContext> {
  return async (ctx, args, next) => {
    if (!roles.includes(ctx.role)) {
      return error(`Forbidden: requires one of [${roles.join(', ')}]`);
    }
    return next();
  };
}
```

### Audit Logging

Capture the result **after** the handler completes:

```typescript
const auditLog: MiddlewareFn<AppContext> = async (ctx, args, next) => {
  const result = await next();
  await ctx.db.auditLogs.create({
    data: {
      userId: ctx.session.userId,
      action: args.action as string,
      timestamp: new Date(),
    },
  });
  return result;
};
```

### Stacking Derivations

```typescript
const withDatabase = f.middleware(async (ctx) => {
  const db = await getDbConnection(ctx.tenantId);
  return { db };
});

const withCurrentUser = f.middleware(async (ctx) => {
  const user = await ctx.db.users.findUnique({ where: { id: ctx.userId } });
  return { user, isAdmin: user?.role === 'admin' };
});
```

> [!NOTE]
> `resolveMiddleware(mw)` accepts either `MiddlewareFn` or `MiddlewareDefinition` and returns a `MiddlewareFn`. Useful for accepting middleware from external packages.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/routing" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">ROUTING</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Namespaces & Groups</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">File-based routing + fluent router.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/error-handling" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">RECOVERY</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Error Handling</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Self-healing errors for AI agents.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/presenter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">VIEW</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Presenter</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Shape what the LLM sees.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>
