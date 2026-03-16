/**
 * PROXY API EXAMPLE — Blog Platform
 *
 * Demonstrates .proxy() + .fromModel() for zero-boilerplate API proxying.
 * Use this pattern when your MCP server wraps an existing REST API.
 *
 * Key patterns shown:
 *   - .proxy() — auto-generates handler that proxies to ctx.client
 *   - .fromModel() — imports input params from Model fillable profiles
 *   - .handle() + Model.toApi() — custom logic with alias resolution
 *   - Path params (:id) — consumed from input, excluded from query/body
 *   - Semantic verbs — query → GET, mutation → POST, action → PUT
 */

import { initVurb, defineModel, definePresenter, ui } from '@vurb/core';

// ─── CONTEXT ─────────────────────────────────────────────────
interface AppContext {
    client: {
        get(endpoint: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
        post(endpoint: string, body?: Record<string, unknown>): Promise<{ data: unknown }>;
        put(endpoint: string, body?: Record<string, unknown>): Promise<{ data: unknown }>;
        delete(endpoint: string): Promise<{ data: unknown }>;
    };
}

export const f = initVurb<AppContext>();

// ═══════════════════════════════════════════════════════════════
// MODEL — Blog Post with aliases and fillable profiles
// ═══════════════════════════════════════════════════════════════
export const PostModel = defineModel('Post', m => {
    m.casts({
        id:        m.uuid(),
        title:     m.string('Post title'),
        content:   m.text('Post body in markdown').alias('body'),  // agent says 'content', API expects 'body'
        slug:      m.string('URL-friendly identifier'),
        status:    m.enum('Status', ['draft', 'published', 'archived']),
        author_id: m.string('Author identifier'),
        views:     m.number('View count'),
    });
    m.timestamps();
    m.fillable({
        create: ['title', 'content', 'status'],
        update: ['title', 'content', 'status'],
        query:  ['status', 'author_id'],
    });
});

// ═══════════════════════════════════════════════════════════════
// PRESENTER — Egress Firewall
// ═══════════════════════════════════════════════════════════════
export const PostPresenter = definePresenter({
    name: 'Post',
    schema: PostModel,
    ui: (post) => [
        ui.markdown(`📝 **${post.title}** — ${post.status} | ${post.views} views`),
    ],
    agentLimit: {
        max: 25,
        onTruncate: (n) => ui.summary({ omitted: n, hint: 'Filter by status or author.' }),
    },
    suggestActions: (post) => {
        if (post.status === 'draft') {
            return [{ tool: 'post.publish', reason: 'Publish this draft', args: { id: post.id } }];
        }
        return [];
    },
});

// ═══════════════════════════════════════════════════════════════
// TOOLS — .proxy() for simple pass-through
// ═══════════════════════════════════════════════════════════════
const post = f.router('post')
    .describe('Blog post management')
    .tags('content');

// ── LIST — .proxy() pass-through ────────────────────────────
// .fromModel(PostModel, 'query') → imports: status, author_id
// .proxy('posts') → ctx.client.get('posts', { status, author_id })
// auto-unwraps { data: ... } envelope
export const listPosts = post.query('list')
    .describe('List blog posts with optional filters')
    .fromModel(PostModel, 'query')
    .withOptionalNumber('per_page', 'Results per page')
    .returns(PostPresenter)
    .proxy('posts');

// ── GET — path param (:id) consumed from input ─────────────
// .proxy('posts/:id') → ctx.client.get('posts/abc-123')
// :id consumed from input.id, excluded from query params
export const getPost = post.query('get')
    .describe('Get a single blog post by ID')
    .withString('id', 'Post UUID')
    .returns(PostPresenter)
    .proxy('posts/:id');

// ── CREATE — mutation → POST ────────────────────────────────
// .proxy('posts') → ctx.client.post('posts', { title, content, status })
// Aliases applied: input.content → body in request
export const createPost = post.mutation('create')
    .describe('Create a new blog post')
    .invalidates('post.*')
    .fromModel(PostModel, 'create')
    .proxy('posts');

// ── UPDATE — action → PUT, with custom logic ────────────────
// When you need business logic, use .handle() instead of .proxy()
// Model.toApi() applies the alias (content → body) and strips undefined
export const updatePost = post.action('update')
    .describe('Update an existing blog post')
    .idempotent()
    .invalidates('post.*')
    .withString('id', 'Post UUID')
    .fromModel(PostModel, 'update')
    .handle(async (input, ctx) => {
        // Custom logic: validate status transition
        if (input.status === 'published') {
            const existing = await ctx.client.get(`posts/${input.id}`);
            const post = existing.data as { title: string };
            if (!post.title || post.title.length < 5) {
                return f.error('VALIDATION', 'Posts need a title of at least 5 characters to publish')
                    .suggest('Update the title first, then publish.')
                    .actions('post.update');
            }
        }
        // Model.toApi() — strips undefined values, renames 'content' → 'body' (alias)
        const data = PostModel.toApi(input);
        return (await ctx.client.put(`posts/${input.id}`, data)).data;
    });

// ── PUBLISH — semantic action ───────────────────────────────
export const publishPost = post.action('publish')
    .describe('Publish a draft post')
    .instructions('Use ONLY when the user wants to make a draft post public. This changes the post status to "published".')
    .invalidates('post.*')
    .withString('id', 'Post UUID')
    .handle(async (input, ctx) => {
        return (await ctx.client.put(`posts/${input.id}`, { status: 'published' })).data;
    });

// ── DELETE ───────────────────────────────────────────────────
export const deletePost = post.mutation('delete')
    .describe('Permanently delete a blog post')
    .instructions('Use ONLY when the user explicitly confirms deletion. This is irreversible.')
    .invalidates('post.*')
    .withString('id', 'Post UUID')
    .proxy('posts/:id');
