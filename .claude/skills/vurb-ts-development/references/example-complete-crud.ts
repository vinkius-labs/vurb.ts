/**
 * COMPLETE CRUD EXAMPLE — Product Catalog
 *
 * Demonstrates the full MVA lifecycle:
 *   Model → Presenter → Router → Query/Mutation/Action → Error Handling
 *
 * This is a single-file reference. In production, split into:
 *   models/ProductModel.ts → views/product.presenter.ts → agents/product.tool.ts
 */

import { initVurb, defineModel, definePresenter, ui } from '@vurb/core';

// ─── CONTEXT ─────────────────────────────────────────────────
interface AppContext {
    db: {
        products: {
            findMany(opts?: { take?: number; where?: Record<string, unknown> }): Promise<Product[]>;
            findUnique(opts: { where: { id: string } }): Promise<Product | null>;
            create(opts: { data: Record<string, unknown> }): Promise<Product>;
            update(opts: { where: { id: string }; data: Record<string, unknown> }): Promise<Product>;
            delete(opts: { where: { id: string } }): Promise<void>;
        };
    };
    user: { id: string; role: 'admin' | 'member' };
}

interface Product {
    id: string;
    name: string;
    description: string;
    price_cents: number;
    category: string;
    stock: number;
    created_at: string;
    updated_at: string;
}

export const f = initVurb<AppContext>();

// ═══════════════════════════════════════════════════════════════
// STEP 1: THE MODEL — Domain Data Definition (the "M")
// ═══════════════════════════════════════════════════════════════
export const ProductModel = defineModel('Product', m => {
    m.casts({
        id:          m.uuid(),
        name:        m.string('Product name'),
        description: m.text('Detailed product description'),
        price_cents: m.number('CRITICAL: price in CENTS. Divide by 100 for display.'),
        category:    m.enum('Category', ['electronics', 'clothing', 'food', 'books', 'other']),
        stock:       m.number('Current inventory count'),
    });

    m.timestamps();   // → created_at + updated_at
    m.hidden([]);     // No hidden fields in this example

    m.fillable({
        create: ['name', 'description', 'price_cents', 'category', 'stock'],
        update: ['name', 'description', 'price_cents', 'category', 'stock'],
    });
});

// ═══════════════════════════════════════════════════════════════
// STEP 2: THE PRESENTER — Egress Firewall & Perception (the "V")
// ═══════════════════════════════════════════════════════════════
export const ProductPresenter = definePresenter({
    name: 'Product',
    schema: ProductModel,   // ← always Model, never z.object()

    // Server-rendered UI — deterministic, no hallucinated charts
    ui: (product) => [
        ui.markdown(
            `📦 **${product.name}** — $${(product.price_cents / 100).toFixed(2)} | Stock: ${product.stock}`
        ),
    ],

    // Cognitive guardrails — truncate large collections
    agentLimit: {
        max: 50,
        onTruncate: (n) => ui.summary({
            omitted: n,
            hint: 'Use filters (category, search) to narrow results.',
        }),
    },

    // Action affordances — HATEOAS for agents
    suggestActions: (product) => {
        const actions = [];
        if (product.stock < 10) {
            actions.push({
                tool: 'product.update',
                reason: `Low stock alert: only ${product.stock} left`,
                args: { id: product.id },
            });
        }
        return actions;
    },
});

// ═══════════════════════════════════════════════════════════════
// STEP 3: THE TOOLS — Fluent API with Semantic Verbs (the "A")
// ═══════════════════════════════════════════════════════════════

// Router groups related tools — shared prefix, middleware, tags
const product = f.router('product')
    .describe('Product catalog management')
    .tags('catalog');

// ── LIST ────────────────────────────────────────────────────
export const listProducts = product.query('list')
    .describe('List products with optional filters')
    .withOptionalNumber('limit', 'Max results (default: 20)')
    .withOptionalEnum('category', ['electronics', 'clothing', 'food', 'books', 'other'], 'Filter by category')
    .withOptionalString('search', 'Search by name')
    .returns(ProductPresenter)
    .handle(async (input, ctx) => {
        // input.limit?: number, input.category?: string, input.search?: string — fully typed
        const where: Record<string, unknown> = {};
        if (input.category) where.category = input.category;
        if (input.search) where.name = { contains: input.search };
        return await ctx.db.products.findMany({
            take: input.limit ?? 20,
            where,
        });
        // ↑ Return raw data — Presenter validates, strips, renders, truncates automatically
    });

// ── GET BY ID ───────────────────────────────────────────────
export const getProduct = product.query('get')
    .describe('Get a single product by ID')
    .withString('id', 'Product UUID')
    .returns(ProductPresenter)
    .handle(async (input, ctx) => {
        const item = await ctx.db.products.findUnique({ where: { id: input.id } });
        if (!item) {
            return f.error('NOT_FOUND', `Product "${input.id}" not found`)
                .suggest('Check the ID. Use product.list to see valid IDs.')
                .actions('product.list');
        }
        return item;
    });

// ── CREATE ──────────────────────────────────────────────────
export const createProduct = product.mutation('create')
    .describe('Create a new product')
    .invalidates('product.*')            // State Sync: bust cache
    .fromModel(ProductModel, 'create')   // imports: name, description, price_cents, category, stock
    .handle(async (input, ctx) => {
        // input is fully typed from Model's 'create' profile
        return await ctx.db.products.create({ data: input });
    });

// ── UPDATE ──────────────────────────────────────────────────
export const updateProduct = product.action('update')
    .describe('Update an existing product')
    .idempotent()
    .invalidates('product.*')
    .withString('id', 'Product UUID')
    .fromModel(ProductModel, 'update')
    .handle(async (input, ctx) => {
        const existing = await ctx.db.products.findUnique({ where: { id: input.id } });
        if (!existing) {
            return f.error('NOT_FOUND', `Product "${input.id}" not found`)
                .suggest('Use product.list to find valid IDs.')
                .actions('product.list');
        }
        // Model.toApi() — strips undefined, applies aliases
        const data = ProductModel.toApi(input);
        return await ctx.db.products.update({ where: { id: input.id }, data });
    });

// ── DELETE ──────────────────────────────────────────────────
export const deleteProduct = product.mutation('delete')
    .describe('Permanently delete a product')
    .instructions('Use ONLY when the user explicitly confirms deletion. This is irreversible.')
    .invalidates('product.*')
    .withString('id', 'Product UUID')
    .handle(async (input, ctx) => {
        const existing = await ctx.db.products.findUnique({ where: { id: input.id } });
        if (!existing) {
            return f.error('NOT_FOUND', `Product "${input.id}" not found`)
                .suggest('Use product.list to find valid IDs.')
                .actions('product.list');
        }
        await ctx.db.products.delete({ where: { id: input.id } });
        return { deleted: true, id: input.id, name: existing.name };
    });
