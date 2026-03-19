# Quickstart — Lightspeed

---

<!-- Editorial break: Hero -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">ZERO TO PRODUCTION</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Scaffold. Build. Deploy.<br><span style="color:rgba(255,255,255,0.25)">The framework for the AI era.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">From an empty directory to a live MCP server on Vinkius Cloud in under 40 seconds — with DLP, kill switch, and audit trail. You define the architecture. Your AI agent writes the code.</div>
</div>

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Scaffold a Vurb MCP server with a health tool, Presenter, and PII redaction — then deploy it to Vinkius Cloud."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break: SKILL.md -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(192,132,252,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:3px;font-weight:700">AI-FIRST DEVELOPMENT</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">You are the architect.<br><span style="color:rgba(255,255,255,0.25)">The AI writes the code.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Vurb.ts ships a <strong style="color:rgba(192,132,252,0.8)">SKILL.md</strong> — a machine-readable architectural contract your AI coding agent can ingest. Point Cursor, Claude Code, Copilot, or Windsurf at the spec and prompt what you need.</div>
</div>

<!-- Feature Grid: SKILL.md power -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(192,132,252,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(192,132,252,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">What you say</div>
<div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.7;font-family:Inter,sans-serif;font-style:italic">"Create an MCP server for invoice management with Presenters, PII redaction on customer_ssn, and middleware auth."</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(52,211,153,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">What the AI produces</div>
<div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.7;font-family:Inter,sans-serif">Idiomatic Vurb.ts — correct file-based routing, typed Presenters, <code style="font-size:10px">.redactPII()</code> paths, middleware chains — on the first pass.</div>
</div>

</div>

The SKILL.md teaches the AI the entire framework architecture — MVA pattern, Presenter rules, middleware composition, file conventions.  Your job is to **define what your server does**. The AI's job is to **write the code that does it**. Works with Cursor, Claude Code, GitHub Copilot, Windsurf, and Cline.

> [!TIP]
> Explore more at [agentskills.io](https://agentskills.io) — the Agent Skills ecosystem for distributing domain expertise to AI agents.

---

## Prerequisites {#prerequisites}

Node.js **18+** required.

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

::: tip Already using a project?
If you're adding Vurb.ts to an existing Node.js project — skip to [Building Tools](/building-tools).
:::

## From Zero to Live {#scaffold}

Four commands. Under 40 seconds. Your MCP server on Vinkius Cloud's global edge.

<!-- Numbered steps -->
<div style="margin:32px 0">

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">01</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Scaffold</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:12px">

```bash
vurb create my-server
```

</div>
</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(129,140,248,0.3);background:rgba(129,140,248,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(129,140,248,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">02</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Develop locally</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:12px">

```bash
cd my-server
vurb dev
```

</div>
</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;font-family:Inter,sans-serif">HMR — edit any tool, middleware, or Presenter and the server reloads instantly.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(34,211,238,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">03</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Test</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:12px">

```bash
npm test
```

</div>
</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;font-family:Inter,sans-serif">In-memory harness — no transport, no network. All tests pass from scaffold.</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;padding:20px 24px;border-left:2px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(245,158,11,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">04</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Deploy to Vinkius Cloud</div>
<div style="margin-top:12px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;background:rgba(0,0,0,0.3)">
<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:6px">
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.12)"></span>
<span style="font-size:9px;color:rgba(255,255,255,0.25);margin-left:6px;letter-spacing:1px">terminal</span>
</div>
<div style="padding:12px">

```bash
vurb deploy
```

</div>
</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;font-family:Inter,sans-serif">Global edge. DLP redaction, V8 sandbox, rate limiting, kill switch, audit trail — all built in. Share the connection token with any MCP client.</div>
</div>
</div>

</div>

That's it. **Four commands. Your server is live.** Skip the wizard with `--yes` for defaults:

```bash
vurb create my-api --vector prisma --transport sse --yes
```

> **Pro-Tip**: `--vector prisma` is the fastest way to bridge **Prisma to MCP**. The Presenter's schema strips internal columns before they ever reach the LLM.

### What Just Happened {#what-just-happened}

When you ran `vurb deploy`, Vinkius Cloud activated **8 security layers** — automatically:

<!-- Security grid -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin:24px 0">

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🛡️</div>
<div style="font-size:10px;color:rgba(52,211,153,0.7);font-weight:600;font-family:Inter,sans-serif">DLP Engine</div>
</div>

<div style="border:1px solid rgba(129,140,248,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🔒</div>
<div style="font-size:10px;color:rgba(129,140,248,0.7);font-weight:600;font-family:Inter,sans-serif">V8 Sandbox</div>
</div>

<div style="border:1px solid rgba(245,158,11,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">⚡</div>
<div style="font-size:10px;color:rgba(245,158,11,0.7);font-weight:600;font-family:Inter,sans-serif">Rate Limiter</div>
</div>

<div style="border:1px solid rgba(239,68,68,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🚨</div>
<div style="font-size:10px;color:rgba(239,68,68,0.7);font-weight:600;font-family:Inter,sans-serif">Kill Switch</div>
</div>

<div style="border:1px solid rgba(34,211,238,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">📋</div>
<div style="font-size:10px;color:rgba(34,211,238,0.7);font-weight:600;font-family:Inter,sans-serif">Audit Trail</div>
</div>

<div style="border:1px solid rgba(192,132,252,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🧱</div>
<div style="font-size:10px;color:rgba(192,132,252,0.7);font-weight:600;font-family:Inter,sans-serif">Egress Firewall</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🔄</div>
<div style="font-size:10px;color:rgba(52,211,153,0.7);font-weight:600;font-family:Inter,sans-serif">Circuit Breaker</div>
</div>

<div style="border:1px solid rgba(245,158,11,0.15);border-radius:8px;background:#09090f;padding:14px 16px;text-align:center">
<div style="font-size:14px;margin-bottom:4px">🔐</div>
<div style="font-size:10px;color:rgba(245,158,11,0.7);font-weight:600;font-family:Inter,sans-serif">Token Auth</div>
</div>

</div>

> [!TIP]
> Vurb blocks PII locally by default. Need compliance proof (SOC2/GDPR/HIPAA)? [Connect to Vinkius Cloud for tamper-proof Audit Logs →](https://docs.vinkius.com/getting-started)

### Zero-Friction AI Integration {#skill-injection}

`vurb create` auto-injects SKILL.md into your IDE's rule files — `.cursorrules`, `.windsurfrules`, `.clinerules`. **The moment you scaffold, your IDE becomes a framework-expert architect.** No manual setup.

---

## What You Get {#structure}

<!-- Code screen: Project structure -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">project structure</span>
</div>
<div style="padding:20px">

```text
my-server/
├── src/
│   ├── vurb.ts            # initVurb<AppContext>()
│   ├── context.ts           # AppContext type + factory
│   ├── server.ts            # Bootstrap with autoDiscover
│   ├── tools/
│   │   └── system/
│   │       ├── health.ts    # Health check with Presenter
│   │       └── echo.ts      # Connectivity test
│   ├── presenters/
│   │   └── SystemPresenter.ts
│   ├── prompts/
│   │   └── greet.ts
│   └── middleware/
│       └── auth.ts
├── tests/
│   ├── setup.ts
│   └── system.test.ts
├── .cursor/mcp.json         # Pre-configured for Cursor
├── .cursorrules             # SKILL.md → Cursor rules (auto-generated)
├── .windsurfrules           # SKILL.md → Windsurf rules (auto-generated)
├── SKILL.md                 # AI architectural contract
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

</div>
</div>

Every file is real code — not stubs. The server boots, the tests pass, Cursor connects. **Your AI agent already knows the conventions** — SKILL.md is injected into IDE rules automatically.

---

## Connect Your MCP Client {#run}

<!-- Feature Grid: Client configs -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<div style="border:1px solid rgba(52,211,153,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(52,211,153,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Cursor</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Zero-click. CLI generates <code style="font-size:10px">.cursor/mcp.json</code> automatically.</div>
</div>

<div style="border:1px solid rgba(129,140,248,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(129,140,248,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Claude Desktop</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif">Add to <code style="font-size:10px">claude_desktop_config.json</code></div>
</div>

<div style="border:1px solid rgba(34,211,238,0.15);border-radius:10px;background:#09090f;padding:20px 24px">
<div style="font-size:13px;color:rgba(34,211,238,0.8);font-weight:600;font-family:Inter,sans-serif;margin-bottom:6px">Claude Code</div>
<div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;font-family:Inter,sans-serif"><code style="font-size:10px">claude mcp add my-server npx tsx src/server.ts</code></div>
</div>

</div>

::: code-group
```json [Claude Desktop]
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```
```json [VS Code + Copilot]
{
  "servers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```
```json [Windsurf / Cline]
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"]
    }
  }
}
```
:::

For SSE transport (multi-client, remote): `vurb create my-api --transport sse`

---

<!-- Editorial break: autoDiscover -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">FILE-BASED ROUTING</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Drop a file. It's a tool.<br><span style="color:rgba(255,255,255,0.25)">No imports, no registration.</span></div>
</div>

## autoDiscover {#autodiscover}

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/server.ts — scaffolded</span>
</div>
<div style="padding:20px">

```typescript
import { ToolRegistry, autoDiscover } from '@vurb/core';

const registry = f.registry();
const discovered = await autoDiscover(
  registry,
  new URL('./tools', import.meta.url).pathname
);
console.error(`📦 Discovered ${discovered.length} tool file(s)`);
```

</div>
</div>

Directory structure becomes tool namespace:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">naming convention</span>
</div>
<div style="padding:20px">

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

</div>
</div>

### Export Resolution

| Priority | What it looks for | Example |
|:-:|---|---|
| 1 | `export default` | `export default f.query('weather.get').handle(...)` |
| 2 | Named `tool` export | `export const tool = f.query(...)` |
| 3 | Any exported builder | Scans all exports for `getName()` |

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">src/tools/weather/get.ts</span>
</div>
<div style="padding:20px">

```typescript
import { f } from '../../vurb.js';

export default f.query('weather.get')
  .describe('Get current weather for a city')
  .withString('city', 'City name')
  .handle(async (input) => {
    return { city: input.city, temp_c: 18, condition: 'Clear' };
  });
```

</div>
</div>

Multiple tools per file work too — all exported builders are discovered (Priority 3).

### Advanced Options

| Option | Default | Description |
|---|---|---|
| `pattern` | `/(ts\|js\|mjs)$/` | Regex filter for file names |
| `recursive` | `true` | Scan subdirectories |
| `loader` | `'esm'` | Module system (`'esm'` or `'cjs'`) |
| `resolve` | Priority cascade | Custom export resolver |

---

## Vectors {#vectors}

| Vector | What it adds |
|---|---|
| `vanilla` | `autoDiscover()` file routing. Zero deps |
| `prisma` | Prisma schema + DB tool stubs + `@vurb/prisma-gen` |
| `n8n` | `N8nConnector` — n8n workflows as MCP tools |
| `openapi` | OpenAPI spec → Models/Views/Agents |
| `oauth` | RFC 8628 Device Flow + `requireAuth()` |

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">different scaffolds</span>
</div>
<div style="padding:12px">

```bash
# Database-driven MCP server
vurb create inventory-api --vector prisma --transport sse

# n8n workflow bridge
vurb create ops-bridge --vector n8n

# Authenticated API
vurb create secure-api --vector oauth
```

</div>
</div>

Each vector adds its dependencies to `package.json` and environment variables to `.env.example` automatically.

---

<!-- Editorial break: Self-hosted -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(34,211,238,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(34,211,238,0.6);letter-spacing:3px;font-weight:700">SELF-HOSTED</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Prefer your own infra?<br><span style="color:rgba(255,255,255,0.25)">Same code, any runtime.</span></div>
</div>

## Self-Hosted Alternatives {#self-hosted}

<!-- Deploy cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="https://docs.vinkius.com/getting-started" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">MANAGED</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vinkius Cloud</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif"><code style="font-size:10px">vurb deploy</code> — global edge, DLP, kill switch.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Learn more →</span>
</a>

<a href="/vercel-adapter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">VERCEL</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Vercel Edge</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Next.js App Router — one line of code.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read guide →</span>
</a>

<a href="/cloudflare-adapter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">CLOUDFLARE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Cloudflare Workers</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Edge-native with D1, KV, and R2.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read guide →</span>
</a>

</div>

> [!TIP]
> Install the [Vinkius extension](https://marketplace.visualstudio.com/items?itemName=vinkius.cloud-extension) to monitor servers from VS Code, Cursor, or Windsurf — live connections, logs, and tool toggling.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/building-tools" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(34,211,238,0.5);letter-spacing:2px;font-weight:600">BUILD</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Building Tools</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Semantic verbs, parameters, annotations.</div>
<span style="font-size:10px;color:rgba(34,211,238,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/presenter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">VIEW</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Presenter</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Shape what the LLM sees.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/middleware" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">GUARD</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Middleware</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Auth, rate limiting, logging.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 0 32px">

<a href="/testing" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">TESTING</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Test Harness</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">In-memory tool assertions.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/governance/" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(239,68,68,0.5);letter-spacing:2px;font-weight:600">GOVERNANCE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Capability Lockfile</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Lock your capability surface.</div>
<span style="font-size:10px;color:rgba(239,68,68,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/quickstart" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(192,132,252,0.5);letter-spacing:2px;font-weight:600">MANUAL</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Traditional Setup</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Step-by-step without scaffolding.</div>
<span style="font-size:10px;color:rgba(192,132,252,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>
