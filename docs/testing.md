# Testing

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Write Vitest tests that assert PII stripping, middleware access control, system rules presence, and agent limit truncation using VurbTester."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(129,140,248,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(129,140,248,0.6);letter-spacing:3px;font-weight:700">FULL-PIPELINE TESTING</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Four tests. 8 ms. Zero tokens.<br><span style="color:rgba(255,255,255,0.25)">Same code path as production.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">`@vurb/testing` runs the full execution pipeline in RAM — Zod validation, middleware chains, Presenters, egress guards — and returns structured `MvaTestResult` objects. Deterministic on every CI run.</div>
</div>


```bash
npm install @vurb/testing
```

Works with Vitest, Jest, Mocha, or `node:test`. The tester returns plain objects — your runner, your choice. Ideal for validating hand-written tools and auto-generated tools from [@vurb/openapi-gen](/openapi-gen) or [@vurb/prisma-gen](/prisma-gen).

## Create a Tester

```typescript
import { createVurbTester } from '@vurb/testing';
import { registry } from './server/registry.js';

const tester = createVurbTester(registry, {
  contextFactory: () => ({
    prisma: mockPrisma,
    tenantId: 't_enterprise_42',
    role: 'ADMIN',
  }),
});
```

`createVurbTester` wraps your real `ToolRegistry` and calls `routeCall()` — the same function production uses. No pipeline reimplementation, no mock transport.

## Assert Every MVA Layer

```typescript
import { describe, it, expect } from 'vitest';

describe('SOC2 Data Governance', () => {
  it('strips PII before it reaches the LLM', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 10 });

    for (const user of result.data) {
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('tenantId');
    }
  });

  it('rejects unbounded queries', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 99999 });
    expect(result.isError).toBe(true);
  });

  it('sends governance rules with data', async () => {
    const result = await tester.callAction('db_user', 'find_many', { take: 5 });
    expect(result.systemRules).toContain('Email addresses are PII. Mask when possible.');
  });

  it('blocks guest access', async () => {
    const result = await tester.callAction(
      'db_user', 'find_many', { take: 5 },
      { role: 'GUEST' },
    );
    expect(result.isError).toBe(true);
  });
});
```

Four tests, 8 ms, zero tokens.

## What `MvaTestResult` Exposes

| Field | What you assert | Compliance mapping |
|---|---|---|
| `result.data` | Presenter schema stripped undeclared fields | SOC2 CC6.1 — data leak prevention |
| `result.isError` | Middleware rejected the request | SOC2 CC6.3 — access control |
| `result.systemRules` | Domain directives present in response | Context governance |
| `result.uiBlocks` | Server-rendered charts and summaries correct | Response quality |
| `result.data.length` | `agentLimit` capped the collection | Context window protection |
| `rawResponse` | `<action_suggestions>` HATEOAS hints present | Agent navigation |

## How It Works

`ResponseBuilder.build()` attaches MVA metadata via `Symbol.for('Vurb.ts.mva-meta')`. Symbols are invisible to `JSON.stringify`, so the MCP transport never sees them — but `VurbTester` reads them in RAM:

```typescript
// MCP transport sees:
{ "content": [{ "type": "text", "text": "<data>...</data>" }] }

// VurbTester reads (Symbol key):
response[Symbol.for('Vurb.ts.mva-meta')] = {
  data: { id: '1', name: 'Alice', email: 'alice@acme.com' },
  rules: ['Data from Prisma ORM. Do not infer outside this response.'],
  ui: [{ type: 'summary', content: 'User: Alice (alice@acme.com)' }],
};
```

The tester exercises the full pipeline — Zod validation, compiled middleware chain, concurrency semaphore, mutation serialization, abort signal propagation, egress guards, agent limit truncation, and HATEOAS suggestions.

## Guides

| Guide | Description |
|---|---|
| [Quick Start](/testing/quickstart) | Build your first VurbTester in 5 minutes |
| [Egress Firewall](/testing/egress-firewall) | Audit PII stripping and field-level security |
| [System Rules](/testing/system-rules) | Verify LLM governance directives |
| [UI Blocks](/testing/ui-blocks) | Assert SSR blocks, charts, and cognitive guardrails |
| [Middleware Guards](/testing/middleware-guards) | Test RBAC, auth gates, and context derivation |
| [OOM Guard](/testing/oom-guard) | Validate Zod input boundaries and agent limits |
| [Error Handling](/testing/error-handling) | Assert `isError`, error messages, empty MVA layers |
| [Raw Response](/testing/raw-response) | Protocol-level MCP transport inspection |
| [Convention](/testing/convention) | `tests/` folder structure in the MVA convention |
