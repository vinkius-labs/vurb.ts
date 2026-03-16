/**
 * SERVER SETUP EXAMPLE — Full Bootstrap
 *
 * Demonstrates the complete server lifecycle:
 *   1. Context definition (shared state for all handlers)
 *   2. initVurb() — context initialization
 *   3. Middleware — auth, logging, context derivation
 *   4. ToolRegistry + autoDiscover
 *   5. PromptRegistry + definePrompt
 *   6. State Sync policies
 *   7. attachToServer() / startServer()
 *
 * File structure:
 *   src/context.ts    ← AppContext interface + createContext()
 *   src/vurb.ts       ← initVurb<AppContext>() — single export
 *   src/middleware/    ← Reusable middleware
 *   src/models/       ← defineModel() declarations
 *   src/views/        ← Presenters
 *   src/agents/       ← Tool files (auto-discovered)
 *   src/prompts/      ← definePrompt() declarations
 *   src/server.ts     ← Bootstrap
 */

// ═══════════════════════════════════════════════════════════════
// FILE: src/context.ts — Shared Application Context
// ═══════════════════════════════════════════════════════════════

export interface AppContext {
    /** Database client (Prisma, Drizzle, etc.) */
    db: DatabaseClient;

    /** HTTP client for external API calls */
    client: HttpClient;

    /** Current authenticated user (null if unauthenticated) */
    user: { id: string; role: 'admin' | 'member' | 'guest' } | null;

    /** Tenant identifier for multi-tenancy */
    tenantId: string;
}

interface DatabaseClient {
    query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

interface HttpClient {
    get(url: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
    post(url: string, body?: Record<string, unknown>): Promise<{ data: unknown }>;
    put(url: string, body?: Record<string, unknown>): Promise<{ data: unknown }>;
    delete(url: string): Promise<{ data: unknown }>;
}

export function createContext(): AppContext {
    return {
        db: createDbClient(),
        client: createHttpClient(),
        user: null,
        tenantId: process.env.TENANT_ID ?? 'default',
    };
}

function createDbClient(): DatabaseClient {
    return { query: async () => [] };
}

function createHttpClient(): HttpClient {
    return {
        get: async () => ({ data: null }),
        post: async () => ({ data: null }),
        put: async () => ({ data: null }),
        delete: async () => ({ data: null }),
    };
}

// ═══════════════════════════════════════════════════════════════
// FILE: src/vurb.ts — Context Initialization (shared singleton)
// ═══════════════════════════════════════════════════════════════

import { initVurb } from '@vurb/core';

// Define context ONCE — every f.query(), f.mutation(), f.prompt() inherits it
export const f = initVurb<AppContext>();

// ═══════════════════════════════════════════════════════════════
// FILE: src/middleware/auth.ts — Reusable Auth Middleware
// ═══════════════════════════════════════════════════════════════

/**
 * tRPC-style context derivation — enriches ctx with authenticated user.
 * .use() narrows the TypeScript generic: ctx.user becomes non-null in .handle()
 */
export const requireAuth = f.middleware(async (ctx) => {
    if (!ctx.user) {
        throw new Error('Authentication required');
    }
    // Return only the NEW fields — they merge into ctx automatically
    return { user: ctx.user };  // ctx.user: non-null downstream
});

export const requireAdmin = f.middleware(async (ctx) => {
    if (!ctx.user || ctx.user.role !== 'admin') {
        throw new Error('Admin access required');
    }
    return { user: ctx.user, isAdmin: true as const };
});

// ═══════════════════════════════════════════════════════════════
// FILE: src/prompts/analyze.ts — Prompt with Presenter Bridge
// ═══════════════════════════════════════════════════════════════

import { definePrompt, PromptMessage } from '@vurb/core';
// import { OrderPresenter } from '../views/order.presenter.js';

const AnalyzePrompt = definePrompt<AppContext>('analyze_order', {
    title: 'Analyze Order',
    description: 'Deep analysis of a customer order with recommendations',
    args: {
        orderId: 'string',
        depth: { enum: ['quick', 'thorough'] as const },
    } as const,
    hydrationTimeout: 5000,   // 5s strict — if DB hangs, UI unblocks with alert
    handler: async (ctx, { orderId, depth }) => {
        const order = await ctx.db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        return {
            messages: [
                PromptMessage.system(`You are a Senior Business Analyst. Perform a ${depth} analysis.`),
                // PromptMessage.fromView() — decomposes Presenter into XML-tagged messages
                // Same schema, rules, and affordances used in tools AND prompts
                // ...PromptMessage.fromView(OrderPresenter.make(order, ctx)),
                PromptMessage.user(`Analyze order ${orderId}. Focus on anomalies and optimization opportunities.`),
            ],
        };
    },
});

// ═══════════════════════════════════════════════════════════════
// FILE: src/server.ts — Server Bootstrap
// ═══════════════════════════════════════════════════════════════

import { fileURLToPath } from 'node:url';
import { autoDiscover, PromptRegistry, startServer } from '@vurb/core';

async function main() {
    // ── Registry ─────────────────────────────────────────
    const registry = f.registry();
    const prompts = new PromptRegistry<AppContext>();

    // ── Auto-Discover Tools ──────────────────────────────
    // Scans src/agents/ recursively, registers all exported tool builders
    // Deduplicates by tool name — barrel re-exports don't cause double registration
    await autoDiscover(registry, fileURLToPath(new URL('./agents', import.meta.url)));

    // ── Register Prompts ─────────────────────────────────
    prompts.register(AnalyzePrompt);

    // ── State Sync — Cache Policies ──────────────────────
    const stateSync = f.stateSync()
        .defaults(p => p.stale())                           // default: no caching
        .policy('*.list', p => p.stale())                   // list queries: always fresh
        .policy('*.get', p => p.stale())                    // get queries: always fresh
        .policy('geo.*', p => p.cached())                   // reference data: cache forever
        .policy('settings.*', p => p.cached())              // config: cache forever
        .build();

    // ── Start Server ─────────────────────────────────────
    await startServer({
        name: 'my-app',
        version: '1.0.0',
        registry,
        prompts,
        contextFactory: () => createContext(),
        stateSync,
        toolExposition: 'flat',     // one MCP tool per action (default)
        // toolExposition: 'grouped', // one MCP tool per builder with discriminator enum
    });
}

main().catch(console.error);
