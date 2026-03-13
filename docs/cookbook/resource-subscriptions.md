# Resource Subscriptions

::: info Prerequisites
Install Vurb.ts before following this recipe: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [The Polling Problem](#problem)
- [Quick Start](#quickstart)
- [Subscribable vs Static Resources](#subscribable-vs-static)
- [URI Templates](#uri-templates)
- [Push Notifications](#push-notifications)
- [Annotations](#annotations)
- [Registry Integration](#registry-integration)
- [Tools vs Resources](#comparison)

## Introduction {#introduction}

MCP Resources expose data to AI agents. Tools execute actions — resources provide data. An agent reads a resource the same way a browser fetches a URL: it requests an URI and receives content.

Resource Subscriptions go further. Instead of the agent polling for changes, the server **pushes** an update notification when data changes — real-time stock prices, deploy pipeline status, live error logs. The agent subscribes once and receives `notifications/resources/updated` whenever the underlying data changes.

Vurb.ts implements the full MCP resource subscription lifecycle: `resources/list`, `resources/read`, `resources/subscribe`, and `resources/unsubscribe`. Zero overhead when not configured.

## The Polling Problem {#problem}

```text
Agent: reads deploy://status/staging → stage: "building", progress: 45%
Agent: waits 30 seconds
Agent: reads deploy://status/staging → stage: "building", progress: 47%
Agent: waits 30 seconds
Agent: reads deploy://status/staging → stage: "deploying", progress: 90%
```

The agent wastes tokens polling for changes. With subscriptions:

```text
Agent: reads deploy://status/staging → stage: "building", progress: 45%
Agent: subscribes to deploy://status/staging
  — notification: deploy://status/staging updated —
Agent: reads deploy://status/staging → stage: "deploying", progress: 90%
```

One subscription. Zero wasted polls. The server tells the agent exactly when to re-read.

## Quick Start {#quickstart}

### Define a Resource

Use `f.resource(name)` to define a resource with the chainable builder. The handler receives the requested URI and your application context:

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb<AppContext>();

const stockPrice = f.resource('stock_price')
  .uri('stock://prices/{symbol}')
  .describe('Real-time stock price for a given symbol')
  .mimeType('application/json')
  .subscribable()
  .handle(async (uri, ctx) => {
    const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
    const price = await ctx.stockApi.getPrice(symbol);
    return { text: JSON.stringify({ symbol, price, updatedAt: new Date() }) };
  });
```

### Alternative: `defineResource()`

For projects that prefer explicit factory functions:

```typescript
import { defineResource } from '@vurb/core';

const stockPrice = defineResource<AppContext>('stock_price', {
  uri: 'stock://prices/{symbol}',
  description: 'Real-time stock price for a given symbol',
  mimeType: 'application/json',
  subscribable: true,
  handler: async (uri, ctx) => {
    const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
    const price = await ctx.stockApi.getPrice(symbol);
    return { text: JSON.stringify({ symbol, price, updatedAt: new Date() }) };
  },
});
```

### Register and Attach

Create a `ResourceRegistry`, register your resources, and pass it to `attachToServer()`:

```typescript
import { ToolRegistry, ResourceRegistry, defineResource } from '@vurb/core';

const toolRegistry = new ToolRegistry<AppContext>();
const resourceRegistry = new ResourceRegistry<AppContext>();

resourceRegistry.register(stockPrice);
resourceRegistry.register(deployStatus);

toolRegistry.attachToServer(server, {
  contextFactory: createContext,
  resources: resourceRegistry,
});
```

When `resources` is provided, the framework automatically registers four MCP handlers:

| Handler | Purpose |
|---|---|
| `resources/list` | Returns all registered resource definitions |
| `resources/read` | Reads resource content by URI |
| `resources/subscribe` | Subscribes to push notifications for a URI |
| `resources/unsubscribe` | Removes an existing subscription |

When `resources` is omitted, none of these handlers are registered — zero overhead.

## Subscribable vs Static Resources {#subscribable-vs-static}

Not every resource needs subscriptions. Reference data (country codes, system config) changes so rarely that push notifications add no value. Mark only volatile resources as subscribable:

```typescript
// Static — no subscriptions, read-only reference data
const countries = defineResource<AppContext>('countries', {
  uri: 'reference://countries',
  description: 'List of country codes (ISO 3166-1)',
  handler: async () => ({
    text: JSON.stringify(COUNTRY_LIST),
  }),
});

// Subscribable — live data, changes frequently
const deployStatus = defineResource<AppContext>('deploy_status', {
  uri: 'deploy://status/{environment}',
  description: 'Real-time deploy pipeline status',
  subscribable: true,
  handler: async (uri, ctx) => {
    const env = uri.match(/deploy:\/\/status\/(.+)/)?.[1];
    const status = await ctx.deploys.getStatus(env);
    return { text: JSON.stringify(status) };
  },
});
```

When a client calls `resources/subscribe` on a non-subscribable resource, the framework responds gracefully without error — the subscription is simply not tracked.

## URI Templates {#uri-templates}

Resources use URI templates with `{placeholder}` segments. The framework matches incoming read requests against registered templates:

```typescript
// Template: stock://prices/{symbol}
// Matches: stock://prices/AAPL, stock://prices/GOOG, stock://prices/TSLA

const stockPrice = defineResource('stock_price', {
  uri: 'stock://prices/{symbol}',
  handler: async (uri) => {
    const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
    return { text: JSON.stringify({ symbol, price: 142.50 }) };
  },
});
```

Subscriptions are per-URI, not per-template. A client subscribing to `stock://prices/AAPL` receives notifications only for that specific URI — not for `stock://prices/GOOG`.

## Push Notifications {#push-notifications}

After an external system notifies the server that data has changed, the framework sends `notifications/resources/updated` to all subscribed clients:

```typescript
// External webhook handler or background job
async function onStockPriceChanged(symbol: string) {
  await resourceRegistry.notifyUpdated(`stock://prices/${symbol}`);
  // → All agents subscribed to stock://prices/AAPL receive a notification
  // → Agents then call resources/read to get the new value
}
```

Notifications are **best-effort**. If the transport fails (client disconnected, SSE stream closed), the notification is silently dropped — it never blocks the pipeline.

> [!IMPORTANT]
> Notifications tell the agent *that* data changed, not *what* changed. The agent must call `resources/read` to get the updated content. This avoids pushing potentially large payloads through the notification channel.

### Lifecycle Sync

When resources are added or removed at runtime, call `notifyChanged()` to send `notifications/resources/list_changed`:

```typescript
// Register a new resource dynamically
resourceRegistry.register(newResource);
resourceRegistry.notifyChanged();
// → Agents receive notifications/resources/list_changed
// → Agents call resources/list to discover the new resource
```

Calls to `notifyChanged()` are **debounced** — 10 rapid-fire calls within 100ms coalesce into a single notification.

## Annotations {#annotations}

MCP resource annotations communicate audience and priority to clients:

```typescript
const internalMetrics = defineResource('internal_metrics', {
  uri: 'metrics://internal/system',
  description: 'Internal system health metrics',
  annotations: {
    audience: ['assistant'],  // Not for human display
    priority: 0.3,            // Low priority — background data
  },
  handler: async (_, ctx) => ({
    text: JSON.stringify(await ctx.metrics.getSystemHealth()),
  }),
});
```

| Field | Type | Meaning |
|---|---|---|
| `audience` | `('user' \| 'assistant')[]` | Who this resource is intended for |
| `priority` | `number` (0–1) | Relative importance for ordering |

## Registry Integration {#registry-integration}

The `ResourceRegistry` provides query methods for programmatic access:

```typescript
const registry = new ResourceRegistry<AppContext>();
registry.registerAll(stockPrice, deployStatus, countries);

// Query
registry.size;                    // 3
registry.has('stock_price');      // true
registry.hasSubscribableResources; // true

// List all definitions (for custom dashboards)
const defs = registry.listResources();
// [{ uri: 'stock://prices/{symbol}', name: 'stock_price', ... }, ...]

// Access the subscription manager
registry.subscriptions.size;      // number of active subscriptions
registry.subscriptions.isSubscribed('stock://prices/AAPL'); // boolean

// Clear everything
registry.clear();
```

## Tools vs Resources {#comparison}

| Characteristic | Tools | Resources |
|---|---|---|
| Who triggers | LLM during reasoning | LLM or user-initiated |
| Direction | Request → Response | Request → Content |
| Mutation | Can create/update/delete data | Read-only data exposure |
| Push updates | No (use State Sync for invalidation) | Yes (`resources/subscribe`) |
| Typed handler | `(ctx, args) => ToolResponse` | `(uri, ctx) => ResourceContent` |
| MCP protocol | `tools/list`, `tools/call` | `resources/list`, `resources/read` |
| Use case | Execute actions, orchestrate workflows | Expose live data feeds |

Tools are for **doing**. Resources are for **reading**. Use State Sync to tell agents when tool data is stale. Use Resource Subscriptions to push real-time data updates.

> [!TIP]
> Resources and tools coexist on the same server. An agent can call `tools/list` to discover available actions and `resources/list` to discover available data feeds — both powered by the same `attachToServer()` call.
