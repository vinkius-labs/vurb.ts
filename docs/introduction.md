# Introduction

<div class="ms-badges">
<a href="https://github.com/vinkius-labs/vurb.ts/releases"><img src="https://img.shields.io/badge/First%20Release-Feb%2012%2C%202026-blue" alt="First Release"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/dt/@vurb/core" alt="Downloads"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/dw/@vurb/core" alt="Weekly Downloads"></a>
<a href="https://www.npmjs.com/package/@vurb/core"><img src="https://img.shields.io/npm/v/@vurb/core.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
<a href="https://bundlephobia.com/package/vurb"><img src="https://img.shields.io/bundlephobia/minzip/vurb" alt="Package Size"></a>
<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7+-blue.svg?style=flat-square&logo=typescript" alt="TypeScript"></a>
<a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Standard-purple.svg?style=flat-square" alt="MCP SDK"></a>
<a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-green.svg?style=flat-square" alt="License"></a>
<a href="https://github.com/vinkius-labs/vurb.ts/stargazers"><img src="https://img.shields.io/github/stars/vinkius-labs/vurb?style=flat-square&color=gold" alt="GitHub Stars"></a>
<img src="https://img.shields.io/badge/Built%20with-%F0%9F%9A%80%20by%20Vinkius-%23000000" alt="Built with 🚀 by Vinkius">
</div>

Vurb.ts is an architecture layer for the Model Context Protocol. It separates three concerns that every raw MCP server mixes into a single handler: **who can call what** (middleware pipeline), **what the agent sees** (Presenter with Zod schema), and **whether the surface is trustworthy** (governance lockfile + HMAC attestation).

This separation is the **MVA (Model-View-Agent)** pattern. The handler returns raw data (Model). The Presenter shapes perception (View). The middleware governs access (Agent). The resulting server works with any MCP client — Cursor, Claude Desktop, Claude Code, Windsurf, Cline, and VS Code with GitHub Copilot.

### Native Framework Integration
## Does Vurb.ts work with Vercel AI SDK and LangChain? {#frontend-integrations}

Yes. **Vurb.ts is a natural backend for any AI client application.**

If you are building a frontend or orchestration layer using the **Vercel AI SDK**, **LangChain**, or **LlamaIndex**, you can connect them directly to your `Vurb.ts` backend via standard `stdio` or HTTP transports. 

Because Vurb.ts provides a structured perception layer, your Vercel AI SDK or LangChain agents get typed tool names, validated inputs, and truncated payloads out of the box. You get the rich frontend capabilities of those frameworks combined with a backend that's built for production from day one.

## How It Looks {#in-practice}

A complete invoice tool with authentication, AI instructions, field-level protection, and action affordances.

### 1. Context Init

```typescript
import { initVurb } from '@vurb/core';

interface AppContext {
  db: PrismaClient;
  user: { id: string; role: string; tenantId: string };
}
const f = initVurb<AppContext>();
```

`initVurb<T>()` takes your context shape as a generic. This type propagates through every builder — fully inferred. The `f` instance is your entry point for semantic verbs: `f.query()`, `f.mutation()`, and `f.action()`.

### 2. Presenter (The View)

```typescript
const InvoicePresenter = f.presenter({
  name: 'Invoice',
  schema: z.object({
    id: z.string(),
    amount_cents: z.number().describe('Amount in cents — divide by 100 for display'),
    status: z.enum(['draft', 'sent', 'paid', 'overdue']),
  }),
  rules: (inv) => [
    inv.status === 'overdue' ? 'invoice is overdue. Mention it to the user.' : null,
  ],
  suggest: (inv) => [
    inv.status === 'draft' ? suggest('billing.send', 'Send invoice', { id: inv.id }) : null,
  ].filter(Boolean),
});
```

The `schema` is an allowlist. Only declared fields reach the agent. `rules` and `suggest` provide **Agentic HATEOAS** — the AI doesn't guess; it follows explicit affordances.

### 3. Tool (The Agentic API)

We use **Semantic Verbs** to define the behavior. `f.query()` is read-only, while `f.mutation()` signals destructive side-effects.

```typescript
export const getInvoice = f.query('billing.get')
  .describe('Retrieve an invoice by ID')
  .instructions('Use only when the user refers to a specific invoice ID.')
  .withString('id', 'The unique invoice identifier')
  .returns(InvoicePresenter)
  .use(async ({ ctx, next }) => {
     // middleware: auth, tenant injection, etc.
     const user = await auth.verify(ctx.token);
     return next({ ...ctx, user });
  })
  .handle(async (input, ctx) => {
    // Handler receives typed input and enriched ctx
    return ctx.db.invoice.findUnique({
      where: { id: input.id, tenantId: ctx.user.tenantId },
    });
  });
```

---

## Installation {#installation}

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

Node.js 18+. Works with any MCP SDK-compatible transport (Stdio, HTTP/SSE, WebSocket).

### Ecosystem Packages

| Package | Purpose |
|---|---|
| [@vurb/vercel](/vercel-adapter) | Deploy to Vercel — App Router, Edge or Node.js Runtime |
| [@vurb/cloudflare](/cloudflare-adapter) | Deploy to Cloudflare Workers — D1, KV, R2 bindings |
| [@vurb/aws](/aws-connector) | AWS Lambda & Step Functions connector |
| [@vurb/oauth](/oauth) | OAuth Device Flow (RFC 8628) — enterprise authentication |
| [@vurb/prisma-gen](/prisma-gen) | Auto-generate MCP tools from Prisma schema |
| [@vurb/openapi-gen](/openapi-gen) | Generate tools from OpenAPI/Swagger specs |
| [@vurb/n8n](/n8n-connector) | Bridge n8n workflows as MCP tools |
| [@vurb/skills](/skills) | Progressive instruction distribution for AI agents |
| [@vurb/testing](/testing) | Test harness — assertions, blast radius, snapshot testing |
| [@vurb/inspector](/inspector) | Real-time TUI dashboard via Shadow Socket |

## Why This Matters {#benefits}

**Data stays private by default.** Raw MCP servers leak `password_hashes` directly to the LLM. The Presenter's Zod schema acts as an Egress Firewall — Vurb.ts strips undeclared sensitive fields at RAM level before they hit the wire. A database migration that adds a column doesn't change what the agent sees — the new column is invisible unless you declare it.

**DLP compliance built in.** `.redactPII()` compiles V8-optimized redaction (via `fast-redact`) that masks sensitive fields after UI and rules have been computed (Late Guillotine). GDPR, LGPD, HIPAA — the developer cannot accidentally bypass redaction.

**Temporal anti-hallucination.** The FSM State Gate physically removes tools from `tools/list` based on workflow state. If the cart is empty, `cart.pay` doesn't exist — the LLM literally cannot call it.

**Zero-Trust Sandbox.** The LLM sends JavaScript to your data instead of the other way around. Sealed V8 isolate — zero access to `process`, `require`, `fs`, `net`, `fetch`.

**Agent Skills.** No other MCP framework has this. Distribute domain expertise to AI agents on demand: progressive three-layer disclosure (search → load → read auxiliary files), zero context window waste.

**AI-First DX.** `.instructions()` embeds prompt engineering directly into the tool definition. The agent gets context, not just data.

**Deterministic Recovery.** `suggest` sends valid next actions with pre-populated arguments. No hallucinated tool names.

**Auto-generate from what you have.** `npx prisma generate` → CRUD tools with field-level security from your Prisma schema. `npx openapi-gen generate` → typed tools from any REST API. `createN8nConnector()` → n8n workflows as MCP tools.

**Deploy Anywhere.** The same `ToolRegistry` runs on Stdio, SSE, and serverless runtimes without code changes. Ship to [Vercel Edge Functions](/vercel-adapter) for fast cold starts in a Next.js route, or to [Cloudflare Workers](/cloudflare-adapter) for D1/KV access from 300+ edge locations.

**Audit & Governance.** `vurb.lock` captures every tool's behavioral contract — 9 modules for SOC2-auditable AI deployments. PR diffs show what changed. See [Governance](/governance/).
