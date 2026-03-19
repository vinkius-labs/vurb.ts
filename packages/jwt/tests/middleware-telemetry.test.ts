/**
 * JWT Middleware — Auth Failure Telemetry Tests (#7a)
 *
 * Verifies that the `onAuthFailure` callback is invoked correctly
 * when JWT authentication fails due to missing or invalid tokens.
 */
import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'node:crypto';
import type { ToolResponse } from '@vurb/core';
import { requireJwt } from '../src/middleware.js';

// ── JWT Helper ───────────────────────────────────────────

function createHS256Token(payload: Record<string, unknown>, secret: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${signature}`;
}

const SECRET = 'test-secret-key-at-least-32-chars!';
const NOW = Math.floor(Date.now() / 1000);
const VALID_TOKEN = createHS256Token({ sub: 'user-1', exp: NOW + 3600 }, SECRET);

const NEXT_RESPONSE: ToolResponse = {
    content: [{ type: 'text', text: '{"ok":true}' }],
};

const nextFn = vi.fn(async () => NEXT_RESPONSE);

// ============================================================================
// Tests
// ============================================================================

describe('requireJwt — onAuthFailure telemetry (#7a)', () => {
    it('calls onAuthFailure when token is missing', async () => {
        const spy = vi.fn();
        const middleware = requireJwt({
            secret: SECRET,
            onAuthFailure: spy,
        });

        await middleware({}, {}, nextFn);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toMatchObject({
            type: 'auth.failed',
            method: 'jwt',
            reason: 'missing_token',
        });
        expect(spy.mock.calls[0][0]).toHaveProperty('timestamp');
    });

    it('calls onAuthFailure when token is invalid', async () => {
        const spy = vi.fn();
        const middleware = requireJwt({
            secret: SECRET,
            onAuthFailure: spy,
        });

        await middleware({ token: 'invalid.jwt.here' }, {}, nextFn);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toMatchObject({
            type: 'auth.failed',
            method: 'jwt',
        });
        expect(spy.mock.calls[0][0].reason).toBeTruthy();
    });

    it('calls onAuthFailure when token has wrong secret', async () => {
        const spy = vi.fn();
        const wrongToken = createHS256Token(
            { sub: 'user-1', exp: NOW + 3600 },
            'wrong-secret-at-least-32-chars!!',
        );
        const middleware = requireJwt({
            secret: SECRET,
            onAuthFailure: spy,
        });

        await middleware({ token: wrongToken }, {}, nextFn);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].type).toBe('auth.failed');
        expect(spy.mock.calls[0][0].method).toBe('jwt');
    });

    it('does NOT call onAuthFailure on success', async () => {
        const spy = vi.fn();
        const middleware = requireJwt({
            secret: SECRET,
            onAuthFailure: spy,
        });

        await middleware({ token: VALID_TOKEN }, {}, nextFn);

        expect(spy).not.toHaveBeenCalled();
    });

    it('works without onAuthFailure (backward compat)', async () => {
        const middleware = requireJwt({ secret: SECRET });
        const result = await middleware({}, {}, nextFn);
        expect(result).toHaveProperty('isError', true);
    });
});
