<p align="center">
  <h1 align="center">@vurb/jwt</h1>
  <p align="center">
    <strong>JWT Verification Middleware</strong> — Standards-compliant token validation for Vurb.ts servers
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/jwt"><img src="https://img.shields.io/npm/v/@vurb/jwt?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> JWT verification middleware for MCP servers built with Vurb.ts. Timing-safe validation with `jose`, JWKS auto-discovery, and self-healing error responses.

## Quick Start

```typescript
import { initVurb } from '@vurb/core';
import { jwtGuard } from '@vurb/jwt';

const f = initVurb<AppContext>();

const withJwt = jwtGuard({
    secret: process.env.JWT_SECRET!,
    algorithms: ['HS256'],
});

export default f.query('billing.invoices')
    .use(withJwt)
    .handle(async (input, ctx) => {
        // ctx.jwt contains the decoded payload
        return db.invoices.findMany({ where: { tenantId: ctx.jwt.sub } });
    });
```

## Features

| Feature | Description |
|---------|-------------|
| **Algorithms** | HS256, RS256, ES256 — all standard algorithms via `jose` |
| **JWKS** | Auto-discovery from `/.well-known/jwks.json` with key rotation |
| **Self-Healing** | Expired/invalid tokens return actionable hints to the LLM agent |
| **Timing-Safe** | Constant-time signature verification |
| **Zero Config** | Works with Auth0, Clerk, Supabase, Firebase, any OIDC provider |

## JWKS Auto-Discovery

```typescript
const withJwt = jwtGuard({
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    issuer: 'https://auth.example.com/',
    audience: 'my-mcp-server',
});
```

## Installation

```bash
npm install @vurb/jwt jose
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `jose` | `^5.0.0` (optional) |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 2.0.0 (peer dependency)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
