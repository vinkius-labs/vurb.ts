---
title: OAuth — Device Authorization Grant
description: Drop-in OAuth 2.0 Device Flow (RFC 8628) for MCP servers built with Vurb.ts.
---
<a href="https://www.npmjs.com/package/@vurb/oauth"><img src="https://img.shields.io/npm/v/@vurb/oauth?color=blue" alt="npm" /></a>

# OAuth — Device Authorization Grant

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Add OAuth device flow authentication to my MCP server using @vurb/oauth — with automatic token refresh, persistent storage, and an auth tool for the AI agent."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(52,211,153,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(52,211,153,0.6);letter-spacing:3px;font-weight:700">DEVICE FLOW</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">No redirect URIs. No browsers.<br><span style="color:rgba(255,255,255,0.25)">RFC 8628 for MCP servers.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">OAuth 2.0 Device Authorization Grant for headless MCP servers. The server requests a device code, the user authorizes in a browser, and the token is stored for future sessions.</div>
</div>


```bash
npm install @vurb/oauth
```

Peer dependency: `Vurb.ts ^2.0.0`

## Create the Auth Tool

```typescript
import { createAuthTool } from '@vurb/oauth';
import { ToolRegistry } from '@vurb/core';

const auth = createAuthTool<AppContext>({
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
    tokenManager: {
        configDir: '.myapp',
        tokenFile: 'mcp-token.json',
        envVar: 'MY_APP_TOKEN',
    },
    onAuthenticated: (token, ctx) => {
        ctx.client.setToken(token);
    },
    getUser: async (ctx) => {
        const user = await ctx.client.getMe();
        return { name: user.name, email: user.email };
    },
});

const registry = new ToolRegistry<AppContext>();
registry.register(auth);
```

The auth tool exposes 4 actions:

| Action | Description |
|--------|-------------|
| `login` | Initiates Device Flow — returns verification URL + user code |
| `complete` | Polls until the user authorizes in the browser |
| `status` | Checks current authentication state |
| `logout` | Clears the stored token |

## Protect Tools with Middleware

```typescript
import { requireAuth } from '@vurb/oauth';
import { createTool, success } from '@vurb/core';

const projects = createTool<AppContext>('projects')
    .use(requireAuth({
        extractToken: (ctx) => {
            if (ctx.client.isAuthenticated()) return 'authenticated';
            return null;
        },
        recoveryHint: 'Run auth action=login to authenticate',
        recoveryAction: 'auth',
    }))
    .action({
        name: 'list',
        readOnly: true,
        handler: async (ctx) => success(await ctx.client.getProjects()),
    });
```

When no token is found, `requireAuth()` returns a structured `toolError('AUTH_REQUIRED')` with recovery hints — enabling the LLM to self-heal by calling the auth tool automatically.

## Standalone Usage

`DeviceAuthenticator` and `TokenManager` work independently of Vurb.ts:

```typescript
import { DeviceAuthenticator, TokenManager } from '@vurb/oauth';

const authenticator = new DeviceAuthenticator({
    authorizationEndpoint: 'https://api.example.com/oauth/device/code',
    tokenEndpoint: 'https://api.example.com/oauth/device/token',
});

// Phase 1: Get device code
const code = await authenticator.requestDeviceCode({
    clientId: 'my-client-id',
});
console.log(`Open: ${code.verification_uri_complete}`);
console.log(`Code: ${code.user_code}`);

// Phase 2: Poll until authorized
const token = await authenticator.pollForToken(code);

// Store securely
const manager = new TokenManager({ configDir: '.myapp' });
manager.saveToken(token.access_token);
```

## Token Storage

`TokenManager` stores tokens securely:

- **File location**: `~/.{configDir}/token.json`
- **File permissions**: `0o600` (owner read/write only)
- **Resolution order**: Environment variable → File → `null`
- **Pending codes**: Stored separately with TTL, surviving process restarts

```typescript
const manager = new TokenManager({
    configDir: '.myapp',
    tokenFile: 'mcp-token.json',      // default: 'token.json'
    pendingAuthFile: 'pending.json',   // default: 'pending-auth.json'
    envVar: 'MY_APP_TOKEN',            // optional: env var override
});

// Token lifecycle
const token = manager.getToken();         // env var > file > null
const source = manager.getTokenSource();  // 'environment' | 'file' | null
manager.saveToken('eyJhbGc...');
manager.clearToken();

// Pending device code (survives restarts)
manager.savePendingDeviceCode(codeResponse, 900); // TTL in seconds
const pending = manager.getPendingDeviceCode();    // null if expired
```

## API Reference

### `DeviceAuthenticator`

| Method | Returns | Description |
|--------|---------|-------------|
| `requestDeviceCode(request)` | `DeviceCodeResponse` | Phase 1: Get device code + verification URL |
| `pollForToken(codeResponse, signal?)` | `TokenResponse` | Phase 2: Poll until authorized (respects `slow_down`) |
| `attemptTokenExchange(request)` | `TokenResponse` | Single exchange attempt (manual polling) |

### `TokenManager`

| Method | Returns | Description |
|--------|---------|-------------|
| `getToken()` | `string \| null` | Get token (env var > file) |
| `getTokenSource()` | `'environment' \| 'file' \| null` | Token origin |
| `saveToken(token)` | `void` | Save to `~/{configDir}/token.json` (0o600) |
| `clearToken()` | `void` | Remove saved token |
| `savePendingDeviceCode(code, ttl)` | `void` | Store pending auth state |
| `getPendingDeviceCode()` | `DeviceCodeResponse \| null` | Get pending code (auto-expired) |

### `createAuthTool<TContext>(config)`

Returns a `GroupedToolBuilder` with actions: `login`, `complete`, `status`, `logout`.

**Config:**

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | OAuth 2.0 client ID |
| `authorizationEndpoint` | `string` | Device authorization URL |
| `tokenEndpoint` | `string` | Token exchange URL |
| `headers?` | `Record<string, string>` | Extra headers for requests |
| `tokenManager` | `TokenManagerConfig` | Storage configuration |
| `onAuthenticated` | `(token, ctx) => void` | Called after successful auth |
| `onLogout?` | `(ctx) => void` | Called on logout |
| `getUser?` | `(ctx) => Promise<UserInfo>` | Fetch user info for status |

### `requireAuth(options?)`

Returns a Vurb.ts middleware function.

**Options:**

| Field | Type | Description |
|-------|------|-------------|
| `extractToken` | `(ctx) => string \| null` | Token extraction function |
| `recoveryHint?` | `string` | Hint for the LLM to self-heal |
| `recoveryAction?` | `string` | Tool name to suggest |

## Types

```typescript
interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
}

interface TokenManagerConfig {
    configDir: string;
    tokenFile?: string;
    pendingAuthFile?: string;
    envVar?: string;
}

type TokenSource = 'environment' | 'file' | null;
```

## Other Authentication Methods {#other-auth}

| Method | Guide |
|---|---|
| JWT bearer token verification | [JWT Verification](/jwt) |
| Static API key validation | [API Key Validation](/api-key) |
| Security overview — all layers | [Security](/security/) |
