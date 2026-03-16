# Scaling

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Grouping Reduces Tool Count](#grouping)
- [Tag Filtering](#tag-filtering)
- [TOON Token Compression](#toon)
- [Strict Validation](#strict)
- [Error Recovery](#error-recovery)

## Introduction {#introduction}

Every tool definition in `tools/list` includes a name, description, and full JSON Schema. The LLM receives this entire payload as system context. As tool count grows, three failures cascade: context saturation (fewer tokens for reasoning), semantic collision (similar tool names confuse routing), and parameter confusion (overlapping field names like `id` or `status` cause cross-contamination).

Vurb.ts provides four mechanisms to keep tool payloads manageable as your server scales — especially critical when using generators like [@vurb/prisma-gen](/prisma-gen), [@vurb/openapi-gen](/openapi-gen), or [@vurb/n8n](/n8n-connector) that can produce dozens of tools from a single schema.

## Grouping Reduces Tool Count {#grouping}

Use the [grouped exposition strategy](/tool-exposition#grouped) to consolidate multiple operations behind a single discriminator enum. Instead of 5 entries in `tools/list`:

```json
[
  { "name": "projects_list", "inputSchema": { /* ... */ } },
  { "name": "projects_get", "inputSchema": { /* ... */ } },
  { "name": "projects_create", "inputSchema": { /* ... */ } }
]
```

One entry with all operations nested:

```json
[
  {
    "name": "projects",
    "inputSchema": {
      "properties": {
        "action": { "type": "string", "enum": ["list", "get", "create"] },
        "id": { "description": "Project ID. Required for: get" },
        "name": { "description": "Project name. Required for: create" }
      },
      "required": ["action"]
    }
  }
]
```

The discriminator enum anchors the LLM to valid operations. If it sends an invalid action, Vurb.ts returns a structured error with the valid options.

## Tag Filtering {#tag-filtering}

`.tags()` on the Fluent API lets you classify tools, then filter which ones appear in `tools/list`:

```typescript
import { initVurb } from '@vurb/core';
const f = initVurb<AppContext>();

const usersTool = f.query('users.list')
  .describe('List users')
  .tags('core', 'user-management')
  .handle(async (input, ctx) => { /* ... */ });
```

```typescript
registry.attachToServer(server, {
  contextFactory: createAppContext,
  filter: {
    tags: ['core'],
    exclude: ['internal'],
  },
});
```

Filtered tools consume zero tokens. If the LLM attempts to call a hidden tool, `routeCall()` returns `"Unknown tool"`.

## TOON Token Compression {#toon}

`.toonDescription()` encodes action metadata using pipe-delimited formatting, reducing description tokens by 30-50%:

```text
Manage projects

action|desc|required|destructive
list|List all projects||
get|Get project details|id|
create|Create a new project|name|
update|Update project|id,data|
delete|Delete project permanently|id|true
```

Column names appear once as a header. No JSON key repetition per row.

> [!TIP]
> Use TOON for servers with 20+ actions sharing the same tool. Below that threshold, standard Markdown descriptions are more readable for humans.

## Strict Validation {#strict}

Every action schema is compiled with `.strict()`. When the LLM sends undeclared fields, Zod rejects them with an actionable error naming the invalid fields:

```xml
<validation_error action="users/create">
  <field name="(root)">Unrecognized key(s) in object: 'hallucinated_param'. Remove or correct unrecognized fields.</field>
  <recovery>Fix the fields above and call the tool again.</recovery>
</validation_error>
```

The LLM sees exactly which fields are invalid and self-corrects on retry.

## Error Recovery {#error-recovery}

Structured error responses let the LLM self-correct without retry loops. Every validation bounce includes valid options or the specific field that failed. See [Error Handling](/error-handling) for the full reference.

## Scale Beyond a Single Process {#serverless}

Token compression and tool grouping reduce cognitive load — but your MCP server still runs as a single Node.js process. To scale horizontally, deploy to Vinkius Cloud or a serverless runtime.

### Vinkius Cloud — One Command Scale

The fastest path to horizontal scaling. `vurb deploy` publishes your server to Vinkius Cloud's global edge — auto-scaling, built-in DLP, kill switch, audit logging, and a managed MCP token. No infrastructure to manage:

```bash
vurb deploy
```

[Learn more about Vinkius Cloud →](https://docs.vinkius.com/getting-started)

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to monitor connections, latency, and token spend directly from your IDE.

### Self-Hosted Alternatives

Vurb.ts's adapters cache registry compilation at module scope — Zod reflection, Presenter compilation, schema generation — and execute warm requests as stateless JSON-RPC calls. No shared memory, no session affinity, no connection pooling.

#### Vercel — Auto-Scaling MCP Functions

```typescript
import { vercelAdapter } from '@vurb/vercel';
export const POST = vercelAdapter({ registry, contextFactory });
export const runtime = 'edge';
```

#### Cloudflare Workers — Isolate-per-Request Architecture

```typescript
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
export default cloudflareWorkersAdapter({ registry, contextFactory });
```

Full deployment guides: [Vercel Adapter](/vercel-adapter) · [Cloudflare Adapter](/cloudflare-adapter) · [Production Server](/cookbook/production-server)