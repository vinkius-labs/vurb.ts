/**
 * CORS + HMAC Secret Strength Tests (#5, #6)
 *
 * Tests for CORS configuration logic (#6) and HMAC secret strength validation (#5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── #6: CORS Logic Tests ─────────────────────────────────

// Re-implement the exact CORS logic from startServer.ts for unit testing
interface CorsConfig {
    readonly origin: string | readonly string[];
    readonly methods?: readonly string[];
}

function applyCorsHeaders(
    req: { headers: Record<string, string | string[] | undefined>; method?: string },
    res: { setHeader(name: string, value: string): void; writeHead(code: number): { end(): void } },
    cors: CorsConfig | undefined,
): boolean {
    if (!cors) return false;

    const requestOrigin = (req.headers['origin'] as string | undefined) ?? '';
    const allowedOrigins = typeof cors.origin === 'string' ? [cors.origin] : cors.origin;
    const methods = cors.methods ?? ['GET', 'POST', 'DELETE', 'OPTIONS'];

    let matchedOrigin: string;
    if (allowedOrigins.includes('*')) {
        matchedOrigin = '*';
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        matchedOrigin = requestOrigin;
    } else {
        matchedOrigin = allowedOrigins[0] ?? '';
    }

    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return true;
    }

    return false;
}

function mockRes() {
    const headers: Record<string, string> = {};
    return {
        headers,
        setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
        writeHead: vi.fn((_code: number) => ({ end: vi.fn() })),
    };
}

describe('CORS Configuration (#6)', () => {
    it('does nothing when cors is undefined', () => {
        const res = mockRes();
        const result = applyCorsHeaders(
            { headers: {}, method: 'POST' },
            res,
            undefined,
        );
        expect(result).toBe(false);
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('sets wildcard origin when configured', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: { origin: 'https://evil.com' }, method: 'POST' },
            res,
            { origin: '*' },
        );
        expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('matches specific origin from allowed list', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: { origin: 'https://app.example.com' }, method: 'POST' },
            res,
            { origin: ['https://app.example.com', 'https://admin.example.com'] },
        );
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });

    it('uses first allowed origin when request origin does not match', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: { origin: 'https://evil.com' }, method: 'POST' },
            res,
            { origin: ['https://app.example.com'] },
        );
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });

    it('sets default methods when none configured', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: {}, method: 'POST' },
            res,
            { origin: '*' },
        );
        expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST, DELETE, OPTIONS');
    });

    it('respects custom methods', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: {}, method: 'POST' },
            res,
            { origin: '*', methods: ['GET', 'POST'] },
        );
        expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST');
    });

    it('sets allowed headers including Mcp-Session-Id', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: {}, method: 'POST' },
            res,
            { origin: '*' },
        );
        expect(res.headers['Access-Control-Allow-Headers']).toContain('Mcp-Session-Id');
        expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('handles OPTIONS preflight and returns true', () => {
        const res = mockRes();
        const result = applyCorsHeaders(
            { headers: { origin: 'https://app.example.com' }, method: 'OPTIONS' },
            res,
            { origin: 'https://app.example.com' },
        );
        expect(result).toBe(true);
        expect(res.writeHead).toHaveBeenCalledWith(204);
    });

    it('returns false for non-OPTIONS requests', () => {
        const res = mockRes();
        const result = applyCorsHeaders(
            { headers: {}, method: 'POST' },
            res,
            { origin: '*' },
        );
        expect(result).toBe(false);
    });

    it('accepts single origin string', () => {
        const res = mockRes();
        applyCorsHeaders(
            { headers: { origin: 'https://app.example.com' }, method: 'GET' },
            res,
            { origin: 'https://app.example.com' },
        );
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    });
});

// ── #5: HMAC Secret Strength ─────────────────────────────

describe('HMAC Secret Strength (#5)', () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
        originalNodeEnv = process.env['NODE_ENV'];
    });

    afterEach(() => {
        if (originalNodeEnv !== undefined) {
            process.env['NODE_ENV'] = originalNodeEnv;
        } else {
            delete process.env['NODE_ENV'];
        }
    });

    it('warns for short secrets in non-production', async () => {
        process.env['NODE_ENV'] = 'development';
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { createHmacSigner } = await import(
            '../../src/introspection/CryptoAttestation.js'
        );
        createHmacSigner('short');

        expect(warnSpy).toHaveBeenCalled();
        expect(warnSpy.mock.calls[0][0]).toContain('HMAC secret must be at least 32 characters');
        warnSpy.mockRestore();
    });

    it('throws for short secrets in production', async () => {
        process.env['NODE_ENV'] = 'production';

        // Re-import to get fresh module evaluation
        const { createHmacSigner } = await import(
            '../../src/introspection/CryptoAttestation.js'
        );

        expect(() => createHmacSigner('short')).toThrow(
            /HMAC secret must be at least 32 characters/,
        );
    });

    it('does NOT warn for secrets >= 32 chars', async () => {
        process.env['NODE_ENV'] = 'development';
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { createHmacSigner } = await import(
            '../../src/introspection/CryptoAttestation.js'
        );
        const secret = 'a'.repeat(32);
        createHmacSigner(secret);

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('returns a valid signer from createHmacSigner', async () => {
        const { createHmacSigner } = await import(
            '../../src/introspection/CryptoAttestation.js'
        );
        const secret = 'a-very-secure-secret-with-32-ch!';
        const signer = createHmacSigner(secret);

        expect(signer.name).toBe('hmac-sha256');
        expect(typeof signer.sign).toBe('function');
        expect(typeof signer.verify).toBe('function');

        const signed = await signer.sign('test-digest');
        expect(typeof signed).toBe('string');
        expect(await signer.verify('test-digest', signed)).toBe(true);
        expect(await signer.verify('test-digest', 'wrong')).toBe(false);
    });
});
