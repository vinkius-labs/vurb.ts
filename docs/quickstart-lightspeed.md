# Quickstart — Lightspeed

From zero to a running MCP server in under 30 seconds. The CLI scaffolds a production-ready project with `autoDiscover()` file-based routing, typed context, Presenters, middleware, testing, and pre-configured connections for Cursor, Claude Desktop, and Claude Code — no boilerplate.

::: tip Skip the scaffold — let your AI agent build it
Vurb.ts ships a **[SKILL.md](https://agentskills.io)** — a machine-readable architectural contract your AI coding agent can ingest. Instead of following this guide manually, point your agent at the spec and prompt:

```
"Create an MCP server for invoice management with Presenters,
 PII redaction on customer_ssn, and middleware auth."
```

The agent produces idiomatic Vurb.ts — correct file-based routing, typed Presenters, `.redactPII()` paths, middleware chains — on the first pass. Works with Cursor, Claude Code, GitHub Copilot, Windsurf, and Cline.
:::

## Prerequisites {#prerequisites}

Node.js **18+** required.

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

::: tip Already using a project?
If you're adding Vurb.ts to an existing Node.js project, the install above is all you need — then skip to [Building Tools](/building-tools).
:::

## Scaffold {#scaffold}

The CLI creates a complete project with all dependencies pre-installed:

```bash
vurb create my-server
```

The interactive wizard runs:

```
  Project name?  (my-mcp-server) › my-server
  Transport?     [stdio, sse]    › stdio
  Vector?        [vanilla, prisma, n8n, openapi, oauth] › vanilla
  Include testing?               › yes

  ● Scaffolding project — 14 files (6ms)
  ● Installing dependencies...
  ✔ Done

  $ cd my-server
  $ Vurb.ts dev
  $ npm test
```

Skip the wizard with `--yes` for defaults, or pass flags directly. For example, if you want to give Claude Desktop or Cursor secure access to your database, you can automatically generate a **Postgres SQL Agent MCP** through Prisma schemas without risking raw SQL injection vulnerabilities:

```bash
vurb create my-api --vector prisma --transport sse --yes
```

> **Pro-Tip**: `--vector prisma` is the fastest way to bridge **Prisma to MCP**. The Presenter's schema acts as a whitelist — internal columns like `password_hash` or `ssn` are stripped before they ever reach the LLM context window.

## What you get {#structure}

```text
my-server/
├── src/
│   ├── vurb.ts          # initVurb<AppContext>()
│   ├── context.ts         # AppContext type + factory
│   ├── server.ts          # Bootstrap with autoDiscover
│   ├── tools/
│   │   └── system/
│   │       ├── health.ts  # Health check with Presenter
│   │       └── echo.ts    # Echo for connectivity testing
│   ├── presenters/
│   │   └── SystemPresenter.ts
│   ├── prompts/
│   │   └── greet.ts
│   └── middleware/
│       └── auth.ts
├── tests/
│   ├── setup.ts
│   └── system.test.ts
├── .cursor/mcp.json       # Pre-configured for Cursor
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

Every file is real code — not stubs. The server boots, the tests pass, Cursor connects.

## Run & Connect {#run}

```bash
cd my-server
Vurb.ts dev
```

The server starts on stdio. Connect it to your MCP client:

### Cursor — Zero-Click Integration

Already configured. The CLI generates `.cursor/mcp.json` automatically — open the project in Cursor and the MCP connection is live. No manual setup, no config editing. This is the fastest path from scaffold to working MCP server.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add my-server npx tsx src/server.ts
```

### Windsurf

Add to your Windsurf MCP config (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

### Cline (VS Code Extension)

Add via Cline's MCP settings in VS Code — `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

### VS Code + GitHub Copilot

Add to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```

### SSE transport

For network-accessible servers (multi-client, remote deployment):

```bash
vurb create my-api --transport sse
cd my-api
Vurb.ts dev
# Server running on http://localhost:3001/sse
```

## autoDiscover — file-based routing {#autodiscover}

This is the scaffolded project's superpower. No `index.ts` with 50 imports. No manual `registry.register()` calls. Drop a file in `src/tools/` and it's a live MCP tool.

### How it works

The generated `server.ts` calls `autoDiscover()` at startup:

```typescript
// src/server.ts (scaffolded)
import { ToolRegistry, autoDiscover } from '@vurb/core';

const registry = f.registry();
const discovered = await autoDiscover(registry, new URL('./tools', import.meta.url).pathname);
console.error(`📦 Discovered ${discovered.length} tool file(s)`);
```

`autoDiscover` scans the entire `src/tools/` tree, imports every `.ts`/`.js` file, extracts the tool builder, and registers it. `.test.ts`, `.spec.ts`, and `.d.ts` files are skipped automatically.

### Naming convention

The directory structure becomes the tool namespace:

```text
src/tools/
├── billing/
│   ├── get_invoice.ts    → billing.get_invoice
│   └── pay.ts            → billing.pay
├── users/
│   ├── list.ts           → users.list
│   └── ban.ts            → users.ban
└── system/
    └── health.ts         → system.health
```

The tool's `name` field in the code is the source of truth — the directory just groups related files. Git diffs stay clean because adding a tool never touches a shared import file.

### Export resolution

`autoDiscover` resolves exports in priority order:

| Priority | What it looks for | Example |
|----------|-------------------|---------|
| 1 | `export default` | `export default f.query('weather.get').handle(...)` |
| 2 | Named `tool` export | `export const tool = f.query('weather.get').handle(...)` |
| 3 | Any exported builder | Scans all exports for objects with `getName()` |

The recommended pattern is `export default`:

```typescript
// src/tools/weather/get.ts
import { f } from '../../vurb.js';

export default f.query('weather.get')
  .describe('Get current weather for a city')
  .withString('city', 'City name')
  .handle(async (input) => {
    return { city: input.city, temp_c: 18, condition: 'Clear' };
  });
```

Restart the dev server. `weather_get` is now callable by any MCP client.

### Multiple tools in one file

Priority 3 enables exporting multiple tools from a single file:

```typescript
// src/tools/billing/crud.ts
import { f } from '../../vurb.js';

export const listInvoices = f.query('billing.list_invoices')
  .describe('List all invoices')
  .handle(async () => ({ invoices: [] }));

export const createInvoice = f.mutation('billing.create_invoice')
  .describe('Create an invoice')
  .withNumber('amount', 'Invoice amount')
  .handle(async (input) => ({ id: 'inv_1', amount: input.amount }));
```

Both tools are discovered and registered — no extra wiring.

### Advanced options

`autoDiscover` accepts an options object for fine-grained control:

```typescript
await autoDiscover(registry, './src/tools', {
  pattern: /\.tool\.ts$/,   // only files ending in .tool.ts
  recursive: true,          // scan subdirectories (default: true)
  loader: 'esm',            // 'esm' (default) or 'cjs'
  resolve: (mod) => {       // custom export resolver
    return mod.myTool as ToolBuilderLike;
  },
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `pattern` | `/\.(ts\|js\|mjs\|mts)$/` | Regex filter for file names |
| `recursive` | `true` | Scan subdirectories |
| `loader` | `'esm'` | Module system — `'esm'` uses `import()`, `'cjs'` uses `require()` |
| `resolve` | Priority cascade (default → tool → any) | Custom function to extract builders from module exports |

## Test {#test}

The scaffolded project includes Vitest with a system test that verifies tool registration:

```bash
npm test
```

The test harness uses `MVA_META_SYMBOL` to call tools in-memory — no transport layer, no network. Add your own:

```typescript
// tests/weather.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry, autoDiscover } from '@vurb/core';

describe('weather.get', () => {
  it('returns temperature for a city', async () => {
    const registry = new ToolRegistry();
    await autoDiscover(registry, new URL('../src/tools', import.meta.url).pathname);

    const result = await registry.callTool('weather_get', { city: 'Tokyo' });
    expect(result.content[0].text).toContain('Tokyo');
  });
});
```

## Vectors {#vectors}

The `--vector` flag changes what gets scaffolded:

| Vector | What it adds |
|---|---|
| `vanilla` | `autoDiscover()` file-based routing. Zero external deps |
| `prisma` | `prisma/schema.prisma` + DB tool stubs + `@vurb/prisma-gen` generator |
| `n8n` | `src/n8n.ts` — `N8nConnector` auto-discovers webhook workflows as MCP tools |
| `openapi` | `openapi.yaml` + `SETUP.md` — generates Models/Views/Agents from spec |
| `oauth` | `src/auth.ts` + `src/middleware/auth.ts` — RFC 8628 Device Flow with `requireAuth()` |

```bash
# Database-driven MCP server
vurb create inventory-api --vector prisma --transport sse

# n8n workflow bridge
vurb create ops-bridge --vector n8n

# Authenticated API
vurb create secure-api --vector oauth
```

Each vector adds its dependencies to `package.json` and environment variables to `.env.example` automatically.

## Next steps {#next}

| What | Where |
|---|---|
| Understand tool definitions, annotations, Zod schemas | [Building Tools](/building-tools) |
| Shape what the LLM sees with Presenters | [Presenter Guide](/presenter) |
| Add auth, rate limiting, logging | [Middleware](/middleware) |
| Register prompts and dynamic manifests | [Prompt Engine](/prompts) |
| Run the full test harness | [Testing](/testing) |
| Lock your capability surface | [Capability Governance](/governance/) |
| Manual setup without the CLI | [Quickstart — Traditional](/quickstart) |

## Go Live {#go-live}

Your server runs locally over Stdio. To deploy it globally with built-in security, DLP, FinOps, and audit logging — use Vinkius Cloud.

### Vinkius Cloud — One Command Deploy

Deploy your MCP server to Vinkius Cloud's global edge with a single command. Your server gets DLP protection, kill switch, audit logging, and a managed MCP token — no infrastructure to manage.

```bash
vurb deploy
```

That's it. The CLI packages your server, deploys it to Vinkius Cloud, and returns a connection token. Share the token with any MCP client — Claude Desktop, Cursor, VS Code, Windsurf — and they connect instantly.

```bash
# Deploy with a custom server name
vurb deploy --name my-weather-api

# Deploy to a specific environment
vurb deploy --env production
```

Every deployment is protected by eight layers of security out of the box: DLP redaction, V8 sandbox, rate limiting, credential vault, SSRF protection, kill switch, and full audit trail. [Learn more about Vinkius Cloud →](https://docs.vinkius.com/getting-started)

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to monitor your deployed servers directly from VS Code, Cursor, or Windsurf — live connections, logs, token management, and tool toggling without leaving your IDE.

### Self-Hosted Alternatives

If you prefer to self-host, drop your registry into Vercel or Cloudflare Workers. Both adapters bridge MCP's long-lived process model and serverless runtimes — registry compilation is cached at cold start, warm requests execute with near-zero overhead.

#### Vercel — Next.js Edge Deployment

```typescript
// app/api/mcp/route.ts
import { vercelAdapter } from '@vurb/vercel';

export const POST = vercelAdapter({ registry, contextFactory });
export const runtime = 'edge'; // optional — global edge distribution
```

#### Cloudflare Workers — D1 & KV at the Edge

```typescript
// src/worker.ts
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';

export default cloudflareWorkersAdapter({ registry, contextFactory });
```

Full guides: [Vercel Adapter](/vercel-adapter) · [Cloudflare Adapter](/cloudflare-adapter) · [Production Server](/cookbook/production-server)
