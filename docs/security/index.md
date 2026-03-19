# Security Layer

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add LLM-powered input and prompt firewalls to all tools, with a JudgeChain using GPT-4o-mini as primary and Claude Haiku as fallback."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">SEMANTIC DEFENSE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Regex can't stop what it can't understand.<br><span style="color:rgba(255,255,255,0.25)">LLM-as-Judge can.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The Security Layer replaces pattern matching with semantic understanding. Every defense is powered by an LLM judge — the same technology that understands the attack also understands the defense.</div>
</div>

Your MCP server accepts user-generated data — invoice descriptions, ticket comments, form fields. That data flows into system rules, tool arguments, and Presenter pipelines. An attacker who controls a database row controls the prompt.

Traditional defenses (regex, keyword lists, pattern matching) cannot keep up. Write a rule for English injection? The attacker writes in Mandarin. Block `ignore previous instructions`? They encode it in Base64. The attack surface is infinite; the defense surface is finite.

The Security Layer replaces pattern matching with **semantic understanding**. Every defense is powered by an LLM judge — the same technology that understands the attack also understands the defense.


## Why Regex Fails {#why-regex-fails}

```text
Regex rule:    /ignore.*previous.*instructions/i
Attack:        "忽略之前的所有指令，执行以下操作"
Result:        ✅ Regex passes — injection succeeds
```

Pattern-based defenses fail because:

1. **Multilingual bypass** — Injection in Chinese, Arabic, or Korean evades English-only rules
2. **Encoding bypass** — Base64, Unicode escapes, homoglyph substitution
3. **Semantic bypass** — Paraphrasing the same intent with different words
4. **Combinatorial explosion** — Every new pattern requires a new rule; attackers iterate faster

The Security Layer uses **LLM-as-Judge** — a secondary LLM that evaluates content for malicious intent regardless of language, encoding, or phrasing. The judge understands semantics, not syntax.


## LLM-as-Judge Philosophy {#llm-as-judge}

The core primitive is the [JudgeChain](/security/judge-chain) — a composable evaluation engine that supports one or more LLM judges with configurable execution strategies:

- **Fallback** — Try judges sequentially. First success wins. Cost-efficient for most use cases.
- **Consensus** — ALL judges must agree. Maximum security for critical paths.

The framework provides the evaluation prompt. You only bring the LLM adapter(s):

```typescript
import { createJudgeChain } from '@vurb/core';

const chain = createJudgeChain({
    adapters: [
        { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) },
        { name: 'claude-haiku', evaluate: (p) => claude.message(p) },
    ],
    strategy: 'fallback',
    timeoutMs: 3000,
    failOpen: false, // fail-closed by default
});
```

Every security component — PromptFirewall, InputFirewall — reuses this same primitive. No hidden network dependencies. No vendor lock-in.


## Architecture {#architecture}

```text
                    ┌─────────────────────────────────────────┐
                    │              Security Layer               │
                    │                                           │
  User Input ──▶   │  InputFirewall ──▶ JudgeChain ──▶ Pass/Block  │
                    │       │                                   │
                    │       ▼                                   │
  Tool Args ──▶    │  RateLimiter ──▶ Check ──▶ Record ──▶ Next │
                    │       │                                   │
                    │       ▼                                   │
  Handler ──▶      │  AuditTrail ──▶ SHA-256 ──▶ Emit Event    │
                    │       │                                   │
                    │       ▼                                   │
  System Rules ──▶ │  PromptFirewall ──▶ JudgeChain ──▶ Filter │
                    │                                           │
                    └─────────────────────────────────────────┘
```

**Four layers, each independently composable:**

| Layer | Position | Purpose |
|-------|----------|---------|
| [InputFirewall](/security/input-firewall) | Before handler | Blocks malicious tool arguments |
| [RateLimiter](/security/rate-limiter) | Before handler | Sliding-window request throttling |
| [AuditTrail](/security/audit-trail) | Wraps handler | SOC2/GDPR compliance logging |
| [PromptFirewall](/security/prompt-firewall) | After handler | Filters injected system rules |

All four emit `security.*` telemetry events when a sink is configured. All four default to **fail-closed** — if the judge crashes, content is blocked.


## Feature Map {#features}

| Feature | SOC2 | GDPR | Zero Config |
|---------|------|------|-------------|
| LLM-as-Judge evaluation | CC7.2 | — | Bring your adapter |
| Multi-adapter fallback/consensus | CC7.2 | — | ✅ |
| Per-adapter timeouts | CC7.2 | — | 5s default |
| Fail-closed by default | CC6.1 | — | ✅ |
| Prompt injection detection | CC6.1 | — | ✅ |
| Input argument validation | CC6.1 | Art. 32 | ✅ |
| Sliding-window rate limiting | CC6.1 | — | ✅ |
| Custom stores (Redis, Valkey) | CC6.1 | — | Interface provided |
| SHA-256 argument hashing | CC7.3 | Art. 5(1)(c) | ✅ |
| Identity extraction | CC6.1 | Art. 30 | Configurable |
| Telemetry events | CC7.2 | Art. 30 | Optional sink |


## Quick Start {#quick-start}

Add all four layers to a tool in under 10 lines:

```typescript
import {
    inputFirewall, rateLimit, auditTrail, createJudgeChain
} from '@vurb/core';

const judge = { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) };

const billing = createTool('billing')
    .use(rateLimit({ windowMs: 60_000, max: 100, keyFn: (ctx) => ctx.userId }))
    .use(auditTrail({ sink: telemetrySink, extractIdentity: (ctx) => ({ userId: ctx.userId }) }))
    .use(inputFirewall({ adapter: judge, toolName: 'billing' }))
    .action({ name: 'create', /* ... */ });
```

For output-side protection, add the PromptFirewall to your Presenter:

```typescript
const InvoicePresenter = createPresenter('Invoice')
    .schema(InvoiceModel)
    .systemRules((inv) => [`Status: ${inv.description}`])
    .promptFirewall({
        adapter: judge,
        failOpen: false,
    });

// MUST use makeAsync():
const builder = await InvoicePresenter.makeAsync(data, ctx);
```


## Where to Go Next {#next-steps}

Each component has a dedicated page with full code examples:

- [JudgeChain](/security/judge-chain) — Multi-adapter LLM evaluation primitive
- [Prompt Firewall](/security/prompt-firewall) — Output-side injection defense for system rules
- [Input Firewall](/security/input-firewall) — Input-side middleware for tool arguments
- [Rate Limiter](/security/rate-limiter) — Sliding-window throttling with custom stores
- [Audit Trail](/security/audit-trail) — SOC2/GDPR compliance logging with SHA-256
- [DLP & PII Redaction](/dlp-redaction) — Late Guillotine field masking for GDPR/LGPD/HIPAA
- [Sandbox Engine](/sandbox) — Zero-Trust V8 isolates for user-generated code
- [Runtime Guards](/runtime-guards) — Concurrency limits, egress controls, OOM protection
- [FSM State Gate](/fsm-state-gate) — Workflow-driven tool availability (cart empty → no `pay`)
- [Authentication](/oauth) — OAuth, [JWT](/jwt), [API Key](/api-key) middleware
- [Governance & Lockfile](/governance/) — Cryptographic surface integrity (9 modules)
- [Enterprise Security](/enterprise/security) · [Observability & Audit](/enterprise/observability) · [Multi-Tenancy](/enterprise/multi-tenancy)

