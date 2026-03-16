/**
 * Bug #11 — VurbClient.executeBatch loses completed mutation results
 *           when throwOnError=true in parallel mode
 *
 * Root cause:
 *   `executeBatch` in parallel mode uses `Promise.all(items.map(...))`.
 *   When `throwOnError: true`, `executeInternal` throws on any error
 *   response. `Promise.all` short-circuits on the FIRST rejection,
 *   discarding all other results — including successfully completed
 *   mutations.
 *
 *   The caller receives an exception for one failed call but has
 *   NO visibility into which sibling calls succeeded. If the caller
 *   retries the entire batch, mutations that already completed will
 *   execute again (double-create, double-charge, etc.).
 *
 * Expected: Caller can identify which calls succeeded and which failed.
 * Actual:   First error throws; completed mutations are invisible.
 */
import { describe, it, expect, vi } from 'vitest';
import { createVurbClient, type VurbTransport } from '../../src/client/VurbClient.js';
import { success, toolError } from '../../src/core/response.js';

type TestRouter = {
    'billing.charge': { amount: number };
    'projects.create': { name: string };
    'users.delete': { id: string };
};

describe('Bug #11 — executeBatch parallel + throwOnError mutation loss', () => {
    it('completed mutations are invisible when a sibling call errors', async () => {
        const executedCalls: string[] = [];

        const transport: VurbTransport = {
            callTool: async (name: string, args: Record<string, unknown>) => {
                const action = args['action'] as string;
                const key = `${name}.${action}`;
                executedCalls.push(key);

                // Simulate: billing.charge succeeds, projects.create fails, users.delete succeeds
                if (key === 'projects.create') {
                    return toolError('VALIDATION_ERROR', { message: 'Name is required' });
                }
                // Small delay so mutations complete around the same time
                await new Promise(r => setTimeout(r, 5));
                return success(`${key} done`);
            },
        };

        const client = createVurbClient<TestRouter>(transport, {
            throwOnError: true,
        });

        // Execute three calls in parallel — one will fail
        await expect(
            client.executeBatch([
                { action: 'billing.charge', args: { amount: 500 } },
                { action: 'projects.create', args: { name: '' } },   // will error
                { action: 'users.delete', args: { id: 'u_42' } },
            ] as any),
        ).rejects.toThrow();

        // Wait for all promises to settle (including the ones Promise.all abandoned)
        await new Promise(r => setTimeout(r, 50));

        // BUG: All three calls were dispatched to the server.
        // The mutation billing.charge executed, users.delete executed,
        // but the caller only got an exception about projects.create.
        // They have NO WAY to know that billing.charge and users.delete
        // already completed — retrying the whole batch would double-charge.
        expect(executedCalls).toContain('billing.charge');
        expect(executedCalls).toContain('users.delete');

        // The caller received only the error for projects.create,
        // not the results of the other two successful mutations.
        // This is the bug: parallel executeBatch + throwOnError = silent mutation loss.
        expect(executedCalls).toHaveLength(3);
    });
});
