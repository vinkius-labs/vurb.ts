/**
 * Core Templates — vurb.ts, context.ts, server.ts
 *
 * The architectural spine of every scaffolded project.
 * @module
 */
import type { ProjectConfig } from '../types.js';

/** Generate `src/vurb.ts` — The one-file context center */
export function vurbTs(): string {
    return `/**
 * Vurb Instance — Context Initialization
 *
 * Define your context type ONCE. Every f.query(), f.mutation(),
 * f.presenter(), f.prompt(), and f.middleware() call inherits
 * AppContext — zero generic repetition anywhere in the codebase.
 */
import { initVurb } from '@vurb/core';
import type { AppContext } from './context.js';

export const f = initVurb<AppContext>();
`;
}

/** Generate `src/context.ts` — Application context type + factory */
export function contextTs(): string {
    return `/**
 * Application Context — Shared State for Every Tool Handler
 *
 * Every f.query() / f.mutation() handler receives (input, ctx)
 * where ctx is this AppContext. Extend it with your own services
 * (DB client, auth, external APIs, etc.)
 */

export interface AppContext {
    /** Current user role for RBAC checks */
    role: 'ADMIN' | 'USER' | 'GUEST';

    /** Tenant identifier (multi-tenancy) */
    tenantId: string;
}

/**
 * Create the application context for each tool invocation.
 *
 * In production, hydrate this from the MCP session metadata,
 * JWT tokens, or environment variables.
 */
export function createContext(): AppContext {
    return {
        role: 'ADMIN',
        tenantId: 'default',
    };
}
`;
}

/** Generate `src/server.ts` — Bootstrap with autoDiscover + transport */
export function serverTs(config: ProjectConfig): string {
    if (config.transport === 'stdio') {
        // Simplified: one-liner bootstrap via startServer()
        return `/**
 * Server Bootstrap — Vurb
 *
 * Tools are auto-discovered from src/tools/.
 * Drop a file, it becomes a tool.
 */
import { fileURLToPath } from 'node:url';
import { autoDiscover, PromptRegistry, startServer } from '@vurb/core';
import { createContext } from './context.js';
import { f } from './vurb.js';
import { GreetPrompt } from './prompts/greet.js';

// ── Registry ─────────────────────────────────────────────
const registry = f.registry();
const prompts = new PromptRegistry();

// ── Auto-Discover & Register ─────────────────────────────
await autoDiscover(registry, fileURLToPath(new URL('./tools', import.meta.url)));
prompts.register(GreetPrompt);

// ── Start ────────────────────────────────────────────────
await startServer({
    name: '${config.name}',
    registry,
    prompts,
    contextFactory: () => createContext(),
});
`;
    }

    // Streamable HTTP transport — manual setup required (startServer is stdio-only)
    return `/**
 * Server Bootstrap — Vurb with Streamable HTTP Transport
 *
 * Tools are auto-discovered from src/tools/.
 * Drop a file, it becomes a tool.
 */
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { autoDiscover, PromptRegistry } from '@vurb/core';
import { createContext } from './context.js';
import { f } from './vurb.js';
import { GreetPrompt } from './prompts/greet.js';

// ── Registry ─────────────────────────────────────────────
const registry = f.registry();
const prompts = new PromptRegistry();

// ── Auto-Discover & Register ─────────────────────────────
await autoDiscover(registry, fileURLToPath(new URL('./tools', import.meta.url)));
prompts.register(GreetPrompt);

// ── Server ───────────────────────────────────────────────
const server = new McpServer(
    { name: '${config.name}', version: '0.1.0' },
);

registry.attachToServer(server, {
    contextFactory: () => createContext(),
    prompts,
});

// ── Transport ────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3001);
const sessions = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? '/', \`http://localhost:\${PORT}\`);

        if (url.pathname !== '/mcp') {
            res.writeHead(404).end();
            return;
        }

        if (req.method === 'POST') {
            // Parse JSON body
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString());

            const sessionId = req.headers['mcp-session-id'] as string | undefined;

            // Existing session — route to its transport
            if (sessionId && sessions.has(sessionId)) {
                const transport = sessions.get(sessionId)!;
                await transport.handleRequest(req, res, body);
                return;
            }

            // New session — create transport
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => crypto.randomUUID(),
                onsessioninitialized: (id) => {
                    sessions.set(id, transport);
                },
            });
            transport.onclose = () => {
                const id = [...sessions.entries()].find(([, t]) => t === transport)?.[0];
                if (id) sessions.delete(id);
            };
            await server.connect(transport);
            await transport.handleRequest(req, res, body);
        } else if (req.method === 'GET') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            if (sessionId && sessions.has(sessionId)) {
                const transport = sessions.get(sessionId)!;
                await transport.handleRequest(req, res);
            } else {
                res.writeHead(400).end('Missing or invalid session');
            }
        } else if (req.method === 'DELETE') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            if (sessionId && sessions.has(sessionId)) {
                const transport = sessions.get(sessionId)!;
                await transport.handleRequest(req, res);
            } else {
                res.writeHead(400).end('Missing or invalid session');
            }
        } else {
            res.writeHead(405).end();
        }
    } catch (err) {
        console.error('[Vurb] Unhandled error in HTTP handler:', err);
        if (!res.headersSent) res.writeHead(500).end();
    }
});

httpServer.listen(PORT, () => {
    console.error(\`⚡ Vurb server on http://localhost:\${PORT}/mcp\`);
});
`;
}
