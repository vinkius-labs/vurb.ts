/**
 * API Key Middleware — Auth Failure Telemetry Tests (#7b)
 *
 * Verifies that the `onAuthFailure` callback is invoked correctly
 * when API key authentication fails due to missing or invalid keys.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ToolResponse } from '@vurb/core';
import { requireApiKey } from '../src/middleware.js';

const VALID_KEY = 'sk_live_validkey12345678';

const NEXT_RESPONSE: ToolResponse = {
    content: [{ type: 'text', text: '{"ok":true}' }],
};

const nextFn = vi.fn(async () => NEXT_RESPONSE);

// ============================================================================
// Tests
// ============================================================================

describe('requireApiKey — onAuthFailure telemetry (#7b)', () => {
    it('calls onAuthFailure when key is missing', async () => {
        const spy = vi.fn();
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            onAuthFailure: spy,
        });

        await middleware({}, {}, nextFn);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toMatchObject({
            type: 'auth.failed',
            method: 'api-key',
            reason: 'missing_key',
        });
        expect(spy.mock.calls[0][0]).toHaveProperty('timestamp');
    });

    it('calls onAuthFailure when key is invalid', async () => {
        const spy = vi.fn();
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            onAuthFailure: spy,
        });

        await middleware({ apiKey: 'sk_live_wrongkey00000000' }, {}, nextFn);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toMatchObject({
            type: 'auth.failed',
            method: 'api-key',
        });
        expect(spy.mock.calls[0][0].reason).toBeTruthy();
    });

    it('does NOT call onAuthFailure on success', async () => {
        const spy = vi.fn();
        const middleware = requireApiKey({
            keys: [VALID_KEY],
            onAuthFailure: spy,
        });

        await middleware({ apiKey: VALID_KEY }, {}, nextFn);

        expect(spy).not.toHaveBeenCalled();
    });

    it('works without onAuthFailure (backward compat)', async () => {
        const middleware = requireApiKey({ keys: [VALID_KEY] });
        const result = await middleware({}, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });
});
