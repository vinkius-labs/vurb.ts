# MVA Architecture

Every software architecture in history assumes a human at the end of the pipeline. MVC renders HTML for browsers. MVVM binds state to visual components. REST exposes resources for mobile apps. All of them rely on a consumer that can **interpret ambiguity**, **navigate inconsistency**, and **apply domain knowledge** that the interface never provided.

AI agents can do none of this. When an agent receives `{ "amount_cents": 45000 }`, it does not *know* it's cents. It does not *know* to divide by 100. It does not *know* that the next action is `billing.pay`. It guesses — and when it guesses wrong, it hallucinates.

**MVA solves this by replacing the human-centric View with the Presenter** — a deterministic perception layer that tells the agent exactly what the data means, how to display it, and what to do next.

## The Three Layers

| Layer | Role | Implemented As |
|---|---|---|
| **Model** | Defines the shape and constraints of domain data. Acts as a security boundary — only declared fields pass through. Configures fillable input profiles, hidden fields, guarded fields, and defaults. | `defineModel('Entity', m => { ... })` |
| **View (Presenter)** | Transforms raw data into a **Structured Perception Package** — data + rules + UI blocks + affordances + guardrails. Domain-level, not tool-level. | `definePresenter()` / `createPresenter()` |
| **Agent** | The autonomous consumer. Receives the perception package and acts deterministically based on the structured context it was given. | Any MCP-compatible LLM (Claude, GPT, Gemini series, or open-weight models) |

## The Core Thesis

**An AI agent should never have to guess.**

Every piece of data should arrive with:
1. **Validation** — a schema that rejects what doesn't belong
2. **Interpretation rules** — domain knowledge that removes ambiguity
3. **Visual representation** — server-rendered charts and diagrams
4. **Action guidance** — explicit next steps based on data state
5. **Cognitive limits** — bounded results with filter guidance

When all five are present, the agent perceives the domain consistently. Hallucination risk is reduced at the architecture level, not patched at the prompt level.

## Concept Map

| MVA Concept | What It Does | Guide |
|---|---|---|
| **The Theory** | Why MVC fails for agents, first-principles design of MVA | [Read →](/mva/theory) |
| **MVA vs MVC** | Formal layer-by-layer comparison of the two paradigms | [Read →](/mva/mva-vs-mvc) |
| **Presenter Anatomy** | The 6 responsibilities of the Presenter, lifecycle, composition | [Read →](/mva/presenter-anatomy) |
| **Perception Package** | The 6-block response structure the agent receives | [Read →](/mva/perception-package) |
| **Agentic Affordances** | HATEOAS for AI — data-driven next-action hints | [Read →](/mva/affordances) |
| **Context Tree-Shaking** | JIT domain rules that replace global system prompts | [Read →](/mva/context-tree-shaking) |
| **Cognitive Guardrails** | Truncation, strict validation, self-healing errors | [Read →](/mva/cognitive-guardrails) |

## Quick Reference: MVA in Code

```typescript
import { defineModel, createPresenter, ui, initVurb } from '@vurb/core';

// ── MODEL: Single source of truth via defineModel() ──
const InvoiceModel = defineModel('Invoice', m => {
    m.casts({
        id:           m.string('Invoice identifier'),
        amount_cents: m.number('Amount in cents'),
        status:       m.enum('Payment status', ['paid', 'pending', 'overdue']),
        // internal_margin, password_hash → not declared → never reaches the agent
    });

    m.hidden(['tenant_id']);       // excluded from output
    m.guarded(['id']);             // never mass-assignable
    m.fillable({
        create: ['amount_cents', 'status'],
        update: ['status'],
    });
});

// ── VIEW: The Presenter — agent-centric perception layer ──
const InvoicePresenter = createPresenter('Invoice')
    .schema(InvoiceModel)                          // Model
    .systemRules([                                        // Interpretation
        'CRITICAL: amount_cents is in CENTS. Divide by 100.',
    ])
    .uiBlocks((inv) => [                                  // Visualization
        ui.echarts({ series: [{ type: 'gauge', data: [{ value: inv.amount_cents / 100 }] }] }),
    ])
    .agentLimit(50, (omitted) =>                          // Guardrail
        ui.summary(`⚠️ 50 shown, ${omitted} hidden. Use filters.`)
    )
    .suggestActions((inv) =>                               // Affordance
        inv.status === 'pending'
            ? [{ tool: 'billing.pay', reason: 'Process payment' }]
            : []
    );

// ── AGENT: Tools use .fromModel() for input params ──
const f = initVurb<AppContext>();

const getInvoice = f.query('billing.get_invoice')
    .describe('Get an invoice by ID')
    .withString('id', 'Invoice ID')
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => ctx.db.invoices.findUnique(input.id));

const updateInvoice = f.action('billing.update_invoice')
    .describe('Update an invoice')
    .fromModel(InvoiceModel, 'update')  // ← derives input params from Model
    .withString('id', 'Invoice ID')     // ← extra params outside the Model
    .returns(InvoicePresenter)
    .handle(async (input, ctx) => ctx.db.invoices.update(input.id, input));
```

The handler returns **raw data**. The Presenter intercepts it in the execution pipeline, validates through Zod, strips undeclared fields, attaches domain rules, renders charts, applies truncation, and suggests next actions — all automatically. The agent never sees raw JSON. It sees a **structured perception package**.
