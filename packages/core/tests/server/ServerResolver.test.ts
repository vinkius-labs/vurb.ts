/**
 * ServerResolver — Unit Tests
 *
 * Covers the chain-of-responsibility resolver for MCP Server detection.
 * Specifically tests the BUG-SR-1 (callability check) and BUG-SR-2
 * (diagnostic error message) fixes.
 */
import { describe, it, expect } from 'vitest';
import { resolveServer } from '../../src/server/ServerResolver.js';

// Minimal valid server mock
const validServer = { setRequestHandler: () => {} };

// Wrapper like McpServer (SDK's high-level class) that exposes .server
const wrappedServer = { server: validServer };

describe('resolveServer — direct Server instance', () => {
    it('resolves a plain Server with setRequestHandler', () => {
        const result = resolveServer(validServer);
        expect(result).toBe(validServer);
    });

    it('resolves a McpServer wrapper with .server property', () => {
        const result = resolveServer(wrappedServer);
        expect(result).toBe(validServer);
    });
});

describe('resolveServer — null / primitives', () => {
    it('throws for null', () => {
        expect(() => resolveServer(null)).toThrow('attachToServer()');
    });

    it('throws for undefined', () => {
        expect(() => resolveServer(undefined)).toThrow('attachToServer()');
    });

    it('throws for a string', () => {
        expect(() => resolveServer('http://server')).toThrow('attachToServer()');
    });

    it('throws for a number', () => {
        expect(() => resolveServer(42)).toThrow('attachToServer()');
    });
});

describe('BUG-SR-1 regression — isMcpServerLike must check typeof === function', () => {
    it('rejects object where setRequestHandler is a number (not a function)', () => {
        // Before the fix, `'setRequestHandler' in obj` accepted this and would crash
        // at call time with "setRequestHandler is not a function".
        const bad = { setRequestHandler: 42 };
        expect(() => resolveServer(bad)).toThrow();
    });

    it('rejects object where setRequestHandler is a string', () => {
        const bad = { setRequestHandler: 'handler' };
        expect(() => resolveServer(bad)).toThrow();
    });

    it('rejects object where setRequestHandler is null', () => {
        const bad = { setRequestHandler: null };
        expect(() => resolveServer(bad)).toThrow();
    });

    it('rejects wrapped server where .server.setRequestHandler is not a function', () => {
        const bad = { server: { setRequestHandler: true } };
        expect(() => resolveServer(bad)).toThrow();
    });

    it('accepts wrapped server where .server.setRequestHandler IS a function', () => {
        const good = { server: { setRequestHandler: () => {} } };
        expect(() => resolveServer(good)).not.toThrow();
    });
});

describe('BUG-SR-2 regression — error message includes received keys', () => {
    it('error message lists the received object keys when resolution fails', () => {
        const unknownObj = { notAServer: true, someOtherProp: 'x' };
        let caught: unknown;
        try {
            resolveServer(unknownObj);
        } catch (e) {
            caught = e;
        }
        const msg = (caught as Error).message;
        // Keys of the bad object should appear in the error
        expect(msg).toMatch(/notAServer|someOtherProp/);
        expect(msg).toContain('Received keys');
    });

    it('error message for empty object says (none)', () => {
        let caught: unknown;
        try {
            resolveServer({});
        } catch (e) {
            caught = e;
        }
        expect((caught as Error).message).toContain('(none)');
    });

    it('error message is capped at 10 keys (does not explode on huge objects)', () => {
        // Build object with 50 keys
        const huge = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`key${i}`, i]),
        );
        let caught: unknown;
        try {
            resolveServer(huge);
        } catch (e) {
            caught = e;
        }
        const msg = (caught as Error).message;
        // Should not include key10+ if we cap at 10
        expect(msg).not.toContain('key10');
        expect(msg).toContain('key9');
    });
});
