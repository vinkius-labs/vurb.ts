---
title: Introducing Vurb.ts
date: 2026-03-13
author: Renato Marinho
authorUrl: https://github.com/renatomarinho
description: Discover Vurb.ts — a framework that brings the MVA pattern, Presenters, and a world-class developer experience to the Model Context Protocol.
tags:
  - announcement
  - mcp
  - framework
image: https://site-assets.vinkius.com/vk/icon-v-black-min.png
---

The Model Context Protocol (MCP) is quickly becoming the standard interface between AI agents and external capabilities. But building production-grade MCP servers today still requires gluing together transports, validation, error handling, observability, and auth — all from scratch.

**Vurb.ts** changes that.

## Why Vurb.ts

Vurb.ts is the **AI-First Developer Experience** for the Model Context Protocol. It introduces the **MVA (Model-View-Agent)** architectural pattern — a paradigm designed specifically for agentic workloads — alongside a rich toolkit that lets you ship production-ready MCP servers in minutes instead of days.

### What you get out of the box

| Capability | What it does |
|---|---|
| **Presenters** | A deterministic View layer for AI agents — structure perception, consolidate actions, and apply cognitive guardrails. |
| **Zod-first tools** | Define tool schemas with Zod; input validation, type inference, and documentation are derived automatically. |
| **Middleware pipeline** | Auth, rate-limiting, logging, and custom logic — composable and reusable. |
| **Error self-healing** | Structured error responses that guide the agent to fix and retry, rather than fail silently. |
| **Governance** | Capability lockfiles, contract diffing, blast-radius analysis, and zero-trust attestation. |

## The MVA Pattern

Traditional MVC was designed for human-driven request cycles. Agent-driven workflows have fundamentally different needs:

- **Agents don't render HTML** — they consume structured perception packages.
- **Agents don't click buttons** — they select affordances exposed by the server.
- **Agents can hallucinate** — cognitive guardrails are a first-class concern.

The **Model-View-Agent** pattern addresses all three. The *Presenter* replaces the controller+view responsibilities and acts as the deterministic bridge between your business logic and the non-deterministic agent.

## Getting started

Install the framework and create your first server in under a minute:

```bash
npx mcp-fusion init my-server
cd my-server
npm run dev
```

Then connect it to Claude Desktop, Cursor, Windsurf, or any MCP-compatible client.

Read the full [Quickstart — Lightspeed](/quickstart-lightspeed) guide for a step-by-step walkthrough.

## What's next

We're actively working on more adapters, deeper governance tooling, and an expanded ecosystem of data connectors. Stay tuned for upcoming posts on:

- Deep dive into the MVA pattern and Presenters
- Production deployment strategies with Vercel, Cloudflare, and AWS
- Building enterprise-grade MCP servers with multi-tenancy and audit trails

---

*Follow us on [GitHub](https://github.com/vinkius-labs/vurb.ts) to stay up to date.*
