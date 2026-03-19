# Without MVA vs With MVA

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">THE AHA MOMENT</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">See the difference in 3 seconds.<br><span style="color:rgba(255,255,255,0.25)">Raw MCP vs Vurb.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Every tool response in raw MCP is <code style="font-size:12px;color:rgba(239,68,68,0.6)">JSON.stringify()</code> — the AI gets a flat blob and guesses. Vurb replaces guessing with structured perception.</div>
</div>

<!-- Summary comparison table -->
<div style="margin:32px 0">

| Aspect | Raw MCP | Vurb MVA |
|---|---|---|
| **Tool count** | 50 individual tools. Token explosion. | Action consolidation — `module.action` discriminator |
| **Response** | `JSON.stringify()` — AI guesses | Structured perception — data + rules + UI + affordances |
| **Domain context** | `amount_cents: 45000` — dollars? cents? | System rules: *"amount_cents is in CENTS."* |
| **Next actions** | AI hallucinates tool names | Agentic HATEOAS — `.suggest()` based on state |
| **Large datasets** | 10,000 rows dump — token DDoS | `.limit(50)` truncates and teaches filters |
| **Security** | Internal fields leak | Schema IS the boundary |
| **Error recovery** | `throw new Error('not found')` — gives up | `toolError()` with recovery hints |
| **Middleware** | Copy-paste auth checks | tRPC-style `defineMiddleware()` |
| **Deployment** | Stdio only | [Vercel](/vercel-adapter), [Cloudflare](/cloudflare-adapter), [Lambda](/aws-connector) |

</div>

---

## Invoice: Before & After {#invoice}

<!-- Split-screen -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">

<!-- LEFT: danger -->
<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">RAW MCP</span>
<div style="margin-top:12px">

```typescript
server.setRequestHandler(async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'get_invoice') {
    const invoice = await db.invoices.findUnique(args.id);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(invoice)
      }]
    };
  }
  // ...50 more if/else branches
});
// AI: { "internal_margin": 0.12,
//        "customer_ssn": "123-45-6789" } ← leaked
```

</div>
</div>

<!-- RIGHT: safe -->
<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">VURB MVA</span>
<div style="margin-top:12px">

```typescript
const InvoicePresenter = createPresenter('Invoice')
  .schema(InvoiceModel)
  .rules([
    'amount_cents is in CENTS. Divide by 100.',
    'Always show currency as USD.',
  ])
  .ui((inv) => [
    ui.echarts({
      series: [{ type: 'gauge',
        data: [{ value: inv.amount_cents / 100 }]
      }],
    }),
  ])
  .suggest((inv) =>
    inv.status === 'pending'
      ? [suggest('billing.pay', 'Process payment')]
      : [suggest('billing.archive', 'Archive')]
  );
```

</div>
</div>

</div>

---

## Users: Before & After {#users}

<!-- Split-screen -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">

<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">RAW MCP — TOKEN DDoS</span>
<div style="margin-top:12px">

```typescript
case 'list_users':
  const users = await db.users.findMany();
  return { content: [{
    type: 'text',
    text: JSON.stringify(users)
  }]};
  // 10,000 users × ~500 tokens = context DDoS
```

</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">VURB — SMART TRUNCATION</span>
<div style="margin-top:12px">

```typescript
const UserPresenter = createPresenter('User')
  .schema(UserModel)
  .limit(50)
  .suggest(() => [
    suggest('users.search',
      'Search by name or role'),
  ]);
// 50 users. Agent guided to filters.
// ~25k tokens instead of ~5,000,000.
```

</div>
</div>

</div>

---

## Error Recovery: Before & After {#errors}

<!-- Split-screen -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">

<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">RAW MCP — GIVES UP</span>
<div style="margin-top:12px">

```typescript
if (!invoice) {
  return {
    content: [{
      type: 'text',
      text: 'Invoice not found'
    }],
    isError: true
  };
}
// AI: "I encountered an error." ← dead end
```

</div>
</div>

<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">VURB — SELF-HEALS</span>
<div style="margin-top:12px">

```typescript
if (!invoice) {
  return toolError('NOT_FOUND', {
    message: `Invoice ${args.id} not found`,
    recovery: {
      action: 'list',
      suggestion: 'List invoices first'
    },
    suggestedArgs: { status: 'pending' },
  });
}
// AI: "Let me list pending invoices..." ✓
```

</div>
</div>

</div>

---

## The Architecture Difference {#architecture}

<!-- Numbered steps: architecture flow -->
<div style="margin:32px 0">

<div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:20px 24px;border-left:2px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(239,68,68,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">❌</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">Without MVA</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Handler → <code style="font-size:10px">JSON.stringify()</code> → raw data blob → LLM guesses everything</div>
</div>
</div>

<div style="display:flex;align-items:flex-start;gap:20px;padding:20px 24px;border-left:2px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.02);border-radius:0 8px 8px 0">
<span style="font-size:22px;color:rgba(52,211,153,0.5);font-weight:700;font-family:Inter,sans-serif;min-width:32px">✅</span>
<div style="flex:1">
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif">With MVA</div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.6;font-family:Inter,sans-serif">Handler → raw data → <strong style="color:rgba(129,140,248,0.6)">Presenter</strong> (Schema + Rules + UI + Limits + Suggestions) → Structured Perception Package → LLM acts with confidence</div>
</div>
</div>

</div>

| | Without MVA | With MVA |
|---|---|---|
| Lines of code per tool | 20-50 (routing + validation + formatting) | 3-5 (handler only) |
| Security | Hope you didn't forget to strip fields | Schema IS the boundary |
| Token cost per call | High (raw dumps) | Low (guardrails, truncation) |
| Deployment | Stdio + manual HTTP bridge | Stdio, SSE, [Vercel](/vercel-adapter), [Cloudflare](/cloudflare-adapter) |
| Maintenance | Every tool re-implements rendering | Presenter defined once |
