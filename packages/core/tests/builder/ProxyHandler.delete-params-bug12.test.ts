/**
 * Bug #12 — ProxyHandler silently drops non-consumed params for DELETE
 *
 * Root cause:
 *   `createProxyHandler` resolves `:param` path placeholders from
 *   tool input, then builds a `params` object from the remaining
 *   (non-consumed) input fields. For GET/POST/PUT, these params
 *   are passed to the HTTP client (as query params or body).
 *
 *   For DELETE, the handler calls `client.delete(url)` WITHOUT
 *   passing `params`. Any non-consumed input fields are silently
 *   discarded — no error, no warning. The server never receives them.
 *
 *   This breaks tools like:
 *     .proxy('resources/:id', { method: 'DELETE' })
 *     .withString('id', 'Resource ID')
 *     .withString('reason', 'Deletion reason for audit')
 *
 *   The `reason` field is validated by Zod, accepted from the LLM,
 *   but silently dropped before the HTTP call. The audit log on the
 *   backend receives no reason.
 *
 * Expected: Non-consumed params are sent (e.g., as query string).
 * Actual:   Silent data loss — params are computed then ignored.
 */
import { describe, it, expect, vi } from 'vitest';
import { createProxyHandler } from '../../src/core/builder/ProxyHandler.js';

describe('Bug #12 — ProxyHandler DELETE drops non-consumed params', () => {
    it('silently discards non-path params on DELETE request', async () => {
        const deleteFn = vi.fn().mockResolvedValue({ ok: true });
        const ctx = {
            client: {
                get: vi.fn(),
                post: vi.fn(),
                put: vi.fn(),
                delete: deleteFn,
            },
        };

        const handler = createProxyHandler(
            'resources/:id',
            'DELETE',
            false,  // don't unwrap
            undefined,
        );

        const input = {
            id: 'res_42',
            reason: 'spam content',
            requested_by: 'admin@co.io',
        };

        await handler(input, ctx);

        // Path param `:id` was consumed → url = 'resources/res_42' ✅
        // FIX VERIFIED: `reason` and `requested_by` are now passed to
        // client.delete() as the second argument (params).
        expect(deleteFn).toHaveBeenCalledWith(
            'resources/res_42',
            { reason: 'spam content', requested_by: 'admin@co.io' },
        );

        // DELETE now behaves consistently with POST:
        const postFn = vi.fn().mockResolvedValue({ ok: true });
        const postCtx = {
            client: { get: vi.fn(), post: postFn, put: vi.fn(), delete: vi.fn() },
        };
        const postHandler = createProxyHandler('resources', 'POST', false, undefined);
        await postHandler({ reason: 'spam content' }, postCtx);

        expect(postFn).toHaveBeenCalledWith('resources', { reason: 'spam content' });

        // Both methods now pass params — 2 arguments each
        expect(deleteFn.mock.calls[0]).toHaveLength(2);
    });
});
