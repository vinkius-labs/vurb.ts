# Production Server

::: info Prerequisites
Install Vurb.ts before following this recipe: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Set up a production Vurb server with stdio transport, graceful shutdown, and Vinkius Cloud deployment."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">DEPLOY ANYWHERE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">One registry. Every platform.<br><span style="color:rgba(255,255,255,0.25)">Stdio, HTTP, Edge, Serverless.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The same `ToolRegistry` runs on Stdio, HTTP/SSE, Vinkius Cloud, Vercel, Cloudflare Workers, and AWS Lambda — unchanged. The recommended path: `vurb deploy`.</div>
</div>

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