# Error Handling

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add self-healing error handling to my billing tool — if the invoice is not found, return a recovery path pointing to billing.list_invoices."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(239,68,68,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(239,68,68,0.6);letter-spacing:3px;font-weight:700">SELF-HEALING ERRORS</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Errors that fix themselves.<br><span style="color:rgba(255,255,255,0.25)">Not just "Not found".</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">A generic <code style="font-size:12px;color:rgba(239,68,68,0.6)">Not found</code> leaves the LLM guessing. Vurb errors carry structured recovery paths — the agent reads <code style="font-size:12px;color:rgba(52,211,153,0.6)">&lt;recovery&gt;</code> and self-corrects instantly.</div>
</div>

<!-- Split-screen: give up vs self-heal -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin:32px 0;border-radius:12px;overflow:hidden">
<div style="border:1px solid rgba(239,68,68,0.2);border-right:none;background:rgba(239,68,68,0.03);padding:24px">
<span style="font-size:9px;color:rgba(239,68,68,0.7);letter-spacing:2px;font-weight:700">RAW MCP — THE AI GIVES UP</span>
<div style="margin-top:12px">

```text
AI: "I encountered an error.
     The project was not found." ← gives up
```

</div>
</div>
<div style="border:1px solid rgba(52,211,153,0.2);background:rgba(52,211,153,0.03);padding:24px">
<span style="font-size:9px;color:rgba(52,211,153,0.7);letter-spacing:2px;font-weight:700">VURB — THE AI SELF-HEALS</span>
<div style="margin-top:12px">

```text
AI reads: <recovery>Call projects.list first</recovery>
AI: → calls projects.list → finds correct ID
   → retries successfully ✓
```

</div>
</div>
</div>

## error() — Simple Errors {#simple}

For straightforward failures:

```typescript
import { initVurb, error, success } from '@vurb/core';

const f = initVurb<AppContext>();

export const getProject = f.query('projects.get')
  .describe('Get a project by ID')
  .withString('id', 'Project ID')
  .handle(async (input, ctx) => {
    const project = await ctx.db.projects.findUnique({ where: { id: input.id } });
    if (!project) return error(`Project "${input.id}" not found`);
    return success(project);
  });
```

This works, but the AI only sees text — no recovery path. For guidance, use `toolError()` or `f.error()`.

## required() — Missing Parameters {#required}

Tells the agent exactly which parameter to provide:

```typescript
import { required } from '@vurb/core';

.handle(async (input, ctx) => {
  if (!input.workspace_id) return required('workspace_id');
  // ...
})
```

```xml
<tool_error code="MISSING_REQUIRED_FIELD">
  <message>Required field "workspace_id" is missing.</message>
  <recovery>Provide the "workspace_id" parameter and retry.</recovery>
</tool_error>
```

## toolError() — Self-Healing Errors {#tool-error}

Rich error envelope with everything the AI needs to self-correct:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">tools/billing/get.ts</span>
</div>
<div style="padding:20px">

```typescript
export const getInvoice = f.query('billing.get_invoice')
  .describe('Get an invoice by its ID')
  .withString('id', 'Invoice ID')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.id },
    });

    if (!invoice) {
      return toolError('InvoiceNotFound', {
        message: `Invoice "${input.id}" does not exist.`,
        suggestion: 'Call billing.list_invoices first to find valid IDs.',
        availableActions: ['billing.list_invoices'],
      });
    }

    return success(invoice);
  });
```

</div>
</div>

The agent reads `<available_actions>` and calls `billing.list_invoices` instead of retrying with the same invalid ID.

> [!TIP]
> Use domain-specific codes (`InvoiceNotFound`, `AlreadyPaid`) instead of generic ones. They make error logs self-documenting.

## ErrorBuilder — Fluent Error Chain {#error-builder}

For maximum readability, use the fluent `f.error()`:

<!-- Code screen -->
<div style="margin:24px 0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;background:#09090f">
<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15)"></span>
<span style="font-size:10px;color:rgba(255,255,255,0.3);margin-left:8px;letter-spacing:1px">tools/billing/charge.ts</span>
</div>
<div style="padding:20px">

```typescript
export const chargeInvoice = f.mutation('billing.charge')
  .describe('Process a payment for an invoice')
  .withString('invoice_id', 'Invoice ID')
  .withNumber('amount', 'Payment amount in cents')
  .handle(async (input, ctx) => {
    const invoice = await ctx.db.invoices.findUnique({
      where: { id: input.invoice_id },
    });

    if (!invoice) {
      return f.error('InvoiceNotFound', `Invoice "${input.invoice_id}" not found`)
        .suggest('List invoices first, then retry with a valid ID.')
        .actions('billing.list_invoices');
    }

    if (invoice.status === 'paid') {
      return f.error('AlreadyPaid', `Invoice "${input.invoice_id}" is already settled`)
        .suggest('No action needed. The invoice is settled.')
        .warning();   // ← non-fatal advisory
    }

    if (input.amount > invoice.amount_cents) {
      return f.error('OverPayment', `Amount ${input.amount} exceeds total ${invoice.amount_cents}`)
        .suggest(`Use amount: ${invoice.amount_cents} for full payment.`)
        .details({ invoiceTotal: invoice.amount_cents, attempted: input.amount });
    }

    await ctx.db.payments.create({
      data: { invoiceId: input.invoice_id, amount: input.amount },
    });
    return { status: 'charged', amount: input.amount };
  });
```

</div>
</div>

### ErrorBuilder Methods

| Method | Purpose |
|---|---|
| `.suggest(text)` | Recovery instruction for the LLM agent |
| `.actions(...names)` | Tool names the agent should try instead |
| `.warning()` | Non-fatal advisory (`isError: false`) |
| `.critical()` | System-level failure requiring escalation |
| `.severity(level)` | `'error'` (default), `'warning'`, or `'critical'` |
| `.details(data)` | Structured metadata (`Record<string, string>`) |
| `.retryAfter(seconds)` | Suggest delay for transient errors |

::: warning Architect's Check
When your AI agent generates error handlers, verify that every `NOT_FOUND` error includes an `availableActions` array or `.actions()` call. Without recovery paths, the agent falls back to "I encountered an error" — the worst possible UX.
:::

## Severity Levels {#severity}

```typescript
// Warning — non-fatal advisory (isError: false)
return f.error('DEPRECATED', 'This endpoint is deprecated')
  .suggest('Use billing.invoices_v2 instead.')
  .actions('billing.invoices_v2')
  .warning();

// Critical — system failure requiring escalation
return f.error('INTERNAL_ERROR', 'Database connection pool exhausted')
  .suggest('Retry after 30 seconds or contact support.')
  .retryAfter(30)
  .critical();
```

## Automatic Validation Errors {#validation}

Invalid Zod arguments auto-generate per-field corrections — no code needed:

```xml
<validation_error action="users/create">
  <field name="email">Invalid email. You sent: 'bad-email'. Expected: a valid email address.</field>
  <field name="role">Invalid enum value. Expected 'admin' | 'user', received 'superadmin'.</field>
  <recovery>Fix the fields above and call the tool again.</recovery>
</validation_error>
```

## Automatic Routing Errors {#routing}

Missing or misspelled discriminators produce structured corrections:

```xml
<tool_error code="UNKNOWN_ACTION">
  <message>The action "destory" does not exist.</message>
  <available_actions>list, create, delete</available_actions>
  <recovery>Choose a valid action from available_actions.</recovery>
</tool_error>
```

## Composing Errors with Result {#pipelines}

For multi-step operations, use the [Result monad](/result-monad):

```typescript
import { succeed, fail, error, success, type Result } from '@vurb/core';

function findUser(db: Database, id: string): Result<User> {
  const user = db.users.get(id);
  return user ? succeed(user) : fail(error(`User "${id}" not found`));
}

.handle(async (input, ctx) => {
  const user = findUser(ctx.db, input.user_id);
  if (!user.ok) return user.response;

  const authorized = checkPermission(user.value, 'delete');
  if (!authorized.ok) return authorized.response;

  await ctx.db.projects.delete({ where: { id: input.project_id } });
  return success('Deleted');
})
```

---

## The Error Protocol {#protocol}

| Error Type | Source | Root Element | Trigger |
|---|---|---|---|
| `error()` | Handler | `<tool_error>` | Generic failures |
| `required()` | Handler | `<tool_error code="MISSING_REQUIRED_FIELD">` | Missing arguments |
| `toolError()` | Handler | `<tool_error code="...">` | Recoverable business errors |
| `f.error()` | Handler | `<tool_error code="...">` | Fluent builder chain |
| Validation | Automatic | `<validation_error>` | Invalid arguments |
| Routing | Automatic | `<tool_error code="MISSING_DISCRIMINATOR">` | Bad discriminator |

All user-controlled data is XML-escaped automatically.

---

## Next Steps {#next}

<!-- Navigation cards -->
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:32px 0">

<a href="/result-monad" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(129,140,248,0.5);letter-spacing:2px;font-weight:600">PIPELINE</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Result Monad</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Compose validation chains.</div>
<span style="font-size:10px;color:rgba(129,140,248,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/middleware" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(245,158,11,0.5);letter-spacing:2px;font-weight:600">GUARD</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Middleware</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Auth, rate limiting, logging.</div>
<span style="font-size:10px;color:rgba(245,158,11,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

<a href="/presenter" style="text-decoration:none;display:block;padding:24px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02)">
<span style="font-size:8px;color:rgba(52,211,153,0.5);letter-spacing:2px;font-weight:600">VIEW</span>
<div style="font-size:14px;color:#fff;font-weight:600;font-family:Inter,sans-serif;margin-top:8px">Presenter</div>
<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;line-height:1.5;font-family:Inter,sans-serif">Shape what the LLM sees.</div>
<span style="font-size:10px;color:rgba(52,211,153,0.6);margin-top:12px;display:block;font-family:Inter,sans-serif">Read more →</span>
</a>

</div>