# Production Server

::: info Prerequisites
Install Vurb.ts before following this recipe: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [Introduction](#introduction)
- [Vinkius Cloud — Recommended](#vinkius-cloud)
- [Stdio Transport](#stdio)
- [HTTP/SSE Transport](#sse)
- [Cloudflare Workers](#cloudflare)
- [Vercel Edge Functions](#vercel)
- [Graceful Shutdown](#shutdown)

## Introduction {#introduction}

Vurb.ts tools are transport-agnostic — the same `ToolRegistry` runs on Stdio (local development), HTTP/SSE (persistent servers), Vinkius Cloud (managed edge), and serverless runtimes. The recommended path to production is **Vinkius Cloud** — one command, zero infrastructure. For self-hosted deployments, the [Vercel Adapter](/vercel-adapter) and [Cloudflare Workers Adapter](/cloudflare-adapter) provide serverless edge options, while the [@vurb/aws](/aws-connector) connector integrates with Lambda and Step Functions.

## Vinkius Cloud — Recommended {#vinkius-cloud}

The fastest path to production. `vurb deploy` publishes your server to Vinkius Cloud's global edge with built-in DLP, kill switch, audit logging, and a managed MCP token:

```bash
vurb deploy
```

That's it. No Dockerfile, no CI/CD pipeline, no infrastructure to manage. Share the connection token with any MCP client — Cursor, Claude Desktop, Claude Code, Windsurf, Cline, VS Code + Copilot — and they connect instantly.

```bash
# Deploy with a custom name
vurb deploy --name my-production-api

# Deploy to a specific environment
vurb deploy --env production
```

[Learn more about Vinkius Cloud →](https://docs.vinkius.com/getting-started)

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to manage your servers directly from VS Code, Cursor, or Windsurf. Every server shows up in the sidebar with a full dashboard — live connections, requests, P95 latency, DLP intercepts, token management, tool toggling, logs, and deployment history.

## Stdio Transport {#stdio}

The simplest deployment. The MCP client spawns your server as a child process:

```typescript
import { ToolRegistry } from '@vurb/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.registerAll(...tools);

const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

registry.attachToServer(server, {
  contextFactory: async (extra) => ({
    db: getDatabaseClient(),
    tenantId: 'default',
  }),
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/server.ts"]
    }
  }
}
```

## HTTP/SSE Transport {#sse}

For remote servers accessible over the network:

```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
const sessions = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  sessions.set(transport.sessionId, transport);

  const server = new McpServer({ name: 'my-server', version: '1.0.0' });
  registry.attachToServer(server, {
    contextFactory: async (extra) => ({
      db: getDatabaseClient(),
      tenantId: req.headers['x-tenant-id'] ?? 'default',
    }),
  });

  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sessions.get(sessionId);
  if (transport) await transport.handlePostMessage(req, res);
});

app.listen(3000);
```

## Cloudflare Workers {#cloudflare}

See the full [Cloudflare Adapter](/cloudflare-adapter) guide. Quick start:

```typescript
import { ToolRegistry } from '@vurb/core';
import { McpAgent } from 'agents/mcp';

const registry = new ToolRegistry();
registry.registerAll(...tools);

export class MyMcpAgent extends McpAgent {
  server = new McpServer({ name: 'cf-server', version: '1.0.0' });

  async init() {
    registry.attachToServer(this.server, {
      contextFactory: async () => ({
        db: getDatabaseClient(this.env),
      }),
    });
  }
}
```

## Vercel Edge Functions {#vercel}

See the full [Vercel Adapter](/vercel-adapter) guide. Quick start:

```typescript
import { createMcpHandler } from '@vercel/mcp-adapter';
import { ToolRegistry } from '@vurb/core';

const registry = new ToolRegistry();
registry.registerAll(...tools);

export const GET = createMcpHandler(
  (server) => {
    registry.attachToServer(server, {
      contextFactory: async () => ({
        db: getDatabaseClient(),
      }),
    });
  },
  {},
  { basePath: '/api/mcp', maxDuration: 60 },
);
```

## Graceful Shutdown {#shutdown}

Handle `SIGTERM` and `SIGINT` for clean shutdown in containerized environments:

```typescript
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await server.close();
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Interrupted, shutting down...');
  await server.close();
  await db.$disconnect();
  process.exit(0);
});
```

> [!IMPORTANT]
> In Docker and Kubernetes, the entrypoint must handle signals. Use `exec` form in Dockerfile: `CMD ["node", "dist/server.js"]` (not `CMD node dist/server.js`).