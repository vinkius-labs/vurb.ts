# Audit Trail

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add audit trail middleware to all billing tools with SHA-256 argument hashing, identity extraction from ctx.user, and a sink that writes to Prisma."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(245,158,11,0.6);letter-spacing:3px;font-weight:700">COMPLIANCE EVIDENCE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">Who called what. When. Why.<br><span style="color:rgba(255,255,255,0.25)">SOC2 and GDPR — automatic.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">Every tool call is logged with identity, hashed arguments, outcome, and duration. Arguments are SHA-256 hashed — never persisted raw. SOC2 and GDPR evidence, automatically.</div>
</div>

The Audit Trail middleware wraps every tool call with compliance-ready logging. It captures who called what, when, with what arguments (hashed), and what happened — without leaking sensitive data.


## Why Audit Trails Matter {#why}

When an AI agent performs actions on behalf of users, you need answers to six questions:

1. **Who** initiated the action? (identity)
2. **What** action was performed? (tool + action name)
3. **When** did it happen? (timestamp)
4. **What arguments** were passed? (hashed for privacy)
5. **What was the outcome?** (success, error, blocked, rate-limited)
6. **How long** did it take? (performance)

SOC2 auditors ask these questions. GDPR regulators ask these questions. Your incident response team asks these questions at 3 AM. The Audit Trail answers all six automatically.


## How It Works {#how-it-works}

The `auditTrail()` function returns a middleware that wraps the handler execution:

```text
Tool call ──▶ AuditTrail (start) ──▶ Handler ──▶ AuditTrail (end) ──▶ Response
                    │                                   │
                    └─── Extract identity ───────────────┘
                    └─── Hash arguments ─────────────────┘
                    └─── Detect status ──────────────────┘
                    └─── Emit event ─────────────────────┘
```

```typescript
import { auditTrail } from '@vurb/core';

const billing = createTool('billing')
    .use(auditTrail({
        sink: (event) => myAuditStore.append(event),
        extractIdentity: (ctx) => ({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
        }),
    }))
    .action({ name: 'create', handler: async (ctx, args) => { /* ... */ } });
```


## Configuration {#configuration}

```typescript
interface AuditTrailConfig {
    /** Event sink — receives every audit event */
    readonly sink: (event: SecurityAuditEvent) => void | Promise<void>;

    /** Extract identity from context */
    readonly extractIdentity?: (ctx: any) => Record<string, string>;

    /** Hash function override (default: SHA-256) */
    readonly hashFn?: (input: string) => Promise<string>;
}
```

### Minimal Configuration

```typescript
auditTrail({
    sink: (event) => console.log(JSON.stringify(event)),
})
```

### Production Configuration

```typescript
auditTrail({
    sink: async (event) => {
        await prisma.auditLog.create({ data: event });
    },
    extractIdentity: (ctx) => ({
        userId: ctx.user.id,
        tenantId: ctx.user.tenantId,
        role: ctx.user.role,
        ip: ctx.remoteAddress,
    }),
})
```


## Audit Event Structure {#event-structure}

Every tool call produces a `SecurityAuditEvent`:

```typescript
interface SecurityAuditEvent {
    /** Tool name */
    readonly tool: string;

    /** Action name */
    readonly action: string;

    /** ISO 8601 timestamp */
    readonly timestamp: string;

    /** SHA-256 hash of serialized arguments */
    readonly argsHash: string;

    /** Resolved identity from extractIdentity() */
    readonly identity: Record<string, string>;

    /** Outcome: success, error, firewall_blocked, rate_limited */
    readonly status: AuditStatus;

    /** Execution time in milliseconds */
    readonly durationMs: number;
}
```


## SHA-256 Argument Hashing {#hashing}

Arguments are serialized to JSON and hashed with SHA-256. The hash is included in the audit event — **never the raw arguments**:

```typescript
// Input: { userId: "u_42", amount: 5000 }
// Hash:  "a7f5c3d..."
```

This ensures:

- **Privacy** — Raw arguments are never persisted in audit logs
- **Integrity** — The hash proves arguments were not tampered with
- **Forensics** — Given the same arguments, you can verify the hash matches

The default implementation uses the Web Crypto API (`crypto.subtle.digest`). For environments without Web Crypto, provide a custom `hashFn`.


## Identity Extraction {#identity}

The `extractIdentity` function receives the full context and returns a flat record:

```typescript
extractIdentity: (ctx) => ({
    userId: ctx.user.id,
    tenantId: ctx.user.tenantId,
    role: ctx.user.role,
    sessionId: ctx.sessionId,
})
```

When not provided, the identity defaults to `{}`. The function runs before the handler — errors in identity extraction do not block the tool call.


## Status Detection {#status-detection}

The middleware automatically classifies the outcome:

| Status | Condition |
|--------|-----------|
| `success` | Handler returned without `isError` |
| `error` | Handler returned with `isError: true` |
| `firewall_blocked` | Previous middleware returned security error |
| `rate_limited` | Previous middleware returned rate-limit error |

Detection works by inspecting the response metadata after the handler completes.


## SOC2 Mapping {#soc2}

| SOC2 Control | Audit Trail Feature |
|-------|---------------------|
| CC6.1 — Logical Access | `identity` field tracks who accessed what |
| CC6.3 — Access Monitoring | Every tool call is logged with outcome |
| CC7.2 — System Monitoring | `durationMs` tracks performance anomalies |
| CC7.3 — Change Monitoring | `argsHash` provides integrity verification |

The Audit Trail generates the evidence your SOC2 auditor needs — automatically, for every tool call, without developer opt-in per action.


## GDPR Mapping {#gdpr}

| GDPR Article | Audit Trail Feature |
|------|---------------------|
| Art. 5(1)(c) — Data Minimization | Arguments are hashed, not stored raw |
| Art. 25 — Data Protection by Design | PII never leaves the hashing boundary |
| Art. 30 — Records of Processing | Every processing operation is logged |
| Art. 32 — Security of Processing | SHA-256 ensures integrity verification |


## API Reference {#api}

### `auditTrail(config)`

Returns a `MiddlewareFn` that can be applied with `.use()`:

```typescript
const middleware = auditTrail({
    sink: (event) => store.append(event),
    extractIdentity: (ctx) => ({ userId: ctx.userId }),
});

const tool = createTool('billing').use(middleware);
```

### `SecurityAuditEvent`

```typescript
interface SecurityAuditEvent {
    readonly tool: string;
    readonly action: string;
    readonly timestamp: string;
    readonly argsHash: string;
    readonly identity: Record<string, string>;
    readonly status: 'success' | 'error' | 'firewall_blocked' | 'rate_limited';
    readonly durationMs: number;
}
```

### `sha256Hex(input: string): Promise<string>`

Default hashing function using the Web Crypto API. Returns the hex-encoded SHA-256 digest.
