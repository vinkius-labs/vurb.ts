# Quickstart — Traditional

Manual setup for when you need full control over every file.

::: tip Looking for the fast path?
[Quickstart — Lightspeed](/quickstart-lightspeed) scaffolds a complete project with one command: `vurb create my-server`
:::

::: info Or let your AI agent build it
Vurb.ts ships a **[SKILL.md](https://agentskills.io)** — a machine-readable architectural contract. Point your AI coding agent (Cursor, Claude Code, Copilot, Windsurf, Cline) at the spec and describe what you need. The agent produces correct Vurb.ts code — Presenters, middleware, file-based routing — without you learning the API first.
:::

## Install {#install}

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

## Create a Vurb.ts Instance {#init}

```typescript
import { initVurb } from '@vurb/core';

const f = initVurb();
```

`initVurb()` without a generic creates a `void` context — no auth, no shared state. Add `initVurb<AppContext>()` later when you need dependency injection.

## Define a Tool {#first-tool}

```typescript
const getWeather = f.query('weather.get')
  .describe('Get current weather for a city')
  .withString('city', 'City name, e.g. "San Francisco"')
  .handle(async (input) => {
    return { city: input.city, temp_c: 18, condition: 'Partly cloudy' };
  });
```

`weather.get` follows the `domain.action` convention. [Tool exposition](/tool-exposition) flattens it to `weather_get` by default. `f.query()` sets `readOnly: true` — an MCP annotation telling clients this tool is safe without confirmation. Invalid input like `{ city: 42 }` is rejected before the handler runs.

## Register and Start {#server}

```typescript
import { ToolRegistry } from '@vurb/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const registry = new ToolRegistry();
registry.register(getWeather);

const server = new McpServer({
  name: 'my-first-server',
  version: '1.0.0',
});

registry.attachToServer(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

`attachToServer()` wires `tools/list` and `tools/call` handlers into the MCP SDK server — one line replaces all manual `server.tool()` registrations.

## Complete File {#complete}

```typescript
import { initVurb, ToolRegistry } from '@vurb/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const f = initVurb();

const getWeather = f.query('weather.get')
  .describe('Get current weather for a city')
  .withString('city', 'City name, e.g. "San Francisco"')
  .handle(async (input) => {
    return { city: input.city, temp_c: 18, condition: 'Partly cloudy' };
  });

const registry = new ToolRegistry();
registry.register(getWeather);

const server = new McpServer({
  name: 'my-first-server',
  version: '1.0.0',
});

registry.attachToServer(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

28 lines. Input validation, structured responses, MCP annotations, running server.

## Test It {#test}

Connect to any MCP client:

### Cursor

Add `.cursor/mcp.json` to your project root (or use [`vurb create`](/quickstart-lightspeed) which generates it automatically):

```json
{
  "mcpServers": {
    "my-first-server": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-first-server": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add my-first-server npx tsx src/index.ts
```

### Windsurf · Cline · VS Code + Copilot

All three use the same JSON format as Claude Desktop — add the `mcpServers` block to the respective config file: `~/.codeium/windsurf/mcp_config.json` (Windsurf), `cline_mcp_settings.json` (Cline), or `.vscode/mcp.json` (VS Code Copilot — uses `"servers"` key instead of `"mcpServers"`).

Ask: *"What's the weather in San Francisco?"* — the agent calls `weather_get` and receives the structured response.

## Take It to Production {#production}

The registry you built above works with any transport — Stdio, SSE, HTTP, or serverless.

### Vinkius Cloud — One Command Deploy

Deploy your MCP server to Vinkius Cloud's global edge with built-in DLP, kill switch, audit logging, and a managed MCP token:

```bash
vurb deploy
```

The CLI packages your server, deploys it, and returns a connection token. Share it with any MCP client and they connect instantly — no infrastructure to manage.

[Learn more about Vinkius Cloud →](https://docs.vinkius.com/getting-started)

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to monitor your servers directly from VS Code, Cursor, or Windsurf — live dashboard, logs, and token management without leaving your IDE.

### Self-Hosted Alternatives

To deploy as a global HTTP endpoint without Vinkius Cloud:

#### Vercel — Serverless MCP Endpoint

```typescript
import { vercelAdapter } from '@vurb/vercel';
export const POST = vercelAdapter({ registry, contextFactory });
```

#### Cloudflare Workers — Global Edge Distribution

```typescript
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
export default cloudflareWorkersAdapter({ registry, contextFactory });
```

Same tools. Same middleware. Same Presenters. Zero code changes. Full guides: [Vercel Adapter](/vercel-adapter) · [Cloudflare Adapter](/cloudflare-adapter) · [Production Server](/cookbook/production-server)
