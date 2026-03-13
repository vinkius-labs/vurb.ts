# Rate Limiter

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [Why Rate Limiting Matters](#why)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Custom Stores](#custom-stores)
- [Key Functions](#key-functions)
- [Telemetry](#telemetry)
- [Headers](#headers)
- [API Reference](#api)

The Rate Limiter protects your MCP server from abuse — whether from a malfunctioning LLM that loops, a compromised client, or a legitimate user triggering expensive operations too frequently.


## Why Rate Limiting Matters {#why}

AI agents are non-deterministic. A single prompt can trigger 50 tool calls. A hallucinating agent can retry the same failing call indefinitely. Without rate limiting:

- **Cost explosion** — Each tool call may hit external APIs, databases, or paid LLMs
- **Resource exhaustion** — Connection pools drain, CPU spins, memory climbs
- **Cascading failure** — Downstream services receive unbounded traffic

The Rate Limiter middleware applies **per-key sliding-window** throttling before your handler executes:

```typescript
import { rateLimit } from '@vurb/core';

const billing = createTool('billing')
    .use(rateLimit({
        windowMs: 60_000,  // 1-minute window
        max: 100,          // 100 requests per window
        keyFn: (ctx) => ctx.userId,
    }))
    .action({ name: 'create', handler: async (ctx, args) => { /* ... */ } });
```


## How It Works {#how-it-works}

The sliding window tracks timestamps rather than counts. This prevents the "boundary burst" problem where a fixed window allows 2x requests at the boundary between two periods.

```text
Window: 60 seconds, Max: 5

Time:  0s           30s         60s          90s
       ├────┬───┬───┼───┬───────┼────────────┤
       R1   R2  R3  R4  R5      ← window slides
                         ↑ denied (5 in window)
```

The middleware follows a **two-phase** design:

1. **Increment** — Check current count in the window. If over limit → reject immediately
2. **Record** — Only after the request is confirmed under limit, record the timestamp

This separation means **rejected requests do not inflate the count**. An attacker who sends 1,000 requests sees the counter stay at `max`, not grow to 1,000.


## Configuration {#configuration}

```typescript
interface RateLimitConfig {
    /** Window duration in milliseconds */
    readonly windowMs: number;

    /** Maximum requests per window per key */
    readonly max: number;

    /** Extract a unique key per caller/tenant */
    readonly keyFn: (ctx: any) => string;

    /** Custom store (default: InMemoryStore) */
    readonly store?: RateLimitStore;

    /** Telemetry sink for rate-limit events */
    readonly telemetry?: TelemetrySink;
}
```

### Minimal Configuration

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => ctx.userId,
})
```

### Full Configuration

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => `${ctx.tenantId}:${ctx.userId}`,
    store: new RedisRateLimitStore(redis),
    telemetry: (event) => myCollector.push(event),
})
```


## Custom Stores {#custom-stores}

The default `InMemoryStore` works for single-process servers. For multi-instance deployments, implement the `RateLimitStore` interface:

```typescript
interface RateLimitStore {
    /** Check current count and get reset time. Does NOT record the request. */
    increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;

    /** Record a successful (non-rejected) request. */
    record(key: string): Promise<void> | void;
}
```

::: tip Two-Phase Design
The `increment` method only **checks** — it does not add the current request. Call `record()` only after confirming the request is under the limit. This prevents rejected requests from counting.
:::

### Redis Example

```typescript
class RedisRateLimitStore implements RateLimitStore {
    constructor(private redis: Redis) {}

    async increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
        const now = Date.now();
        const windowStart = now - windowMs;

        // Remove expired entries
        await this.redis.zremrangebyscore(key, 0, windowStart);

        // Count remaining entries (do NOT add yet)
        const count = await this.redis.zcard(key);

        return {
            count,
            resetMs: windowStart + windowMs,
        };
    }

    async record(key: string): Promise<void> {
        const now = Date.now();
        await this.redis.zadd(key, now, `${now}`);
    }
}
```


## Key Functions {#key-functions}

The `keyFn` determines the rate limit scope. Different keys give different isolation levels:

```typescript
// Per user — each user has their own limit
keyFn: (ctx) => ctx.userId

// Per tenant — all users in a tenant share a limit
keyFn: (ctx) => ctx.tenantId

// Per tenant + action — separate limits per action per tenant
keyFn: (ctx) => `${ctx.tenantId}:${ctx.action}`

// Global — one limit for all callers
keyFn: () => 'global'
```


## Telemetry {#telemetry}

Add a `telemetry` sink to emit `security.rateLimit` events:

```typescript
rateLimit({
    windowMs: 60_000,
    max: 100,
    keyFn: (ctx) => ctx.userId,
    telemetry: (event) => myCollector.push(event),
})
```

Events are emitted for **both** allowed and rejected requests:

```typescript
// Allowed
{
    type: 'security.rateLimit',
    allowed: true,
    remaining: 87,
    limit: 100,
    resetMs: 1710278460000,
    key: 'user_42',
    timestamp: 1710278400000,
}

// Rejected
{
    type: 'security.rateLimit',
    allowed: false,
    remaining: 0,
    limit: 100,
    resetMs: 1710278460000,
    key: 'user_42',
    timestamp: 1710278400000,
}
```


## Headers {#headers}

When a request is rate-limited, the error response includes rate limit metadata:

```typescript
toolError('RATE_LIMITED', {
    message: `Rate limit exceeded. Try again in ${retryAfterMs}ms.`,
    data: {
        limit: 100,
        remaining: 0,
        resetMs: 1710278460000,
    },
    recovery: {
        action: 'retry',
        suggestion: `Wait ${retryAfterMs}ms before retrying.`,
    },
})
```

The LLM receives a self-healing error with enough information to wait and retry.


## API Reference {#api}

### `rateLimit(config)`

Returns a `MiddlewareFn` that can be applied with `.use()`:

```typescript
const middleware = rateLimit({ windowMs: 60_000, max: 100, keyFn: (ctx) => ctx.userId });
const tool = createTool('billing').use(middleware);
```

### `InMemoryStore`

Default store. Automatically prunes expired entries on each `increment()` call.

```typescript
class InMemoryStore implements RateLimitStore {
    constructor(windowMs: number);
    increment(key: string, windowMs: number): { count: number; resetMs: number };
    record(key: string): void;
}
```

### `RateLimitStore` Interface

Implement this for external stores (Redis, Valkey, DynamoDB):

```typescript
interface RateLimitStore {
    increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
    record(key: string): Promise<void> | void;
}
```
