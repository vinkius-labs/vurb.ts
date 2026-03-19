# Runtime Guards

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add concurrency(max:5, queue:20) and egress(2MB) guards to the analytics tool, and use f.mutation() for all destructive actions to enable intent mutex."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">INFRASTRUCTURE SAFETY</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Agents burst. Systems crash.<br><span style="color:rgba(255,255,255,0.25)">Three guards prevent it.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Concurrency semaphore, egress byte limiter, and intent mutex — three built-in guards that protect your infra without touching the hot path when unconfigured.</div>
</div>

## Introduction {#introduction}

AI agents can fire tens of tool calls in rapid succession — burst invocations during chain-of-thought reasoning, oversized responses from unbounded queries, duplicate destructive calls when self-correcting. Without protection, a single LLM session can exhaust your database pool, crash Node.js with a 50MB response, or double-delete a user.

Vurb.ts provides three built-in runtime guards. Each has zero overhead when not configured — no conditionals in the hot path.

## Concurrency Guard {#concurrency}

Limits simultaneous executions per tool with a semaphore, backpressure queue, and load shedding:

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

const heavyReport = f.query('analytics.heavy_report')
  .describe('Generate a comprehensive analytics report')
  .concurrency({ max: 5, queueSize: 20 })
  .withString('range', 'Date range')
  .handle(async (input, ctx) => {
    return ctx.db.analytics.generateReport(input.range);
  });
```

When all 5 slots are occupied and the queue has space, the call waits in FIFO order. When the queue is also full, it's immediate rejection:

```xml
<tool_error>
  <error_code>SERVER_BUSY</error_code>
  <message>Tool "analytics" is at capacity (5 active, 20 queued).</message>
  <suggestion>Reduce concurrent calls. Send requests sequentially.</suggestion>
</tool_error>
```

Slots are freed in a `try/finally` — even if the handler throws or the abort signal fires. Queued waiters abort immediately on signal cancellation. The internal queue is deque-based for O(1) acquire/release.

## Egress Guard {#egress}

Prevents oversized responses from crashing Node.js or overflowing the LLM context window:

```typescript
const logSearch = f.query('logs.search')
  .describe('Search application logs')
  .egress(2 * 1024 * 1024)   // 2 MB max
  .withString('query', 'Search query')
  .handle(async (input, ctx) => {
    return ctx.db.logs.search(input.query);
  });
```

When exceeded, it truncates at a safe UTF-8 character boundary and injects:

```
[SYSTEM INTERVENTION: Payload truncated at 2.0MB to prevent memory crash.
You MUST use pagination (limit/offset) or filters to retrieve smaller result sets.]
```

### Egress Guard vs Presenter `.limit()` / `.agentLimit()`

Both truncate at different layers. Use both for defense in depth:

```typescript
import { createPresenter, t } from '@vurb/core';

// Domain guard — intelligent truncation with custom message
const UserPresenter = createPresenter('User')
  .schema({ id: t.string, name: t.string, email: t.string })
  .limit(50);

// Infrastructure guard — brute-force byte limit
const listUsers = f.query('users.list')
  .describe('List all users in the workspace')
  .egress(2 * 1024 * 1024)
  .returns(UserPresenter)
  .handle(async (input, ctx) => ctx.db.users.findMany());
```

`.limit()` / `.agentLimit()` operates on item count at the domain layer with custom guidance. `.egress()` operates on raw bytes at the infrastructure layer as a safety net.

> [!TIP]
> Presenter `.limit()` is the first line of defense — it truncates intelligently with domain context. Egress guard is the last-resort safety net for edge cases where the Presenter can't predict payload size (e.g. text blobs, nested data).

## Intent Mutex {#intent-mutex}

Serializes destructive actions automatically — no configuration needed. When an LLM fires two `delete_user` calls for the same ID in the same millisecond, both would normally execute before either returns. The intent mutex prevents this:

```typescript
const deleteUser = f.mutation('users.delete')
  .describe('Permanently delete a user and all their data')
  .withString('id', 'User ID to delete')
  .handle(async (input, ctx) => {
    await ctx.db.users.delete({ where: { id: input.id } });
    return { deleted: input.id };
  });

const listUsers = f.query('users.list')
  .describe('List all users')
  .handle(async (input, ctx) => ctx.db.users.findMany());
```

`users.delete` calls (from `f.mutation()`) execute in strict FIFO order. `users.list` (from `f.query()`) runs in parallel — zero overhead from the mutex. Serialization uses the action key as the lock key, so concurrent calls to different destructive actions run independently. The underlying async mutex uses promise chaining — no external locks, no Redis.

## Combined Configuration {#combined}

All three guards compose naturally:

```typescript
const analyticsQuery = f.query('analytics.query')
  .describe('Run a custom analytics query')
  .concurrency({ max: 3, queueSize: 10 })
  .egress(2 * 1024 * 1024)
  .withString('sql', 'SQL query')
  .withOptionalNumber('limit', 'Max rows (default 100)')
  .handle(async (input, ctx) => {
    return ctx.db.$queryRaw(input.sql);
  });
```

3 concurrent queries max, 10 queued, 2MB response cap. The intent mutex is automatic for any `f.mutation()` tool.

## Testing {#testing}

```typescript
import { describe, it, expect } from 'vitest';
import { initVurb, success } from '@vurb/core';

const f = initVurb<void>();

describe('Runtime Guards', () => {
  it('load-sheds when at capacity', async () => {
    const tool = f.query('billing.charge')
      .describe('Charge billing')
      .concurrency({ max: 1, queueSize: 0 })
      .handle(async () => {
        await new Promise(r => setTimeout(r, 100));
        return success('charged');
      });

    const first = tool.execute(undefined, { action: 'default' });
    const second = await tool.execute(undefined, { action: 'default' });

    expect(second.isError).toBe(true);
    expect(second.content[0].text).toContain('SERVER_BUSY');
    expect((await first).isError).toBeUndefined();
  });

  it('truncates oversized responses', async () => {
    const tool = f.query('logs.search')
      .describe('Search logs')
      .egress(2048)
      .handle(async () => success('x'.repeat(10_000)));

    const result = await tool.execute(undefined, { action: 'default' });
    expect(result.content[0].text).toContain('[SYSTEM INTERVENTION');
  });
});
```
