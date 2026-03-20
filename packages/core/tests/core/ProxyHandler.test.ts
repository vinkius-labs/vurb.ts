/**
 * ProxyHandler — Unit Tests
 *
 * Tests the `createProxyHandler()` standalone factory extracted from
 * FluentToolBuilder.proxy(). Covers:
 *   - Endpoint `:param` interpolation
 *   - HTTP method dispatch
 *   - Model alias resolution via toApi()
 *   - Auto-unwrap of { data } envelopes
 *   - Undefined value stripping
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { createProxyHandler } from '../../src/core/builder/ProxyHandler.js';
import { defineModel } from '../../src/model/defineModel.js';

// ============================================================================
// Mock HTTP Client
// ============================================================================

function createMockClient() {
    return {
        get: vi.fn().mockResolvedValue({ data: [] }),
        post: vi.fn().mockResolvedValue({ id: 1 }),
        put: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({}),
    };
}

function mockCtx(client: ReturnType<typeof createMockClient>) {
    return { client };
}

// ============================================================================
// Endpoint Interpolation
// ============================================================================

describe('ProxyHandler — Endpoint Interpolation', () => {
    it('should interpolate :param placeholders from input', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users/:user_id/tasks', 'GET', false);

        await handler({ user_id: 'u-42', status: 'open' }, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith(
            '/users/u-42/tasks',
            { status: 'open' },
        );
    });

    it('should strip consumed path params from query/body', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/items/:id', 'GET', false);

        await handler({ id: '99', limit: 10 }, mockCtx(client));

        // `id` consumed by path → only `limit` should remain
        expect(client.get).toHaveBeenCalledWith(
            '/items/99',
            { limit: 10 },
        );
    });

    it('should handle endpoints with no placeholders', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/health', 'GET', false);

        await handler({}, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith('/health', {});
    });

    it('should coerce non-string param values to string in URL', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/tasks/:task_id', 'GET', false);

        await handler({ task_id: 42 }, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith('/tasks/42', {});
    });
});

// ============================================================================
// HTTP Method Dispatch
// ============================================================================

describe('ProxyHandler — HTTP Method Dispatch', () => {
    it('GET should call client.get with URL and params', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users', 'GET', false);

        await handler({ status: 'active' }, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith('/users', { status: 'active' });
        expect(client.post).not.toHaveBeenCalled();
    });

    it('POST should call client.post with URL and body', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users', 'POST', false);

        await handler({ name: 'Alice' }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith('/users', { name: 'Alice' });
    });

    it('PUT should call client.put with URL and body', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users/:id', 'PUT', false);

        await handler({ id: '1', name: 'Bob' }, mockCtx(client));

        expect(client.put).toHaveBeenCalledWith('/users/1', { name: 'Bob' });
    });

    it('DELETE should call client.delete with URL and params', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users/:id', 'DELETE', false);

        await handler({ id: '1' }, mockCtx(client));

        expect(client.delete).toHaveBeenCalledWith('/users/1', {});
    });

    it('DELETE should pass non-consumed params to client.delete', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users/:id', 'DELETE', false);

        await handler({ id: '1', reason: 'spam' }, mockCtx(client));

        expect(client.delete).toHaveBeenCalledWith('/users/1', { reason: 'spam' });
    });
});

// ============================================================================
// Undefined Value Stripping
// ============================================================================

describe('ProxyHandler — Undefined Stripping', () => {
    it('should strip undefined values from params', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/items', 'POST', false);

        await handler({ title: 'X', description: undefined, count: 0 }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith(
            '/items',
            { title: 'X', count: 0 },
        );
    });

    it('should keep falsy but defined values (0, false, "")', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/items', 'POST', false);

        await handler({ a: 0, b: false, c: '' }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith(
            '/items',
            { a: 0, b: false, c: '' },
        );
    });
});

// ============================================================================
// Auto-Unwrap { data } Envelope
// ============================================================================

describe('ProxyHandler — Auto-Unwrap', () => {
    it('should unwrap { data } envelope when enabled', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: [{ id: 1, name: 'Alice' }] });

        const handler = createProxyHandler('/users', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should NOT unwrap when disabled', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: [{ id: 1 }] });

        const handler = createProxyHandler('/users', 'GET', false);
        const result = await handler({}, mockCtx(client));

        expect(result).toEqual({ data: [{ id: 1 }] });
    });

    it('should NOT unwrap non-object responses', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue('raw-text');

        const handler = createProxyHandler('/ping', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toBe('raw-text');
    });

    it('should NOT unwrap null responses', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue(null);

        const handler = createProxyHandler('/ping', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toBeNull();
    });

    it('should NOT unwrap objects without a data property', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ items: [1, 2, 3] });

        const handler = createProxyHandler('/things', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toEqual({ items: [1, 2, 3] });
    });
});

// ============================================================================
// Model Alias Resolution via toApi()
// ============================================================================

describe('ProxyHandler — Model Alias Resolution', () => {
    const ProposalModel = defineModel('Proposal', m => {
        m.casts({
            title:   m.string('Proposal title'),
            content: m.text('Proposal content').alias('description'),
            status:  m.enum('Status', ['draft', 'sent', 'accepted']),
        });
    });

    it('should rename aliased fields via Model.toApi()', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/proposals', 'POST', false, ProposalModel);

        await handler(
            { title: 'New Deal', content: 'Details here', status: 'draft' },
            mockCtx(client),
        );

        // 'content' → 'description' via alias
        expect(client.post).toHaveBeenCalledWith('/proposals', {
            title: 'New Deal',
            description: 'Details here',
            status: 'draft',
        });
    });

    it('should pass through non-aliased fields unchanged', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/proposals', 'POST', false, ProposalModel);

        await handler({ title: 'X', status: 'sent' }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith('/proposals', {
            title: 'X',
            status: 'sent',
        });
    });

    it('should combine interpolation + alias in same request', async () => {
        const client = createMockClient();
        const handler = createProxyHandler(
            '/proposals/:proposal_id',
            'PUT',
            false,
            ProposalModel,
        );

        await handler(
            { proposal_id: 'p-1', content: 'Updated text' },
            mockCtx(client),
        );

        // proposal_id consumed by URL, content → description via alias
        expect(client.put).toHaveBeenCalledWith('/proposals/p-1', {
            description: 'Updated text',
        });
    });
});

// ============================================================================
// Extended Coverage
// ============================================================================

describe('ProxyHandler — Multiple Path Params', () => {
    it('should interpolate multiple :param placeholders correctly', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/orgs/:org_id/repos/:repo_id/issues', 'GET', false);

        await handler({ org_id: 'acme', repo_id: 'core', labels: 'bug' }, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith(
            '/orgs/acme/repos/core/issues',
            { labels: 'bug' },
        );
    });

    it('should consume all path params and leave only non-path params', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/a/:x/b/:y/c/:z', 'POST', false);

        await handler({ x: '1', y: '2', z: '3', body: 'data' }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith('/a/1/b/2/c/3', { body: 'data' });
    });
});

describe('ProxyHandler — Missing Path Param Error', () => {
    it('throws a descriptive error when a required path param is absent', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/users/:user_id/posts', 'GET', false);

        await expect(
            handler({ limit: 10 }, mockCtx(client)), // user_id missing
        ).rejects.toThrow(/user_id/);
    });

    it('error message includes the endpoint pattern for context', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/tasks/:task_id', 'DELETE', false);

        await expect(
            handler({}, mockCtx(client)),
        ).rejects.toThrow(/\/tasks\/:task_id/);
    });

    it('throws when path param is explicitly undefined in input', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/items/:item_id', 'PUT', false);

        await expect(
            handler({ item_id: undefined, name: 'X' }, mockCtx(client)),
        ).rejects.toThrow(/item_id/);
    });
});

describe('ProxyHandler — Unwrap Edge Cases', () => {
    it('should unwrap { data: null } to null when unwrap is enabled', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: null });

        const handler = createProxyHandler('/resources/:id', 'GET', true);
        const result = await handler({ id: '1' }, mockCtx(client));

        // data property exists → unwrapped; data is null → returns null
        expect(result).toBeNull();
    });

    it('should unwrap { data: 0 } to 0 (falsy but defined)', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: 0 });

        const handler = createProxyHandler('/count', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toBe(0);
    });

    it('should unwrap { data: false } to false', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: false });

        const handler = createProxyHandler('/flag', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toBe(false);
    });

    it('should unwrap { data: [] } to empty array', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ data: [] });

        const handler = createProxyHandler('/list', 'GET', true);
        const result = await handler({}, mockCtx(client));

        expect(result).toEqual([]);
    });
});

describe('ProxyHandler — All HTTP Methods dispatch + param stripping', () => {
    it('GET strips consumed path params, passes remainder as query', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/projects/:id', 'GET', false);

        await handler({ id: 'p-1', page: 2, limit: 20 }, mockCtx(client));

        expect(client.get).toHaveBeenCalledWith('/projects/p-1', { page: 2, limit: 20 });
    });

    it('POST strips consumed path params, passes remainder as body', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/projects/:id/comments', 'POST', false);

        await handler({ id: 'p-1', text: 'Great work!' }, mockCtx(client));

        expect(client.post).toHaveBeenCalledWith('/projects/p-1/comments', { text: 'Great work!' });
    });

    it('PUT strips consumed path params, passes remainder as body', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/projects/:id', 'PUT', false);

        await handler({ id: 'p-1', name: 'Updated', status: 'active' }, mockCtx(client));

        expect(client.put).toHaveBeenCalledWith('/projects/p-1', { name: 'Updated', status: 'active' });
    });

    it('DELETE strips consumed path params, passes remainder as query', async () => {
        const client = createMockClient();
        const handler = createProxyHandler('/projects/:id', 'DELETE', false);

        await handler({ id: 'p-1', reason: 'deprecated' }, mockCtx(client));

        expect(client.delete).toHaveBeenCalledWith('/projects/p-1', { reason: 'deprecated' });
    });
});
