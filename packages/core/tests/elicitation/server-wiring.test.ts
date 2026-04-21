/**
 * ServerAttachment — Elicitation Wiring Integration
 *
 * Tests the full pipeline from ServerAttachment through to ask():
 * - extractElicitSink correctly extracts sendRequest from extra
 * - _elicitStore is bound during tool execution
 * - ask() works inside handler when sendRequest is available
 * - ask() throws when sendRequest is NOT available
 * - Zero overhead when sendRequest is absent
 *
 * These tests mock the MCP server attachment to verify the wiring
 * without requiring a real MCP server.
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';
import { initVurb, ask } from '../../src/index.js';
import { _elicitStore } from '../../src/core/elicitation/ask.js';
import { ElicitationUnsupportedError } from '../../src/core/elicitation/types.js';

describe('ServerAttachment — elicitation wiring (unit)', () => {

    it('ask() inside _elicitStore.run() resolves from mock sink', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        let capturedResult: unknown;

        registry.register(
            f.mutation('test.elicit')
                .interactive()
                .handle(async () => {
                    const result = await ask('Choose region:', {
                        region: ask.enum(['us', 'eu'] as const, 'Region'),
                    });
                    capturedResult = result;
                    if (result.declined) return { cancelled: true };
                    return { region: result.data.region };
                }),
        );

        // Simulate what ServerAttachment does: wrap routeCall in _elicitStore.run()
        const mockSendRequest = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { region: 'eu' },
        });

        const result = await _elicitStore.run(mockSendRequest, () =>
            registry.routeCall(undefined as never, 'test', { action: 'elicit' }),
        );

        // ask() should have sent the correct MCP request
        expect(mockSendRequest).toHaveBeenCalledOnce();
        const call = mockSendRequest.mock.calls[0]![0];
        expect(call.method).toBe('elicitation/create');
        expect((call.params as { message: string }).message).toBe('Choose region:');

        // The tool response should contain the user's selection
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.region).toBe('eu');
    });

    it('ask() inside handler without _elicitStore context throws', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.nocontext')
                .interactive()
                .handle(async () => {
                    // This should throw because we're NOT inside _elicitStore.run()
                    const result = await ask('Test:', { x: ask.string() });
                    return { x: result.data.x };
                }),
        );

        // Call WITHOUT wrapping in _elicitStore.run() — simulates client without elicitation support
        const result = await registry.routeCall(undefined as never, 'test', { action: 'nocontext' });

        // The error should be caught by GroupedToolBuilder and returned as an error response
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        // Error message is wrapped in Vurb's tool_error XML format
        expect(text).toContain('Elicitation requested but no transport context is available');
        expect(text).toContain('.interactive()');
    });

    it('handler that conditionally uses ask() works in both contexts', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.mutation('test.conditional')
                .withString('mode', 'Mode')
                .interactive()
                .handle(async (input) => {
                    if (input.mode === 'interactive') {
                        const confirmation = await ask('Confirm?', {
                            ok: ask.boolean('OK'),
                        });
                        return { confirmed: confirmation.accepted };
                    }
                    // Non-interactive path — no ask() called
                    return { confirmed: true };
                }),
        );

        // Non-interactive path — works without elicitation context
        const r1 = await registry.routeCall(
            undefined as never,
            'test',
            { action: 'conditional', mode: 'batch' },
        );
        expect(r1.isError).toBeFalsy();

        // Interactive path — needs elicitation context
        const mockSendRequest = vi.fn().mockResolvedValue({
            action: 'accept',
            content: { ok: true },
        });

        const r2 = await _elicitStore.run(mockSendRequest, () =>
            registry.routeCall(
                undefined as never,
                'test',
                { action: 'conditional', mode: 'interactive' },
            ),
        );
        expect(r2.isError).toBeFalsy();
        const parsed = JSON.parse((r2.content[0] as { text: string }).text);
        expect(parsed.confirmed).toBe(true);
    });

    it('multi-step ask() through full pipeline', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.action('wizard.onboard')
                .interactive()
                .handle(async () => {
                    const step1 = await ask('Step 1: What is your name?', {
                        name: ask.string('Name'),
                    });
                    if (step1.declined) return { aborted: 'step1' };

                    const step2 = await ask(`Welcome ${step1.data.name}! Choose plan:`, {
                        plan: ask.enum(['free', 'pro'] as const),
                    });
                    if (step2.declined) return { aborted: 'step2' };

                    return {
                        name: step1.data.name,
                        plan: step2.data.plan,
                    };
                }),
        );

        let callIdx = 0;
        const mockSendRequest = vi.fn().mockImplementation(async () => {
            callIdx++;
            if (callIdx === 1) return { action: 'accept', content: { name: 'Alice' } };
            return { action: 'accept', content: { plan: 'pro' } };
        });

        const result = await _elicitStore.run(mockSendRequest, () =>
            registry.routeCall(undefined as never, 'wizard', { action: 'onboard' }),
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.name).toBe('Alice');
        expect(parsed.plan).toBe('pro');
        expect(mockSendRequest).toHaveBeenCalledTimes(2);

        // Verify second ask() used data from the first
        const secondCall = mockSendRequest.mock.calls[1]![0];
        expect((secondCall.params as { message: string }).message).toContain('Alice');
    });

    it('ask.redirect() through full pipeline', async () => {
        const f = initVurb<void>();
        const registry = f.registry();

        registry.register(
            f.action('auth.github')
                .interactive()
                .handle(async () => {
                    const result = await ask.redirect(
                        'Authenticate with GitHub:',
                        'https://github.com/login/oauth',
                    );
                    if (result.declined) return { connected: false };
                    return { connected: true };
                }),
        );

        const mockSendRequest = vi.fn().mockResolvedValue({ action: 'accept' });

        const result = await _elicitStore.run(mockSendRequest, () =>
            registry.routeCall(undefined as never, 'auth', { action: 'github' }),
        );

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.connected).toBe(true);

        // Verify URL mode request
        const call = mockSendRequest.mock.calls[0]![0];
        const params = call.params as { message: string; url: string };
        expect(params.url).toBe('https://github.com/login/oauth');
    });
});
