---
title: "MCP Server Frameworks in 2026: The Complete Guide for TypeScript and Python Developers"
date: 2026-03-14
author: Renato Marinho
authorUrl: https://github.com/renatomarinho
description: "A deep technical comparison of every MCP server framework: the official SDK, FastMCP, mcp-framework, EasyMCP, and Vurb.ts. Learn what each offers, where they fall short, and why the Presenter pattern changes everything."
tags:
  - mcp
  - framework
  - comparison
  - fastmcp
  - typescript
  - ai-agents
image: https://site-assets.vinkius.com/vk/icon-v-black-min.png
---

# MCP Server Frameworks in 2026: The Complete Guide for TypeScript and Python Developers

The Model Context Protocol (MCP) has become the de facto standard for connecting AI agents to external tools, databases, and services. Claude, GPT, Gemini, Cursor, Windsurf, GitHub Copilot, Cline — they all speak MCP now. The market is on track to top **$5.5 billion by 2034**, and 28% of Fortune 500 companies already run MCP servers in production.

But the protocol itself is just a specification. To build a real MCP server, you need a **framework** — and the choices available today range from raw SDKs with zero opinions to full-stack architectures designed for enterprise AI deployments.

This guide is the most thorough technical comparison you'll find. We break down every major MCP framework across **16 engineering dimensions** so you can pick the right one for your project — and stop dumping `JSON.stringify()` into a context window and hoping for the best.

---

## Table of Contents

- [The Landscape: What Exists Today](#the-landscape)
- [1. Official MCP SDKs (TypeScript & Python)](#official-sdk)
- [2. FastMCP (Python)](#fastmcp)
- [3. mcp-framework (TypeScript)](#mcp-framework)
- [4. EasyMCP (TypeScript)](#easymcp)
- [5. Vurb.ts (TypeScript)](#vurb-ts)
- [Feature-by-Feature Comparison Matrix](#comparison-matrix)
- [The Core Problem None of These Solve (Except One)](#the-core-problem)
- [Architecture Deep Dive: Why Raw MCP Servers Fail in Production](#architecture-deep-dive)
- [The MVA Solution: Presenters as a Perception Layer](#mva-solution)
- [Anti-Hallucination Mechanisms: A Technical Breakdown](#anti-hallucination)
- [Code Generation: From OpenAPI, Prisma, and n8n to MCP](#code-generation)
- [Enterprise Security: PII Redaction, Governance, and Audit Trails](#enterprise-security)
- [Deployment: Serverless, Edge, and Beyond](#deployment)
- [Testing: The Death of Vibes-Based QA](#testing)
- [When to Use What: Decision Framework](#decision-framework)
- [Getting Started with Vurb.ts in 30 Seconds](#getting-started)

---

## The Landscape: What Exists Today {#the-landscape}

The MCP ecosystem has exploded since Anthropic's initial release in November 2024. Here's every framework worth considering in March 2026, grouped by language and maturity:

| Framework | Language | First Release | Approach | Stars (Mar 2026) |
|---|---|---|---|---|
| **@modelcontextprotocol/sdk** | TypeScript | Nov 2024 | Raw protocol-level SDK | 10k+ |
| **mcp (Python SDK)** | Python | Nov 2024 | Raw protocol-level SDK | 8k+ |
| **FastMCP** | Python | 2024 (v1), Jan 2026 (v3) | High-level decorator-based | 5k+ |
| **mcp-framework** | TypeScript | 2025 | CLI + class-based scaffolding | 1k+ |
| **EasyMCP** | TypeScript | 2025 | Express-like minimalist API | 500+ |
| **Vurb.ts** | TypeScript | Feb 2026 | Full-stack MVA architecture | Growing |

Each one targets a different audience. Let's break them down.

---

## 1. Official MCP SDKs (TypeScript & Python) {#official-sdk}

The official SDKs from Anthropic are **protocol implementations**, not frameworks. They handle JSON-RPC transport, message serialization, and connection lifecycle. Think of them like the `http` module in Node.js — essential plumbing, but you wouldn't ship a production API on `http.createServer()` alone.

### What you get

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

server.tool('get_user', { id: z.string() }, async ({ id }) => {
    const user = await db.users.findUnique({ where: { id } });
    return { content: [{ type: 'text', text: JSON.stringify(user) }] };
});
```

### What you don't get

- **No routing.** One flat namespace. 50 tools → 50 registrations.
- **No validation beyond Zod.** The SDK validates input shapes but does nothing about output safety.
- **No field stripping.** `JSON.stringify(user)` sends `password_hash`, `ssn`, and every internal column to the LLM.
- **No domain context.** The LLM receives `amount_cents: 45000` and displays $45,000 instead of $450.00.
- **No error recovery.** `throw new Error('not found')` → the agent gives up.
- **No middleware.** Authentication is manual per-handler copy-paste.
- **No observability.** No tracing, no debug events, no audit trail.
- **No deployment adapters.** Stdio and HTTP only; serverless requires manual bridging.

**Best for:** Learning MCP. Proof-of-concept demos. Building your own framework on top.

---

## 2. FastMCP (Python) {#fastmcp}

FastMCP is the most popular **Python** framework for MCP servers. Version 1.0 was pulled into the official Python SDK and powers a huge chunk of Python MCP servers in the wild. FastMCP 3.0 (January 2026) brought component versioning, granular authorization, and OpenTelemetry instrumentation.

### What you get

```python
from fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
def get_user(id: str) -> dict:
    """Get a user by ID"""
    user = db.users.find(id)
    return user  # Returns dict → auto-serialized
```

### Strengths

- **Pythonic decorator API.** Natural for Python developers. Auto-generates schema from type hints.
- **OpenAPI/FastAPI integration.** Generate MCP servers from existing FastAPI routes.
- **Composition and proxying.** Compose local and remote servers, translate transports.
- **Background tasks.** Long-running operations with progress reporting via Docket.
- **Middleware (v2.9+).** Intercept and control server operations.
- **Enterprise authentication.** Google, GitHub, Azure, Auth0, WorkOS providers.

### Limitations

- **Python only.** Type system is runtime-checked, not compile-time. No TypeScript type inference.
- **No Presenter pattern.** Responses are still raw `dict` → `JSON`. No domain context, no action hints.
- **No anti-hallucination mechanisms.** No cognitive guardrails, no TOON encoding, no state sync.
- **No field stripping as an architectural boundary.** You must manually exclude fields from return values.
- **No FSM state gating.** Cannot physically remove tools based on workflow state.
- **No code generators for Prisma.** Python ecosystem only.
- **No governance lockfile.** No cryptographic surface integrity or contract diffing.
- **No tRPC-style typed client.** Clients are untyped.

**Best for:** Python-first teams. FastAPI shops migrating existing APIs to MCP. Quick prototyping.

---

## 3. mcp-framework (TypeScript) {#mcp-framework}

`mcp-framework` is a TypeScript framework with a CLI that scaffolds class-based MCP server projects. It gives you a structured starting point with file-based tool organization.

### What you get

```bash
npx mcp-framework create my-server
cd my-server && npm run dev
```

```typescript
import { MCPTool } from 'mcp-framework';
import { z } from 'zod';

class GetUser extends MCPTool<{ id: string }> {
    name = 'get_user';
    description = 'Get a user by ID';
    schema = { id: z.string() };

    async execute({ id }: { id: string }) {
        const user = await db.users.findUnique({ where: { id } });
        return JSON.stringify(user);
    }
}
```

### Strengths

- **CLI scaffolding.** Fast project initialization.
- **Class-based tools.** Familiar OOP pattern.
- **Zod validation.** Built-in schema validation.

### Limitations

- **Class-based API.** Requires boilerplate compared to fluent builders. Each tool is a class with manual property declarations.
- **No Presenter pattern.** Responses are still `JSON.stringify()`.
- **No middleware pipeline.** No tRPC-style context derivation.
- **No error recovery hints.** No `toolError()` equivalent.
- **No action consolidation.** Each tool is one MCP tool — no discriminator routing.
- **No field stripping.** No schema-as-security-boundary.
- **No code generators.** No OpenAPI, Prisma, or n8n generation.
- **No serverless adapters.** No Vercel, Cloudflare, or AWS deployment.
- **No governance, testing, or observability frameworks.**

**Best for:** Developers who prefer class-based OOP patterns and want a quick CLI scaffold.

---

## 4. EasyMCP (TypeScript) {#easymcp}

EasyMCP is a minimalist TypeScript framework with an Express-like API. It gives you a clean, intuitive way to define tools, prompts, and resources, with experimental decorator support.

### What you get

```typescript
import EasyMCP from 'easy-mcp';

const server = new EasyMCP('my-server');

server.tool('getUser', { id: 'string' }, async ({ id }) => {
    return await db.users.findUnique({ where: { id } });
});
```

### Strengths

- **Minimal API surface.** Express-like simplicity.
- **Experimental decorators.** Auto-infer types and input configurations.
- **Low barrier to entry.**

### Limitations

- **Minimal is a feature — and a limitation.** No advanced capabilities beyond basic tool/resource/prompt registration.
- **No Presenter pattern, no middleware, no routing, no error recovery, no field stripping, no code generators, no deployment adapters, no governance, no testing harness.**
- **Community project.** Smaller ecosystem and less active development.

**Best for:** Single-purpose MCP servers with a handful of tools. Weekend projects. Learning MCP concepts.

---

## 5. Vurb.ts (TypeScript) {#vurb-ts}

Vurb.ts is a **full-stack architecture layer** for the Model Context Protocol. It introduces the **MVA (Model-View-Agent)** pattern — built from the ground up for agentic workloads — where the **Presenter** replaces `JSON.stringify()` with a deterministic perception layer that controls what the agent sees, understands, and does next.

### What you get

```bash
vurb create my-server
cd my-server && vurb dev
```

```typescript
import { initVurb, createPresenter, suggest, ui, t } from '@vurb/core';
import { z } from 'zod';

const f = initVurb<AppContext>();

const UserPresenter = createPresenter('User')
    .schema({ id: t.string, name: t.string, email: t.string })
    .rules(['Email addresses are PII. Anonymize in summaries.'])
    .redactPII(['*.ssn', '*.credit_card'])
    .suggest((user) => [
        suggest('users.update', 'Modify user profile', { id: user.id }),
    ])
    .limit(50);

export default f.query('users.get')
    .describe('Get a user by ID')
    .withString('id', 'User ID')
    .returns(UserPresenter)
    .use(requireAuth)
    .handle(async (input, ctx) => ctx.db.users.findUnique({
        where: { id: input.id, tenantId: ctx.user.tenantId },
    }));
```

### What sets Vurb.ts apart

Every other framework on this list solves the **plumbing** problem: transport, validation, scaffolding. Vurb.ts solves the **perception** problem — what happens between your database and the LLM's context window. That distinction matters, because the number-one cause of AI agent failures isn't broken transport — it's broken context.

Here's what Vurb.ts brings to the table that no other MCP framework offers:

1. **Presenters (MVA View layer).** Zod schema as security boundary, system rules, UI blocks (ECharts, Mermaid), suggested actions, and cognitive guardrails — all in a single reusable object.

2. **Agentic HATEOAS.** `.suggest()` provides explicit next-action hints based on data state. The agent follows affordances instead of hallucinating tool names.

3. **FSM State Gate.** Physically removes tools from `tools/list` based on workflow state. If the cart is empty, `cart.pay` literally doesn't exist.

4. **DLP Compliance Engine.** `.redactPII()` compiles V8-optimized redaction via `fast-redact`. Late Guillotine pattern — UI logic uses full data, wire payload is sanitized.

5. **Agent Skills.** Progressive three-layer instruction distribution via the [agentskills.io](https://agentskills.io) standard. Zero context window waste.

6. **Zero-Trust Sandbox.** LLM sends JavaScript to your data (sealed V8 isolate) instead of shipping data to the LLM.

7. **State Sync.** RFC 7234-inspired cache-control signals prevent temporal blindness.

8. **Capability Governance.** Nine-module suite for SOC2-auditable deployments: lockfile, contract diffing, blast-radius analysis, HMAC-SHA256 attestation.

9. **Code Generators.** OpenAPI → MCP, Prisma → MCP, n8n → MCP. One command.

10. **Serverless Adapters.** `@vurb/vercel` for Vercel Edge, `@vurb/cloudflare` for Cloudflare Workers, `@vurb/aws` for Lambda.

11. **Inspector.** Real-time terminal dashboard via Shadow Socket — no stdio interference.

12. **Testing Harness.** `@vurb/testing` runs the full MVA pipeline in RAM. Assert every layer: data, systemRules, uiBlocks. Zero tokens consumed.

**Best for:** Production MCP servers. Enterprise deployments. Teams that care about security, token economics, and deterministic AI behavior.

---

## Feature-by-Feature Comparison Matrix {#comparison-matrix}

| Capability | Official SDK | FastMCP (Python) | mcp-framework | EasyMCP | **Vurb.ts** |
|---|:---:|:---:|:---:|:---:|:---:|
| **Language** | TS / Python | Python | TypeScript | TypeScript | **TypeScript** |
| **Zod validation** | ✅ | ❌ (Pydantic) | ✅ | Partial | **✅** |
| **Fluent builder API** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **file-based routing** | ❌ | ❌ | ✅ | ❌ | **✅** |
| **Middleware pipeline** | ❌ | ✅ (v2.9+) | ❌ | ❌ | **✅ (pre-compiled)** |
| **Action consolidation** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Presenter / View layer** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Field stripping (egress firewall)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **PII redaction (GDPR/LGPD/HIPAA)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Domain context / system rules** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Agentic HATEOAS (suggest actions)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Cognitive guardrails (agent limit)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Self-healing errors** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **FSM state gating** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **State sync (cache signals)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **TOON encoding (token reduction)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **UI blocks (ECharts, Mermaid)** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **tRPC-style typed client** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Zero-trust sandbox** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Agent Skills** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **OpenAPI generator** | ❌ | ✅ (v2+) | ❌ | ❌ | **✅** |
| **Prisma generator** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **n8n connector** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Vercel adapter** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Cloudflare adapter** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **AWS Lambda connector** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **OAuth / JWT / API Key** | ❌ | ✅ | ❌ | ❌ | **✅** |
| **Governance lockfile** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Inspector / debugger** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Testing harness** | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Resource subscriptions** | ✅ | ✅ | ❌ | ❌ | **✅** |
| **Prompt engine** | ✅ | ✅ | ❌ | ✅ | **✅** |

---

## The Core Problem None of These Solve (Except One) {#the-core-problem}

Every MCP framework on the market — except Vurb.ts — treats the MCP server as a **proxy** between a database and an LLM. The pattern is always the same:

```
Database → JSON.stringify() → LLM Context Window
```

This is the root cause of **three catastrophic failures** in production AI systems:

### 1. Data Exfiltration

`JSON.stringify(user)` sends every column to the LLM provider: `password_hash`, `ssn`, `internal_margin`, `stripe_token`. One field is one GDPR violation. No other framework provides schema-as-security-boundary.

### 2. Context DDoS

An unbounded `findMany()` dumps 10,000 rows into the context window. At ~500 tokens per row, that's 5 million tokens — an $8.75 API call that overwhelms the LLM and produces hallucinated nonsense.

### 3. Semantic Blindness

The LLM receives `{ amount_cents: 45000 }` and displays **$45,000** instead of **$450.00**. There are no domain rules, no context, no guidance. The agent guesses — and guesses wrong.

These aren't edge cases. They happen on **every single MCP server** that uses `JSON.stringify()` — which is all of them, except those built with Vurb.ts.

---

## Architecture Deep Dive: Why Raw MCP Servers Fail in Production {#architecture-deep-dive}

Let's trace a real request through a raw MCP server and a Vurb.ts server to see the difference.

### Raw MCP Server

```
1. Agent calls 'get_invoice' with { id: 'inv_123' }
2. Handler fetches invoice from database
3. JSON.stringify(invoice) → sends everything:
   { id, amount_cents, status, customer_ssn, password_hash,
     internal_margin, stripe_customer_id, ... }
4. LLM receives raw blob
5. LLM guesses: "$45,000" (wrong — it's $450.00)
6. LLM doesn't know what to do next — hallucinate a tool name?
7. No error recovery if the ID is wrong
```

### Vurb.ts with MVA

```
1. Agent calls 'billing.get_invoice' with { id: 'inv_123' }
2. Zod validates input and strips hallucinated params
3. Middleware authenticates, resolves tenant
4. Handler fetches invoice from database (raw data)
5. Presenter transforms the response:
   a. Schema strips: password_hash, internal_margin, customer_ssn → GONE
   b. PII redaction: stripe_customer_id → [REDACTED]
   c. System rules: "amount_cents is in CENTS. Divide by 100."
   d. UI blocks: ECharts gauge chart for invoice value
   e. Suggested actions: "billing.pay — Invoice is pending"
6. Agent receives structured perception package
7. Agent displays $450.00 correctly
8. Agent follows HATEOAS to call billing.pay
```

This isn't an incremental improvement. It's architectural. The Presenter is a **deterministic perception layer** — the agent can't misinterpret the data, can't see restricted fields, and can't hallucinate the next action.

---

## The MVA Solution: Presenters as a Perception Layer {#mva-solution}

The **Model-View-Agent (MVA)** pattern replaces MVC for the AI era. In MVC, the View renders HTML for humans. In MVA, the Presenter renders structured perception packages for AI agents.

```
Handler (Model)          Presenter (View)              Agent (LLM)
═══════════════          ════════════════              ═══════════
Raw DB data        →     Zod-validated schema      →   Structured
{ amount_cents,          + System rules                perception
  password_hash,         + UI blocks (charts)          package
  internal_margin,       + Suggested next actions
  ssn, ... }             + PII redaction
                         + Cognitive guardrails
                         - password_hash  ← STRIPPED
                         - internal_margin ← STRIPPED
                         - ssn ← REDACTED
```

### Presenter Code Example

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema({
        id:           t.string,
        amount_cents: t.number.describe('Amount in cents — divide by 100'),
        status:       t.enum('paid', 'pending', 'overdue'),
    })
    .rules((inv) => [
        'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.',
        inv.status === 'overdue'
            ? 'This invoice is OVERDUE. Alert the user immediately.'
            : null,
    ])
    .redactPII(['*.customer_ssn', '*.credit_card'])
    .ui((inv) => [
        ui.echarts({
            series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }],
        }),
    ])
    .suggest((inv) =>
        inv.status === 'pending'
            ? [suggest('billing.pay', 'Invoice pending — process payment')]
            : [suggest('billing.archive', 'Invoice settled — archive it')]
    )
    .embed('client', ClientPresenter)
    .embed('line_items', LineItemPresenter)
    .limit(50);
```

The Presenter is **defined once and reused everywhere**. Every tool that returns an invoice uses the same `InvoicePresenter`. Domain rules, field stripping, UI, and affordances are consistent across the entire API surface — no copy-paste, no divergence.

---

## Anti-Hallucination Mechanisms: A Technical Breakdown {#anti-hallucination}

Vurb.ts implements **eight compounding anti-hallucination mechanisms** — none of which exist in any other MCP framework:

| # | Mechanism | What It Does | Token Impact |
|---|---|---|---|
| ① | **Action Consolidation** | Groups 50+ tools behind one MCP tool with enum discriminator | ↓ 10x prompt tokens |
| ② | **TOON Encoding** | Pipe-delimited compact format for tool descriptions | ↓ 30–50% token reduction |
| ③ | **Zod `.strict()`** | Rejects hallucinated parameters at build time | ↓ retries |
| ④ | **Self-Healing Errors** | Directed correction prompts with suggested retry arguments | ↓ retries |
| ⑤ | **Cognitive Guardrails** | `.limit()` truncates before the LLM sees it | ↓ 100x token reduction |
| ⑥ | **Agentic HATEOAS** | Next-action hints computed from data state | ↓ wrong-tool retries |
| ⑦ | **JIT Context Rules** | Rules travel with data, not in the global system prompt | ↓ prompt bloat |
| ⑧ | **State Sync** | RFC 7234 cache-control signals | ↓ redundant requests |

Each mechanism compounds. Fewer tokens → less noise → better accuracy → fewer retries → lower cost. It's a virtuous cycle.

### Real-World Cost Comparison

| Scenario | Raw MCP Server | Vurb.ts |
|---|---|---|
| 10,000 user rows | ~$2.40 per call (5M tokens) | ~$0.02 per call (25K tokens) |
| 50 registered tools | ~5,000 prompt tokens | ~500 prompt tokens (consolidated) |
| Wrong tool selection | 3–5 retries (hallucination) | 0 retries (HATEOAS) |
| Stale data re-fetch | Every call | Only when invalidated |

---

## Code Generation: From OpenAPI, Prisma, and n8n to MCP {#code-generation}

Hand-coding every MCP tool doesn't scale when you already have an API surface. Vurb.ts automates the boring parts:

### OpenAPI → MCP in One Command

```bash
npx openapi-gen generate -i ./petstore.yaml -o ./generated
```

Generates typed models (Zod `.strict()`), Presenters, tool definitions, and a server bootstrap. HTTP method → MCP annotation inference: `GET` → `readOnly`, `DELETE` → `destructive`. Runtime proxy mode available with `loadOpenAPI()` for instant prototyping.

### Prisma → MCP with Field-Level Security

```prisma
generator mcp {
  provider = "vurb-prisma-gen"
  output   = "../src/tools/database"
}

model User {
  id           String @id @default(uuid())
  email        String @unique
  passwordHash String /// @vurb.hide
  stripeToken  String /// @vurb.hide
  tenantId     String /// @vurb.tenantKey
}
```

`npx prisma generate` → typed CRUD tools with pagination, tenant isolation, and field-level security. Cross-tenant access is structurally impossible.

### n8n Workflows → MCP Tools

```typescript
const n8n = await createN8nConnector({
    url: process.env.N8N_URL!,
    apiKey: process.env.N8N_API_KEY!,
    includeTags: ['ai-enabled'],
    pollInterval: 60_000,
});
```

n8n handles Stripe, Salesforce, and webhook logic. Vurb.ts adds typing, Presenters, and access control. No other MCP framework has anything like this.

---

## Enterprise Security: PII Redaction, Governance, and Audit Trails {#enterprise-security}

### DLP Compliance Engine

`.redactPII()` compiles a V8-optimized redaction function via `fast-redact`. The **Late Guillotine Pattern** means UI logic runs with full data, but the wire payload to the LLM is sanitized. GDPR Article 25, LGPD, HIPAA — compliance is structural, not procedural.

### Capability Governance

Nine modules for SOC2-auditable AI deployments:

```bash
vurb lock --server ./src/server.ts      # Generate lockfile
vurb lock --check --server ./src/server.ts  # Gate CI builds
```

- **Capability Lockfile** — Git-diffable artifact capturing every tool's behavioral contract
- **Surface Integrity** — SHA-256 behavioral fingerprinting
- **Contract Diffing** — Semantic delta engine with severity classification
- **Zero-Trust Attestation** — HMAC-SHA256 signing, runtime verification
- **Blast Radius Analysis** — Entitlement scanning with evasion detection

### Security Layer

Four composable middlewares that replace regex-based defenses with LLM-as-Judge evaluation:

- **InputFirewall** — Validates tool arguments against prompt injection
- **PromptFirewall** — Evaluates dynamic system rules before they reach the agent
- **RateLimiter** — Sliding-window throttling with two-phase increment/record
- **AuditTrail** — SHA-256 argument hashing, SOC2 CC6.1/CC6.3/CC7.2 mapping

---

## Deployment: Serverless, Edge, and Beyond {#deployment}

Every Vurb.ts tool is transport-agnostic. The same `ToolRegistry` runs on Stdio, SSE, and serverless:

```typescript
// Vercel Edge Functions
import { vercelAdapter } from '@vurb/vercel';
export const POST = vercelAdapter({ registry, contextFactory });
export const runtime = 'edge';

// Cloudflare Workers
import { cloudflareWorkersAdapter } from '@vurb/cloudflare';
export default cloudflareWorkersAdapter({ registry, contextFactory });
```

No other MCP framework provides one-line serverless adapters. FastMCP (Python) and the official SDK require manual HTTP bridging; mcp-framework and EasyMCP don't address deployment at all.

---

## Testing: The Death of Vibes-Based QA {#testing}

The standard testing methodology for MCP servers today: start a Node.js server, open Claude Desktop, type a prompt, wait, squint at the output, and pray. Vurb.ts replaces this with **deterministic, in-memory pipeline testing**:

```typescript
import { createVurbTester } from '@vurb/testing';

const tester = createVurbTester(registry, {
    contextFactory: () => ({ prisma: mockPrisma, tenantId: 't_42', role: 'ADMIN' }),
});

describe('SOC2 Data Governance', () => {
    it('strips PII before it reaches the LLM', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });
        for (const user of result.data) {
            expect(user).not.toHaveProperty('passwordHash');
        }
    });

    it('sends governance rules with data', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });
        expect(result.systemRules).toContain('Email addresses are PII.');
    });

    it('blocks guest access', async () => {
        const result = await tester.callAction('db_user', 'find_many',
            { take: 5 }, { role: 'GUEST' });
        expect(result.isError).toBe(true);
    });
});
```

Assert every MVA layer: `result.data` (egress firewall), `result.systemRules` (JIT rules), `result.uiBlocks` (server-rendered charts), `result.isError` (middleware guards). Zero tokens consumed. Runs in CI/CD in under 500ms.

---

## When to Use What: Decision Framework {#decision-framework}

| Your Scenario | Recommended Framework |
|---|---|
| **Learning MCP protocol concepts** | Official SDK |
| **Python-first team, quick prototype** | FastMCP |
| **Class-based OOP preference, quick scaffold** | mcp-framework |
| **Weekend project, handful of tools** | EasyMCP |
| **Production server with >10 tools** | **Vurb.ts** |
| **Enterprise with compliance requirements** | **Vurb.ts** |
| **Need to protect PII from the LLM** | **Vurb.ts** (only option) |
| **Multi-tenant SaaS MCP backend** | **Vurb.ts** |
| **Existing REST API → MCP migration** | **Vurb.ts** (OpenAPI generator) |
| **Prisma database → MCP tools** | **Vurb.ts** (Prisma generator) |
| **Serverless / edge deployment** | **Vurb.ts** (Vercel / Cloudflare adapters) |

---

## Getting Started with Vurb.ts in 30 Seconds {#getting-started}

```bash
# Scaffold a production-ready MCP server
vurb create my-server
cd my-server && vurb dev
```

Choose a vector to match your use case:

```bash
# Database-driven server with Presenter egress firewall
vurb create my-api --vector prisma --transport sse --yes

# REST API → MCP in one command
vurb create petstore --vector openapi --yes

# Bridge n8n workflows to any MCP client
vurb create ops-bridge --vector n8n --yes
```

Drop a file in `src/tools/`, restart — it's a live MCP tool:

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
├── users/
│   ├── list.ts         → users.list
│   └── ban.ts          → users.ban
└── system/
    └── health.ts       → system.health
```

Works out of the box with **Cursor**, **Claude Desktop**, **Claude Code**, **Windsurf**, **Cline**, and **VS Code + GitHub Copilot**.

---

## The Future of MCP Server Development

MCP is not a fad. It's the interface layer between AI agents and the real world — and 2026 is the year it goes from experimental pilots to enterprise-wide production.

The frameworks that survive this transition will be the ones that tackle the **hard problems**: security, governance, token economics, and deterministic agent behavior. `JSON.stringify()` won't cut it when your AI agent handles customer PII, processes financial transactions, or runs critical infrastructure.

Vurb.ts was built for that reality. Start building:

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

[**Read the full documentation →**](https://vurb.vinkius.com/)

[**GitHub Repository →**](https://github.com/vinkius-labs/vurb.ts)

---

*Follow [@renatomarinho](https://github.com/renatomarinho) and [Vinkius Labs](https://github.com/vinkius-labs) on GitHub for updates.*
