/**
 * FHP — Tests: SwarmGateway
 *
 * Unit tests for SwarmGateway constructor validation and _resolveDomain
 * error path sanitization. These are the pure, synchronous code paths that
 * do not require live upstream connections.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { SwarmGateway } from '../src/SwarmGateway.ts';

// Minimal valid config shared across tests
const VALID_CONFIG = {
    registry: { finance: 'http://finance-agent:8081' },
    delegationSecret: 'test-secret-32-bytes-minimum!!',
};

// ============================================================================
// BUG-AQ: Registry URI validation in constructor
// ============================================================================

describe('SwarmGateway constructor — registry validation (BUG-AQ)', () => {
    it('valid registry should not throw', () => {
        expect(() => new SwarmGateway(VALID_CONFIG)).not.toThrow();
    });

    it('registry with an empty-string URI should throw with code REGISTRY_INVALID_URI', () => {
        // BUG-AQ FIX: { finance: '' } used to pass the Object.hasOwn check silently
        // and only surface as `TypeError: Invalid URL` deep in _resolveTransport at runtime.
        let caught: unknown;
        try {
            new SwarmGateway({ ...VALID_CONFIG, registry: { finance: '' } });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as NodeJS.ErrnoException).message).toMatch(/empty URIs/i);
        expect((caught as { code?: string }).code).toBe('REGISTRY_INVALID_URI');
    });

    it('registry with multiple empty URIs should list all offending keys', () => {
        let caught: unknown;
        try {
            new SwarmGateway({
                ...VALID_CONFIG,
                registry: { finance: '', devops: '', hr: 'http://hr:9000' },
            });
        } catch (e) {
            caught = e;
        }
        const msg = (caught as Error).message;
        // Both bad keys must appear in the message
        expect(msg).toContain('"finance"');
        expect(msg).toContain('"devops"');
        // The valid key must NOT appear
        expect(msg).not.toContain('"hr"');
    });

    it('registry with null-like values (from JS callers without TS) should also throw', () => {
        // Ensures the guard works even when called from non-TypeScript code
        const badRegistry = { finance: null } as unknown as Record<string, string>;
        expect(() => new SwarmGateway({ ...VALID_CONFIG, registry: badRegistry }))
            .toThrow(/REGISTRY_INVALID_URI|empty URI/i);
    });
});

// ============================================================================
// BUG-AQ: hasActiveHandoff / sessionCount with valid config
// ============================================================================

describe('SwarmGateway public API — basic state queries', () => {
    it('hasActiveHandoff returns false for unknown sessionId', () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        expect(gw.hasActiveHandoff('unknown-session')).toBe(false);
    });

    it('isConnecting returns false for unknown sessionId', () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        expect(gw.isConnecting('unknown-session')).toBe(false);
    });

    it('sessionCount starts at 0', () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        expect(gw.sessionCount).toBe(0);
    });

    it('connectingCount starts at 0', () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        expect(gw.connectingCount).toBe(0);
    });
});

// ============================================================================
// BUG-AT: _resolveDomain sanitizes target in error message
// ============================================================================

describe('SwarmGateway._resolveDomain — error message sanitization (BUG-AT)', () => {
    it('unknown target should throw with code REGISTRY_LOOKUP_FAILED', async () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        const signal = new AbortController().signal;

        let caught: unknown;
        try {
            await gw.activateHandoff(
                { target: 'devops', carryOverState: undefined },
                'session-1',
                signal,
            );
        } catch (e) {
            caught = e;
        }

        expect((caught as { code?: string }).code).toBe('REGISTRY_LOOKUP_FAILED');
    });

    it('target with control characters should be stripped from the error message (BUG-AT fix)', async () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        const signal = new AbortController().signal;

        // Embed ANSI escape and null byte in the target
        const adversarialTarget = 'evil\x00\x1b[31mred\x1b[0m';

        let caught: unknown;
        try {
            await gw.activateHandoff(
                { target: adversarialTarget, carryOverState: undefined },
                'session-2',
                signal,
            );
        } catch (e) {
            caught = e;
        }

        const msg = (caught as Error).message;
        // The error must exist and mention a sanitized version of the target
        expect(msg).toContain('[vurb/swarm] Unknown handoff target');
        // Control characters must NOT appear in the message
        expect(msg).not.toContain('\x00');
        expect(msg).not.toContain('\x1b');
    });

    it('very long target (>200 chars) should be truncated in the error message (BUG-AT fix)', async () => {
        const gw = new SwarmGateway(VALID_CONFIG);
        const signal = new AbortController().signal;

        const longTarget = 'a'.repeat(500);

        let caught: unknown;
        try {
            await gw.activateHandoff(
                { target: longTarget, carryOverState: undefined },
                'session-3',
                signal,
            );
        } catch (e) {
            caught = e;
        }

        const msg = (caught as Error).message;
        // 500 'a' chars should be truncated to 200 in the message
        expect(msg).not.toContain('a'.repeat(201));
        expect(msg).toContain('a'.repeat(200));
    });
});
