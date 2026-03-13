# Resource Subscriptions

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [The Polling Problem](#problem)
- [Defining Resources](#defining)
- [Subscribable vs Static](#subscribable-vs-static)
- [URI Templates](#uri-templates)
- [Push Notifications](#push-notifications)
- [Lifecycle Sync](#lifecycle-sync)
- [Annotations](#annotations)
- [Registry Integration](#registry-integration)
- [Tools vs Resources](#comparison)
- [API Reference](#api)

## Introduction {#introduction}

MCP Resources expose data to AI agents. Tools execute actions — resources provide content. An agent reads a resource the same way a browser fetches a URL: it sends a URI and receives structured content.

Resource Subscriptions extend this model with **real-time push notifications**. Instead of polling for changes, the server notifies the agent when data changes — stock prices, deploy pipeline status, live error logs. The agent subscribes once and receives `notifications/resources/updated` whenever the underlying data changes.

Vurb.ts implements the full MCP resource subscription lifecycle: `resources/list`, `resources/read`, `resources/subscribe`, and `resources/unsubscribe`. Zero overhead when not configured — omit the `resources` option on `attachToServer()` and nothing runs.

## The Polling Problem {#problem}

Without subscriptions, agents waste tokens polling for changes:

```text
Agent: reads deploy://status/staging → stage: "building", progress: 45%
Agent: waits 30 seconds
Agent: reads deploy://status/staging → stage: "building", progress: 47%
Agent: waits 30 seconds
Agent: reads deploy://status/staging → stage: "deploying", progress: 90%
```

Three reads, two wasted. With subscriptions:

```text
Agent: reads deploy://status/staging → stage: "building", progress: 45%
Agent: subscribes to deploy://status/staging
  — notification: deploy://status/staging updated —
Agent: reads deploy://status/staging → stage: "deploying", progress: 90%
```

One subscription. Zero wasted polls. The server tells the agent exactly when to re-read.

## Defining Resources {#defining}

### Fluent Builder (Recommended)

Use `f.resource(name)` for a chainable builder. The handler receives the requested URI and your application context:

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

| Method | What It Does |
|---|---|
| `.uri(template)` | URI template with `{placeholder}` segments |
| `.describe(text)` | Human-readable description for the agent |
| `.mimeType(type)` | Content MIME type (`application/json`, `text/plain`, etc.) |
| `.subscribable()` | Enables `resources/subscribe` for this resource |
| `.annotations(meta)` | MCP audience and priority metadata |
| `.handle(fn)` | **Terminal** — sets `(uri, ctx) => Promise<ResourceContent>` handler |

### Config-Bag (Alternative)

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
import { ToolRegistry, ResourceRegistry } from '@vurb/core';

const toolRegistry = new ToolRegistry<AppContext>();
const resourceRegistry = new ResourceRegistry<AppContext>();

resourceRegistry.register(stockPrice);
resourceRegistry.register(deployStatus);

toolRegistry.attachToServer(server, {
  contextFactory: createContext,
  resources: resourceRegistry,
});
```

When `resources` is provided, four MCP handlers are registered automatically:

| Handler | Purpose |
|---|---|
| `resources/list` | Returns all registered resource definitions |
| `resources/read` | Reads resource content by URI |
| `resources/subscribe` | Accepts a push subscription for a URI |
| `resources/unsubscribe` | Removes an existing subscription |

When `resources` is omitted, none of these handlers are registered — zero overhead.

## Subscribable vs Static {#subscribable-vs-static}

Not every resource needs subscriptions. Reference data (country codes, system config) changes so rarely that push notifications add no value. Mark only volatile resources as subscribable:

```typescript
// Static — read-only reference data, no subscriptions
const countries = f.resource('countries')
  .uri('reference://countries')
  .describe('List of country codes (ISO 3166-1)')
  .handle(async () => ({
    text: JSON.stringify(COUNTRY_LIST),
  }));

// Subscribable — live data, changes frequently
const deployStatus = f.resource('deploy_status')
  .uri('deploy://status/{environment}')
  .describe('Real-time deploy pipeline status')
  .subscribable()
  .handle(async (uri, ctx) => {
    const env = uri.match(/deploy:\/\/status\/(.+)/)?.[1];
    const status = await ctx.deploys.getStatus(env);
    return { text: JSON.stringify(status) };
  });
```

When a client calls `resources/subscribe` on a non-subscribable resource, the framework responds gracefully without error — the subscription is simply not tracked.

## URI Templates {#uri-templates}

Resources use URI templates with `{placeholder}` segments. The framework matches incoming read requests against registered templates:

```typescript
// Template: stock://prices/{symbol}
// Matches: stock://prices/AAPL, stock://prices/GOOG, stock://prices/TSLA

const stockPrice = f.resource('stock_price')
  .uri('stock://prices/{symbol}')
  .handle(async (uri) => {
    const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
    return { text: JSON.stringify({ symbol, price: 142.50 }) };
  });
```

Subscriptions are **per-URI**, not per-template. A client subscribing to `stock://prices/AAPL` receives notifications only for that specific URI — not for `stock://prices/GOOG`.

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

## Lifecycle Sync {#lifecycle-sync}

When resources are added or removed at runtime, call `notifyChanged()` to send `notifications/resources/list_changed`:

```typescript
// Register a new resource dynamically
resourceRegistry.register(newResource);
resourceRegistry.notifyChanged();
// → Agents receive notifications/resources/list_changed
// → Agents call resources/list to discover the new resource
```

Calls to `notifyChanged()` are **debounced** — rapid-fire calls within 100ms coalesce into a single notification.

## Annotations {#annotations}

MCP resource annotations communicate audience and priority to clients:

```typescript
const internalMetrics = f.resource('internal_metrics')
  .uri('metrics://internal/system')
  .describe('Internal system health metrics')
  .annotations({
    audience: ['assistant'],  // Not for human display
    priority: 0.3,            // Low priority — background data
  })
  .handle(async (_, ctx) => ({
    text: JSON.stringify(await ctx.metrics.getSystemHealth()),
  }));
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
| Push updates | No (use [State Sync](/state-sync) for invalidation) | Yes (`resources/subscribe`) |
| Typed handler | `(ctx, args) => ToolResponse` | `(uri, ctx) => ResourceContent` |
| MCP protocol | `tools/list`, `tools/call` | `resources/list`, `resources/read` |
| Use case | Execute actions, orchestrate workflows | Expose live data feeds |

Tools are for **doing**. Resources are for **reading**. Use [State Sync](/state-sync) to tell agents when tool data is stale. Use Resource Subscriptions to push real-time data updates.

> [!TIP]
> Resources and tools coexist on the same server. An agent can call `tools/list` to discover available actions and `resources/list` to discover available data feeds — both powered by the same `attachToServer()` call.

## API Reference {#api}

### `f.resource(name)` — Fluent Builder

Returns `FluentResourceBuilder<TContext>`. Chain `.uri()`, `.describe()`, `.mimeType()`, `.subscribable()`, `.annotations()`, `.handle()`.

### `defineResource(name, config)` — Config-Bag

Returns `ResourceBuilder<TContext>`.

### `ResourceRegistry<TContext>`

| Method | Description |
|---|---|
| `register(builder)` | Register a single resource |
| `registerAll(...builders)` | Register multiple resources |
| `listResources()` | List all registered resource definitions |
| `readResource(uri, ctx)` | Read resource content by URI |
| `subscribe(uri)` | Accept a subscription for the given URI |
| `unsubscribe(uri)` | Remove a subscription for the given URI |
| `notifyUpdated(uri)` | Send `notifications/resources/updated` to subscribers |
| `notifyChanged()` | Send `notifications/resources/list_changed` (debounced 100ms) |
| `has(name)` | Check if a resource is registered |
| `clear()` | Remove all registered resources |
| `size` | Count of registered resources |
| `hasSubscribableResources` | `true` if any resource is subscribable |
| `subscriptions` | Access the `SubscriptionManager` |

### `SubscriptionManager`

| Property / Method | Description |
|---|---|
| `size` | Number of active subscriptions |
| `isSubscribed(uri)` | Check if a URI has an active subscription |

### Core Types

| Type | Shape |
|---|---|
| `ResourceContent` | `{ text: string } \| { blob: string }` |
| `ResourceDefinition` | `{ uri, name, description?, mimeType?, subscribable?, annotations? }` |
| `ResourceAnnotations` | `{ audience?: ('user' \| 'assistant')[], priority?: number }` |
