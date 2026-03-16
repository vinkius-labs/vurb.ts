---
title: "Every MCP Framework Supports AI Agents. Only One Ships an Executable Contract."
date: 2026-03-15
author: Renato Marinho
authorUrl: https://github.com/renatomarinho
description: "llms.txt and SKILL.md are open standards any framework can adopt. Most use them for documentation. Vurb.ts treats SKILL.md as an executable specification — every Fluent API method, every Presenter rule, every anti-pattern — so your AI agent writes correct code on the first pass."
tags:
  - skill-md
  - llms-txt
  - mcp
  - framework
  - comparison
  - ai-agent
  - typescript
  - vscode
  - cursor
image: https://site-assets.vinkius.com/vk/icon-v-black-min.png
---

# Every MCP Framework Supports AI Agents. Only One Ships an Executable Contract.

The AI agent ecosystem has standardized around two open formats: [`llms.txt`](https://llmstxt.org) for documentation discoverability and [`SKILL.md`](https://agentskills.io) for teaching agents specialized workflows. By early 2026, adoption is everywhere — Angular, Anthropic, Vercel, Cloudflare, Supabase, Google, Mintlify, Fern, Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Cline.

So if everyone supports these standards, what actually differentiates one framework from another?

**How deeply they integrate them.**

---

## Table of Contents

- [The Landscape: Who Uses What](#the-landscape)
- [The Gap Between "Supporting" and "Integrating"](#the-gap)
- [How Vurb.ts Uses SKILL.md Differently](#how-vurb-uses-skill-md)
- [Side-by-Side: Guide vs. Executable Contract](#side-by-side)
- [Security Tied to the Spec](#security-tied-to-spec)
- [What This Means in Practice](#in-practice)
- [The Honest Take](#honest-take)

---

## The Landscape: Who Uses What {#the-landscape}

### llms.txt — Documentation for LLMs

`llms.txt` is a proposed standard (llmstxt.org) that helps AI models find and understand your documentation. It's a curated Markdown file served at `/llms.txt` — essentially a `robots.txt` for reasoning engines.

Companies shipping `llms.txt` today:

| Company / Project | What They Use It For |
|---|---|
| **Anthropic** | API docs discoverability |
| **Vercel** | API documentation |
| **Cloudflare** | Navigation of their docs ecosystem |
| **Google** | Multiple API product docs |
| **Angular** | Help LLMs generate modern Angular code |
| **Supabase** | Client library documentation |
| **LangChain** | Framework documentation |
| **Mintlify / Fern** | Auto-generate llms.txt from hosted docs |
| **ElysiaJS** | Framework docs (built-in generator) |

The pattern is consistent: `llms.txt` tells the LLM *where to find information*. It doesn't tell the agent *how to write code*.

### SKILL.md — Instructional Skills for Agents

`SKILL.md` (agentskills.io) is an open standard released by Anthropic in December 2025. It packages domain-specific knowledge into reusable modules that AI agents can discover and consume.

Agents that support SKILL.md:

| Agent | How It Loads Skills |
|---|---|
| **Claude Code** | Auto-discovers from `.claude/` directory |
| **Cursor** | Reads from `.cursor/rules` or project context |
| **GitHub Copilot** | Via `.github/copilot-instructions.md` or agent skills |
| **OpenAI Codex** | Built-in `$skill-creator`, auto-discovery |
| **Windsurf** | Cascade rules or direct context |
| **Cline** | Auto-reads from `.cline/` directory |
| **Antigravity** | Auto-reads from `.agents/skills/` |

The standard pattern: a SKILL.md teaches the agent *how to approach a task* — coding standards, preferred tools, team workflows. It's a guide. A set of instructions the agent follows loosely to produce better output.

Here's the critical question: **does any MCP framework use SKILL.md as something more than a guide?**

---

## The Gap Between "Supporting" and "Integrating" {#the-gap}

I searched every major MCP framework to answer this question.

**FastMCP** (Python) — no SKILL.md shipped. No llms.txt. The framework relies on the agent's training data to understand its decorator-based API.

**@modelcontextprotocol/sdk** (TypeScript) — the official SDK. No SKILL.md. No llms.txt. You register tools with `server.tool()` and `JSON.stringify()` your responses. The agent has to guess the patterns.

**PydanticAI** — Python framework with type safety via Pydantic. No SKILL.md. Agents use it well because Pydantic is heavily represented in training data — not because the framework provides an explicit contract.

**CrewAI** — multi-agent orchestration. Supports MCP natively, but agents learn conventions from training data and docs, not from a shipped specification.

**OpenAI Agents SDK** — supports MCP connection, low learning curve for humans. No SKILL.md that describes the framework's own API for agent consumption.

**Google ADK** — agent development kit optimized for Gemini. MCP support, but no SKILL.md contract for the framework itself.

**LangGraph** — advanced state management for multi-step workflows. Steep learning curve for humans *and* agents. No embedded specification.

None of them ship a SKILL.md that acts as an executable contract for their own framework's API. The agent has to figure out the framework's conventions from training data, RAG retrieval, or the developer's explicit instructions in the prompt.

---

## How Vurb.ts Uses SKILL.md Differently {#how-vurb-uses-skill-md}

Vurb.ts doesn't use SKILL.md as a getting-started guide. It uses it as a **typed behavioral contract** — a document that declares:

1. **Every builder method** with its exact signature and semantics
2. **Every Presenter composition rule** — `.schema()`, `.rules()`, `.redactPII()`, `.suggest()`, `.ui()`
3. **Every file-based routing convention** — `src/tools/billing/pay.ts` → `billing.pay`
4. **Every middleware pattern** — `.use()` chain with tRPC-style context derivation
5. **Every anti-pattern** — what the agent must *never* generate

That last one is the critical piece. Most SKILL.md files tell the agent what to do. Vurb.ts also tells the agent what **not** to do:

```
❌ JSON.stringify() in tool responses — use Presenters
❌ Manual server.tool() registration — use autoDiscover()
❌ Global system prompts for domain rules — use .rules()
❌ Unbounded findMany() — use .limit()
❌ Password/token fields in Presenter schema — they leak
```

Without anti-patterns, the agent falls back to its training-data defaults. The most statistically likely MCP pattern in any LLM's training corpus is `server.tool('name', schema, handler)` with `JSON.stringify()`. The anti-patterns section overrides that prior — the agent knows it should generate `f.query().returns(Presenter)` instead.

This is the difference between a SKILL.md that says "here's how our framework works" and one that says **"here's the exact code you must write, and here's the code you must never write."**

---

## Side-by-Side: Guide vs. Executable Contract {#side-by-side}

| Aspect | Typical SKILL.md (guide) | Vurb.ts SKILL.md (executable contract) |
|---|---|---|
| **Purpose** | Teach the agent workflows, preferences, team conventions | Declare every API method, parameter type, composition rule |
| **Specificity** | "Use TypeScript. Follow our coding standards." | `f.query(name).withString(key, desc).returns(Presenter).handle(fn)` |
| **Anti-patterns** | Rarely included | Explicit list of what the agent must never generate |
| **Code generation** | Agent produces *better* code, fewer errors | Agent produces *correct* code on the first pass |
| **Security integration** | Not addressed — skills focus on DX | Presenter redaction, FSM state gates, governance lockfile bound to the spec |
| **Validation** | Manual review | Agent output compiles against the contract |

---

## Security Tied to the Spec {#security-tied-to-spec}

This is where the integration goes deeper than any other framework.

In most SKILL.md implementations, security is a separate concern. The skill teaches the agent how to use the API. Security is handled elsewhere — middleware configs, environment variables, separate documentation.

In Vurb.ts, security primitives are part of the SKILL.md contract:

### Presenter Redaction

```
.redactPII(['ssn', 'diagnosis', 'internal_margin'])
```

The agent knows — from reading the spec — that these fields must be redacted. It generates the redaction call as part of the Presenter definition, not as an afterthought.

### FSM State Gating

```
.bindState('approved', 'PAY')
```

The agent knows that a payment tool should be invisible until the entity reaches `approved` state. The FSM is part of the specification, not a separate configuration file the agent might miss.

### Governance Lockfile

```
vurb.lock — SHA-256 hash per tool contract
```

The lockfile captures the exact API surface. If the agent generates a tool that doesn't match the declared contract, CI breaks. This creates a feedback loop: the spec defines what the agent generates, and the lockfile enforces that the output matches the spec.

**No other MCP framework ties security primitives to the agent's instruction set.** Other frameworks handle security in middleware, environment config, or infrastructure — all invisible to the agent at code generation time.

---

## What This Means in Practice {#in-practice}

A developer gives their agent a prompt:

```
"Build an MCP server for patient records with Prisma.
 Redact SSN and diagnosis. FSM that gates discharge
 until attending physician signs off."
```

### Without an executable contract (any other framework):

The agent generates `server.tool('discharge_patient', ...)` with `JSON.stringify(patient)`. SSN and diagnosis are in the response. There's no FSM. The developer has to manually add redaction, state gating, and Presenter logic — then debug when the agent's second pass introduces regressions.

### With Vurb.ts SKILL.md:

The agent reads the spec and generates:

- `f.mutation('patients.discharge')` — correct semantic verb
- `.returns(PatientPresenter)` with `.redactPII(['ssn', 'diagnosis'])` — PII never reaches the LLM
- `.bindState('cleared', 'DISCHARGE')` — discharge tool is invisible until physician signs off
- File placed in `src/tools/patients/discharge.ts` — correct routing convention

First pass. No corrections. Security built in from the start.

---

## The Honest Take {#honest-take}

Vinkius didn't invent `llms.txt` or `SKILL.md`. These are open standards that anyone can adopt — and many have.

**What Vinkius does differently is treat SKILL.md as an executable specification rather than an instructional guide.** Every builder method, every Presenter composition rule, every anti-pattern, every security primitive — declared in the spec so the agent compiles against it rather than approximating from training data.

If you want **pure interoperability**: use the open standards directly — `agentskills.io` + `llmstxt.org` — on whatever stack you prefer. They work.

If you want **an AI agent that writes production-grade, security-compliant MCP servers on the first prompt**: Vurb.ts ships the only SKILL.md we've found that functions as an executable architectural contract.

Other frameworks will likely adopt this approach. But today, Vurb.ts is the one that's shipping it.

---

**[Read the SKILL.md specification →](https://agentskills.io)**

**[Get started with Vurb.ts →](https://vurb.vinkius.com/quickstart)**

**[GitHub Repository →](https://github.com/vinkius-labs/vurb.ts)**

---

*Follow [@renatomarinho](https://github.com/renatomarinho) and [Vinkius Labs](https://github.com/vinkius-labs) on GitHub for updates.*
