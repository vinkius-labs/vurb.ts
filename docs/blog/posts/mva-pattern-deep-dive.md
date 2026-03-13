---
title: "MVA Pattern Deep Dive: Rethinking Architecture for AI Agents"
date: 2026-03-13
author: Renato Marinho
authorUrl: https://github.com/renatomarinho
description: An in-depth exploration of the Model-View-Agent pattern — why MVC falls short for agentic workloads and how MVA solves perception, affordances, and guardrails.
tags:
  - architecture
  - mva
  - presenter
image: https://site-assets.vinkius.com/vk/icon-v-black-min.png
---

For decades, **MVC (Model-View-Controller)** has been the default architecture for web applications. It provides a clean separation of concerns between data, presentation, and user interaction. But AI agents are not users — and treating them as such leads to fragile, inefficient, and unpredictable systems.

This article explores **MVA (Model-View-Agent)**, the architectural pattern at the heart of Vurb.ts, and explains why it's purpose-built for the agentic era.

## The problem with MVC for agents

In a traditional MVC workflow:

1. A **user** sends a request (clicks a link, submits a form).
2. The **controller** processes the request and updates the **model**.
3. The **view** renders a response — HTML, JSON, or a template — for the user to consume.

When an AI agent takes the place of the user, every assumption breaks:

| MVC assumption | Agent reality |
|---|---|
| The consumer renders visual UI | Agents consume structured data |
| The consumer has spatial awareness | Agents have a context window with token limits |
| The consumer selects from visible options | Agents must be told what actions are available |
| The consumer won't hallucinate next steps | Agents frequently hallucinate unless constrained |

## Enter the MVA pattern

MVA replaces the **View + Controller** with a single concept: the **Presenter**.

```
┌─────────┐      ┌─────────────┐      ┌───────┐
│  Agent   │ ←──→ │  Presenter  │ ←──→ │ Model │
└─────────┘      └─────────────┘      └───────┘
```

The Presenter is responsible for three things:

### 1. Perception — what the agent sees

Instead of rendering HTML, the Presenter builds a **Perception Package** — a structured object that contains exactly the data the agent needs to make its next decision. No more, no less.

```typescript
presenter.perceive(({ data, ui }) => {
  ui.text(`Order #${data.order.id} is ${data.order.status}.`);
  ui.table(data.order.items, ['name', 'quantity', 'price']);
});
```

The Presenter applies **context tree-shaking** to strip unnecessary fields, keeping the payload lean for the agent's context window.

### 2. Affordances — what the agent can do

Instead of relying on the agent to guess its next available actions, the Presenter explicitly exposes **affordances** — a concept borrowed from ecological psychology and HCI design.

```typescript
presenter.afford('approve-order', {
  when: data.order.status === 'pending',
  description: 'Approve this order for fulfillment.',
});

presenter.afford('cancel-order', {
  when: data.order.status !== 'shipped',
  description: 'Cancel this order and issue a refund.',
});
```

Affordances are the agentic equivalent of HATEOAS links — they tell the agent what transitions are possible from the current state.

### 3. Guardrails — what the agent must not do

**Cognitive guardrails** constrain the agent's behavior at the protocol level, preventing hallucinated tool calls, out-of-scope actions, and malformed parameters.

```typescript
presenter.guardrail({
  maxActions: 1,
  requiredConfirmation: ['cancel-order'],
  blockedPatterns: [/DROP TABLE/i],
});
```

Guardrails are enforced server-side — the agent cannot bypass them, regardless of its instruction prompt.

## Why this matters

The MVA pattern makes MCP servers:

- **Predictable** — Agents only see valid affordances and structured data.
- **Efficient** — Context tree-shaking minimizes token usage per interaction.
- **Safe** — Guardrails prevent hallucinated actions before they reach your business logic.
- **Testable** — Presenters are pure, deterministic functions that can be unit-tested in isolation.

## Getting started with Presenters

Vurb.ts makes it easy to adopt the MVA pattern:

```typescript
import { createPresenter } from 'mcp-fusion';

export const orderPresenter = createPresenter('order', {
  perceive({ data, ui }) {
    ui.heading(`Order #${data.id}`);
    ui.text(`Status: ${data.status}`);
    ui.table(data.items, ['name', 'qty', 'price']);
  },
  affordances({ data, afford }) {
    afford('ship-order', {
      when: data.status === 'approved',
    });
  },
});
```

Read the full [Presenter Guide](/presenter) for a complete walkthrough.

---

*This is part of our series on Vurb.ts architecture. Next up: "Context Tree-Shaking — Minimizing Token Costs in Agentic Workflows."*
