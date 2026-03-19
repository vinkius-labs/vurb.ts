# AWS Connector

<a href="https://www.npmjs.com/package/@vurb/aws"><img src="https://img.shields.io/npm/v/@vurb/aws?color=blue" alt="npm" /></a>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Auto-discover all AWS Lambda functions tagged with mcp:expose=true and register them as grouped MCP tools with MVA Presenters and auth middleware."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">CLOUD NATIVE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Lambda + Step Functions.<br><span style="color:rgba(255,255,255,0.25)">Auto-discovered as MCP tools.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Tag filtering controls what the AI can see. The MVA pipeline — Presenters, middleware, egress firewall — applies before results leave your process.</div>
</div>


```typescript
import { createAwsConnector } from '@vurb/aws';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SFNClient } from '@aws-sdk/client-sfn';
import { createLambdaAdapter, createSfnAdapter } from '@vurb/aws';
import { defineTool, ToolRegistry } from '@vurb/core';

const connector = await createAwsConnector({
  lambdaClient: await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' })),
  sfnClient: await createSfnAdapter(new SFNClient({ region: 'us-east-1' })),
  enableLambda: true,
  enableStepFunctions: true,
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
});

const registry = new ToolRegistry();
for (const tool of connector.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}
```

## Install {#install}

```bash
npm install @vurb/aws
```

Peer dependencies: `Vurb.ts`, `@aws-sdk/client-lambda` (optional), `@aws-sdk/client-sfn` (optional).

## Resource Tagging Convention {#tagging}

The connector discovers AWS resources via **tags**. Only resources with the `mcp:expose = true` tag are visible to the AI.

| Tag | Example | Purpose |
|-----|---------|---------|
| `mcp:expose` | `true` | Opt-in — resource becomes an MCP tool |
| `mcp:group` | `users` | Groups multiple resources into a single multi-action tool |
| `mcp:action` | `create` | Action name within a group (default: `execute`) |
| `mcp:readOnly` | `true` | Marks the action as read-only |
| `mcp:destructive` | `true` | Marks the action as destructive |
| `mcp:sfn-type` | `express` | Overrides the Step Function execution type |

```
┌─────────────────────────────┐
│ mcp:expose    = true        │    ──→  Visible to AI
│ mcp:group     = users       │    ──→  Grouped under "users" tool
│ mcp:action    = create      │    ──→  Action: users.create
│ mcp:readOnly  = true        │    ──→  Annotation: readOnly
└─────────────────────────────┘
```

## Dynamic Ingestion {#ingestion}

`createAwsConnector` calls the AWS APIs at boot, fetches all Lambda functions and Step Functions matching your tags, and compiles them into `SynthesizedToolConfig` instances. Untagged resources (internal functions, cron handlers) stay invisible to the AI.

```typescript
const connector = await createAwsConnector({
  lambdaClient: await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' })),
  enableLambda: true,
  tagFilter: { 'mcp:expose': 'true', 'team': 'platform' }, // Custom filter
});

for (const tool of connector.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}
```

## Grouping — Multi-Action Tools {#grouping}

Lambdas and Step Functions with the same `mcp:group` tag are merged into a single tool with multiple actions. This reduces tool sprawl and makes the AI's tool list cleaner.

```
Tag: mcp:group=users, mcp:action=create  →  Lambda: CreateUser
Tag: mcp:group=users, mcp:action=list    →  Lambda: ListUsers
Tag: mcp:group=users, mcp:action=delete  →  Lambda: DeleteUser

Result: ONE tool "users" with actions: create, list, delete
```

```typescript
// AI sees: tools/call users { action: "create", ... }
// AI sees: tools/call users { action: "list", ... }
// AI sees: tools/call users { action: "delete", ... }
```

## Step Functions — Express vs Standard {#step-functions}

The connector handles both execution types automatically:

| Type | Behavior | Response |
|------|----------|----------|
| **EXPRESS** | Synchronous — blocks until completion | Returns parsed output |
| **STANDARD** | Async fire-and-forget | Returns execution ARN + cognitive rule |

Standard Step Functions return a Long-Running Operation (LRO) with a cognitive instruction that prevents the LLM from hallucinating completion:

```json
{
  "status": "RUNNING",
  "executionArn": "arn:aws:states:us-east-1:123:execution:OrderPipeline:abc-123",
  "_instruction": "CRITICAL: This is a long-running background process. Do NOT assume completion or fabricate results. Inform the user that the process has been started and is now running."
}
```

## MVA Interception {#mva}

The package produces `SynthesizedToolConfig` instances, not a server. Attach Presenters and middleware before registration:

```typescript
const salesPresenter = createPresenter('sales_view', {
  shape: (raw) => ({
    id: raw.customerId,
    name: raw.customerName,
    revenue: raw.totalRevenue,
  }),
});

for (const tool of connector.tools()) {
  const builder = defineTool(tool.name, {
    ...tool.config,
    actions: {
      execute: {
        ...tool.config.actions.execute,
        presenter: salesPresenter,
      },
    },
  });

  builder.use(async (ctx, next) => {
    if (!ctx.auth?.hasScope('aws:invoke')) throw new Error('Unauthorized');
    return next();
  });

  registry.register(builder);
}
```

## Surgical Construction {#surgical}

For critical routes where auto-discovery is too permissive, use `defineAwsTool()` with strict control:

```typescript
import { defineAwsTool } from '@vurb/aws';

// Lambda
const deploy = defineAwsTool('deploy_staging', client, {
  arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy',
  description: 'Deploy a branch to the staging environment.',
  annotations: { destructiveHint: true },
});

// Step Function (detected from ARN)
const report = defineAwsTool('generate_report', client, {
  arn: 'arn:aws:states:us-east-1:123456789:stateMachine:QuarterlyReport',
  description: 'Generate quarterly revenue report.',
  annotations: { readOnlyHint: true },
});

registry.register(defineTool(deploy.name, deploy.config));
registry.register(defineTool(report.name, report.config));
```

ARN detection: `arn:aws:lambda:...` → invokes synchronously. `arn:aws:states:...` → invokes via `startSyncExecution`.

## Live State Sync {#state-sync}

Background polling detects resource tag changes and fires `notifications/tools/list_changed` so the LLM client refreshes automatically:

```typescript
const connector = await createAwsConnector({
  lambdaClient: await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' })),
  enableLambda: true,
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
  onError: (err) => console.error('AWS poll failed:', err),
});

process.on('SIGTERM', () => { connector.stop(); process.exit(0); });
```

The fingerprint includes tool names, descriptions, and action annotations — any change triggers `onChange`.

## Full Production Example {#production}

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defineTool, ToolRegistry, createServerAttachment } from '@vurb/core';
import { createAwsConnector, createLambdaAdapter, createSfnAdapter, defineAwsTool } from '@vurb/aws';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SFNClient } from '@aws-sdk/client-sfn';

// ── Adapters (IoC — bring your own configured clients) ──
const lambdaAdapter = await createLambdaAdapter(new LambdaClient({ region: 'us-east-1' }));
const sfnAdapter = await createSfnAdapter(new SFNClient({ region: 'us-east-1' }));

// ── Auto-discovery ──
const connector = await createAwsConnector({
  lambdaClient: lambdaAdapter,
  sfnClient: sfnAdapter,
  enableLambda: true,
  enableStepFunctions: true,
  pollInterval: 60_000,
  onChange: () => server.notification({ method: 'notifications/tools/list_changed' }),
  onError: (err) => console.error('AWS poll error:', err),
});

const registry = new ToolRegistry();
for (const tool of connector.tools()) {
  registry.register(defineTool(tool.name, tool.config));
}

// ── Surgical override ──
const deploy = defineAwsTool('deploy_production', connector.client, {
  arn: 'arn:aws:lambda:us-east-1:123456789:function:deploy-prod',
  description: 'Deploy to production. Requires manager approval.',
  annotations: { destructiveHint: true },
});
const builder = defineTool(deploy.name, deploy.config);
builder.use(async (ctx, next) => {
  if (!ctx.headers?.['x-manager-token']) throw new Error('Manager approval required');
  return next();
});
registry.register(builder);

// ── Server ──
const server = new McpServer({ name: 'aws-automations', version: '1.0.0' });
createServerAttachment(server, registry);
await server.connect(new StdioServerTransport());

process.on('SIGTERM', () => { connector.stop(); process.exit(0); });
```

## Configuration Reference {#config}

### `createAwsConnector(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `lambdaClient` | `LambdaAdapter` | — | Lambda adapter (from `createLambdaAdapter()`) |
| `sfnClient` | `SfnAdapter` | — | Step Functions adapter (from `createSfnAdapter()`) |
| `enableLambda` | `boolean` | `false` | Enable Lambda discovery |
| `enableStepFunctions` | `boolean` | `false` | Enable Step Functions discovery |
| `tagFilter` | `Record<string, string>` | `{ 'mcp:expose': 'true' }` | Tag filter for discovery |
| `pollInterval` | `number` | off | Polling interval for live sync (ms) |
| `onChange` | `() => void` | — | Fires when tool list changes |
| `onError` | `(error: Error) => void` | — | Fires when polling encounters an error |

### `AwsConnector`

| Member | Type | Description |
|--------|------|-------------|
| `tools()` | `SynthesizedToolConfig[]` | Current compiled tool definitions |
| `lambdas` | `AwsLambdaConfig[]` | Discovered Lambda configurations |
| `stepFunctions` | `AwsStepFunctionConfig[]` | Discovered Step Function configurations |
| `client` | `AwsClient` | Client instance for `defineAwsTool()` |
| `refresh()` | `Promise<boolean>` | Manual poll; returns `true` if list changed |
| `stop()` | `void` | Stop background polling |

### `defineAwsTool(name, client, config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `arn` | `string` | — | Lambda or Step Function ARN |
| `description` | `string` | auto | Tool description for the LLM |
| `annotations` | `object` | — | `readOnlyHint`, `destructiveHint` |

### `createLambdaAdapter(client)` / `createSfnAdapter(client)`

Factory functions that wrap a real AWS SDK v3 client into the adapter interface. Requires the corresponding `@aws-sdk/client-*` package installed.

```typescript
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SFNClient } from '@aws-sdk/client-sfn';

const lambdaAdapter = await createLambdaAdapter(new LambdaClient({ region: 'eu-west-1' }));
const sfnAdapter = await createSfnAdapter(new SFNClient({ region: 'eu-west-1' }));
```
