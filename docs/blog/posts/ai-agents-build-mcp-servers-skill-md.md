---
title: "The End of Framework Documentation: How SKILL.md Lets AI Agents Build Your MCP Server"
date: 2026-03-15
author: Renato Marinho
authorUrl: https://github.com/renatomarinho
description: "Every framework makes you read docs before you write code. Vurb.ts ships a machine-readable SKILL.md that your AI coding agent consumes directly — zero learning curve, deterministic code generation, production-ready MCP servers from a single prompt."
tags:
  - skill-md
  - ai-agent
  - mcp
  - framework
  - zero-learning-curve
  - typescript
  - vscode
  - cursor
  - copilot
image: https://site-assets.vinkius.com/vk/icon-v-black-min.png
---

# The End of Framework Documentation: How SKILL.md Lets AI Agents Build Your MCP Server

Every framework you've ever adopted follows the same loop: read the docs, study the getting-started guide, copy-paste from examples, hit an edge case, search GitHub issues, re-read the docs. Weeks of friction before your first production PR.

Your AI coding agent goes through the exact same cycle — except it's worse. It hallucinates patterns from whatever framework dominated its training data. Ask Cursor to build an MCP server with Hono conventions and you get Express middleware. Ask Claude Code to scaffold a Presenter-based architecture and it invents an API that doesn't exist. The agent has nothing authoritative to reference — it's just pattern-matching against stale training data.

**Vurb.ts breaks this loop entirely.** It ships a `SKILL.md` — a machine-readable architectural contract that any AI coding agent can read before writing a single line of code. The agent doesn't approximate your framework's API. It compiles against the spec.

---

## Table of Contents

- [The Problem with Every Framework Before This](#the-problem)
- [What Is SKILL.md?](#what-is-skill-md)
- [How It Works: From Prompt to Production Server](#how-it-works)
- [Why AI Agents Hallucinate Framework Code](#why-agents-hallucinate)
- [The SKILL.md Contract: What Your Agent Reads](#the-contract)
- [Real Example: Patient Records Server from a Single Prompt](#real-example)
- [Supported AI Coding Agents](#supported-agents)
- [The Paradigm Shift](#paradigm-shift)
- [Getting Started](#getting-started)

---

## The Problem with Every Framework Before This {#the-problem}

Frameworks have always been written for humans. Docs sites, tutorial videos, blog posts, conference talks — every onboarding artifact assumes a human reader who'll internalize patterns over time and reproduce them from memory.

In 2026, more than half of production code ships with AI assistance. Cursor, Claude Code, GitHub Copilot, Windsurf, Cline — these agents are now the primary consumers of your framework's conventions. But they have no reliable way to learn them.

Think about what happens when a developer asks their agent to build an MCP server:

```
"Build an MCP server for invoice management with Prisma,
 PII redaction, and an FSM checkout flow."
```

The agent has three options:

1. **Guess from training data.** Most MCP content in training sets is raw SDK usage — `server.tool('name', schema, handler)` with `JSON.stringify()` responses. The agent generates this pattern because it's statistically dominant, regardless of what framework you're actually using.

2. **Search documentation.** RAG-style approaches are noisy. The agent pulls fragments from the API reference, getting-started guides, and changelog entries — then stitches them into a Frankenstein that may or may not compile.

3. **Read a formal specification.** A structured document that declares every API method, every convention, every composition rule — in a format the agent can consume without ambiguity.

Option 3 didn't exist before Vurb.ts.

---

## What Is SKILL.md? {#what-is-skill-md}

[SKILL.md](https://agentskills.io) is an open standard for shipping machine-readable instructions to AI agents. It's a markdown file with YAML frontmatter that declares:

- **Name and description** — what the skill covers
- **Prerequisites** — what the agent needs before starting
- **Instructions** — step-by-step procedures the agent should follow
- **API surface** — method signatures, parameter types, return types
- **Conventions** — file naming, routing patterns, composition rules
- **Anti-patterns** — what the agent should never do

Think of it as a `tsconfig.json` for AI behavior. TypeScript needs a config file to understand your project's constraints; your AI coding agent needs a spec file to understand your framework's contracts.

Vurb.ts ships its SKILL.md as part of the package. When you scaffold a project with `vurb create`, the spec lands in your repo. Point your agent at it and it knows — with zero ambiguity — how to:

- Define tools using the Fluent API (`f.query()`, `f.action()`, `f.mutation()`)
- Compose Presenters with schema, rules, PII redaction, and suggested actions
- Chain middleware with tRPC-style context derivation
- Structure file-based routing in `src/tools/`
- Configure FSM state gating with `.bindState()`
- Set up State Sync with `.stale()`, `.invalidates()`, and `.cached()`
- Handle errors with `f.error()` and recovery suggestions

---

## How It Works: From Prompt to Production Server {#how-it-works}

Three steps. That's it.

### 1. Agent reads the specification

When your agent opens a Vurb.ts project, it reads the `SKILL.md` file. This happens automatically in Claude Code (via the agent skills directory), or you can explicitly point the agent to the file in Cursor, Copilot, Windsurf, or Cline.

### 2. You describe what you need

```
"Create an MCP server for a multi-tenant SaaS billing system.
 Tools: list invoices, create invoice, process payment.
 JWT auth middleware. Presenters that strip internal_margin
 and customer_ssn. FSM that gates payment until invoice is
 in 'approved' state. State Sync to invalidate invoice lists
 after mutations."
```

### 3. Agent generates idiomatic Vurb.ts code

Not approximations. Not hallucinated APIs. Correct code that uses the exact methods declared in the specification:

```typescript
// src/vurb.ts
import { initVurb } from '@vurb/core';

interface AppContext {
    db: PrismaClient;
    user: { id: string; role: 'admin' | 'billing'; tenantId: string };
}

export const f = initVurb<AppContext>();
```

```typescript
// src/presenters/invoice.presenter.ts
import { createPresenter, t, suggest } from '@vurb/core';

export const InvoicePresenter = createPresenter('Invoice')
    .schema({
        id:           t.string,
        amount_cents: t.number.describe('Amount in cents — divide by 100 for display'),
        status:       t.enum('draft', 'approved', 'paid', 'overdue'),
        customer:     t.string,
        created_at:   t.string,
    })
    .rules((inv) => [
        'CRITICAL: amount_cents is in CENTS. Always divide by 100.',
        inv.status === 'overdue'
            ? 'This invoice is OVERDUE. Flag it to the user immediately.'
            : null,
    ])
    .redactPII(['*.customer_ssn', '*.internal_margin'])
    .suggest((inv) =>
        inv.status === 'approved'
            ? [suggest('billing.pay', 'Invoice approved — process payment')]
            : inv.status === 'draft'
            ? [suggest('billing.approve', 'Review and approve this invoice')]
            : []
    )
    .limit(50);
```

```typescript
// src/tools/billing/pay.ts
import { f } from '../../vurb.js';
import { authMiddleware } from '../../middleware/auth.js';
import { InvoicePresenter } from '../../presenters/invoice.presenter.js';

const gate = f.fsm({
    id: 'invoice-lifecycle',
    initial: 'draft',
    states: {
        draft:    { on: { APPROVE: 'approved' } },
        approved: { on: { PAY: 'paid', REJECT: 'draft' } },
        paid:     { type: 'final' },
    },
});

export default f.mutation('billing.pay')
    .describe('Process payment for an approved invoice')
    .withString('id', 'Invoice ID')
    .withEnum('method', ['card', 'wire', 'ach'] as const, 'Payment method')
    .use(authMiddleware)
    .bindState('approved', 'PAY')
    .invalidates('billing.*')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => {
        return ctx.db.invoice.update({
            where: { id: input.id, tenantId: ctx.user.tenantId },
            data: { status: 'paid', paidAt: new Date() },
        });
    });
```

Every method call is correct. `.bindState()` hides the payment tool until the invoice hits `approved`. `.invalidates('billing.*')` fires State Sync after the mutation. `.redactPII()` strips `customer_ssn` and `internal_margin` before anything reaches the LLM. File-based routing puts the file in `src/tools/billing/`.

**First pass. No corrections. No follow-up prompts.**

---

## Why AI Agents Hallucinate Framework Code {#why-agents-hallucinate}

To understand why SKILL.md works, you need to understand why agents fail without it.

LLMs generate code by predicting the most likely next token given the preceding context. When you ask for "an MCP server with Vurb.ts," the model's training corpus contains:

- **Thousands** of examples using the raw `@modelcontextprotocol/sdk` with `server.tool()` and `JSON.stringify()`
- **Hundreds** of Express/Fastify/Hono patterns that have nothing to do with MCP
- **A handful** of Vurb.ts-specific content — if any

The model defaults to the statistically dominant pattern. This is why your agent generates `server.tool('get_invoice', ...)` with `JSON.stringify(invoice)` instead of `f.query('billing.get_invoice').returns(InvoicePresenter)`. It's not wrong about MCP — it's wrong about *your* framework.

SKILL.md fixes this by injecting the correct patterns into the agent's context window at generation time. The spec overrides training-data priors with authoritative, current, and complete API definitions. The agent doesn't need to have been trained on Vurb.ts — it just needs to read the spec.

This is why the approach is fundamentally different from docs sites, `llms.txt` files, or fine-tuning:

| Approach | Failure Mode |
|---|---|
| **Documentation site** | Agent retrieves fragments, stitches together incomplete patterns |
| **llms.txt** | Description-only — tells the agent *what* the framework does, not *how* to use it |
| **Training data** | Stale. Model was trained months ago. API may have changed. |
| **Fine-tuning** | Expensive, requires retraining, version-locked |
| **SKILL.md** | Complete API contract in the context window. Always current. Zero ambiguity. |

---

## The SKILL.md Contract: What Your Agent Reads {#the-contract}

The Vurb.ts SKILL.md isn't a getting-started guide reformatted for machines. It's a **typed behavioral contract** that declares:

### Builder Methods

Every Fluent API method with its exact signature, parameters, and return type:

```
f.query(name)        → readOnly: true, no side effects
f.action(name)       → neutral, creates or updates
f.mutation(name)     → destructive: true, confirmation dialogs

.describe(text)      → Tool description for agent context
.withString(name, desc)  → Adds string parameter
.withNumber(name, desc)  → Adds number parameter
.withEnum(name, values, desc) → Adds enum parameter
.withOptionalString(name, desc) → Optional string parameter
.use(middleware)     → Attaches middleware
.returns(Presenter)  → Attaches Presenter for output shaping
.handle(fn)          → Terminal — registers the handler
```

### Presenter Composition Rules

How to build Presenters, which methods chain, and what each does:

```
createPresenter(name)
  .schema({ ... })       → Zod-validated whitelist (egress firewall)
  .rules((data, ctx) => [...]) → JIT domain rules
  .redactPII([...paths]) → PII field paths to mask
  .suggest((data) => [...]) → HATEOAS next-action hints
  .ui((data) => [...])   → Server-rendered UI blocks
  .embed(key, Presenter) → Nested Presenter composition
  .limit(n)              → Cognitive guardrail — max items
```

### File-Based Routing Convention

```
src/tools/
├── billing/
│   ├── get_invoice.ts  → billing.get_invoice
│   └── pay.ts          → billing.pay
└── users/
    └── list.ts         → users.list

Export: default export of f.query/f.action/f.mutation builder
```

### Anti-Patterns

What the agent must **never** generate:

```
❌ JSON.stringify() in tool responses — use Presenters
❌ Manual server.tool() registration — use autoDiscover()
❌ Global system prompts for domain rules — use .rules()
❌ Unbounded findMany() — use .limit()
❌ Password/token fields in Presenter schema — they leak
```

This is the critical difference. The anti-patterns section prevents the agent from falling back to its training data defaults. Without it, the most likely generated pattern is the one you're trying to avoid.

---

## Real Example: Patient Records Server from a Single Prompt {#real-example}

Real-world scenario: a healthcare startup needs an MCP server for patient records with HIPAA-compliant data handling.

**The prompt:**

```
"Build an MCP server for patient records with Prisma.
 Redact SSN and diagnosis from LLM output. Add an FSM
 that gates discharge tools until attending physician signs off."
```

**What the agent generates (reading SKILL.md):**

```typescript
// src/presenters/patient.presenter.ts
const PatientPresenter = createPresenter('Patient')
    .schema({
        id: t.string,
        name: t.string,
        ssn: t.string,
        diagnosis: t.string,
        admittedAt: t.string,
        status: t.enum('admitted', 'cleared', 'discharged'),
    })
    .redactPII(['ssn', 'diagnosis'])
    .rules(['HIPAA: SSN and diagnosis are visible in UI blocks but REDACTED in LLM text output.'])
    .suggest((patient) =>
        patient.status === 'cleared'
            ? [suggest('patients.discharge', 'Physician cleared — discharge patient')]
            : patient.status === 'admitted'
            ? [suggest('patients.sign_off', 'Review and sign off for discharge')]
            : []
    );
```

```typescript
// src/tools/patients/discharge.ts
const gate = f.fsm({
    id: 'patient-discharge',
    initial: 'admitted',
    states: {
        admitted:    { on: { SIGN_OFF: 'cleared' } },
        cleared:     { on: { DISCHARGE: 'discharged' } },
        discharged:  { type: 'final' },
    },
});

export default f.mutation('patients.discharge')
    .describe('Discharge a patient from the facility')
    .withString('id', 'Patient ID')
    .use(authMiddleware)
    .bindState('cleared', 'DISCHARGE')
    .returns(PatientPresenter)
    .handle(async (input, ctx) => ctx.db.patient.update({
        where: { id: input.id, tenantId: ctx.user.tenantId },
        data: { status: 'discharged', dischargedAt: new Date() },
    }));
```

The agent produced:

- ✅ Correct Presenter with `.redactPII(['ssn', 'diagnosis'])`
- ✅ FSM that makes `patients.discharge` invisible until the physician signs off
- ✅ HATEOAS suggestions that guide the agent through the workflow
- ✅ HIPAA compliance rule attached to the data, not in a global prompt
- ✅ File-based routing in `src/tools/patients/`
- ✅ Tenant isolation via `ctx.user.tenantId`

This isn't cherry-picked. The agent generates this consistently because it's reading a formal spec — not guessing from training data.

---

## Supported AI Coding Agents {#supported-agents}

SKILL.md works with every major AI coding agent:

| Agent | How to Load SKILL.md |
|---|---|
| **Claude Code** | Auto-discovers via agent skills directory |
| **Cursor** | Reference in `.cursor/rules` or provide as context |
| **GitHub Copilot** | Add to `.github/copilot-instructions.md` or provide as file context |
| **Windsurf** | Reference in cascade rules or provide as context |
| **Cline** | Auto-reads from `.cline/` directory or provide in prompt |
| **VS Code + Copilot Chat** | Attach as `#file` reference in chat |
| **Antigravity** | Auto-reads from `.agents/` skills directory |

The spec is agent-agnostic. If the agent can read a file, it can use SKILL.md.

---

## The Paradigm Shift {#paradigm-shift}

For 30 years, framework adoption has followed the same pattern:

```
1. Framework author writes documentation (for humans)
2. Developer reads documentation
3. Developer writes code
4. Developer hits edge case
5. Developer searches GitHub issues
6. Repeat steps 2-5 until proficient (weeks to months)
```

Vurb.ts flips the model:

```
1. Framework author writes SKILL.md (for agents)
2. Developer describes what they need (natural language)
3. Agent reads SKILL.md
4. Agent writes code (compiles on first pass)
5. Developer reviews the PR
```

This isn't an incremental DX improvement. It's a structural change in how frameworks get consumed. The docs are still there — for humans who want to understand the internals. But the primary consumer of the Vurb.ts API surface is now the agent, and the primary interface is `SKILL.md`.

**You don't learn Vurb.ts. You don't teach your agent Vurb.ts.** You hand it a spec. It writes the server. You review the PR.

---

## Getting Started {#getting-started}

```bash
# Scaffold a new project
vurb create my-server
cd my-server

# Point your agent at the spec
# (Varies by agent — see table above)

# Prompt: describe what you need
# The agent generates idiomatic Vurb.ts code

# Run it
vurb dev
```

Or if you'd rather build by hand:

```bash
npm install @vurb/core @modelcontextprotocol/sdk zod
```

Either way, the SKILL.md is there. Your agent knows the API. Describe the server in plain English. It builds it.

---

**[Read the full documentation →](https://vurb.vinkius.com/)**

**[View the SKILL.md specification →](https://agentskills.io)**

**[GitHub Repository →](https://github.com/vinkius-labs/vurb.ts)**

---

*Follow [@renatomarinho](https://github.com/renatomarinho) and [Vinkius Labs](https://github.com/vinkius-labs) on GitHub for updates.*
