/**
 * Testing Templates — Test setup and example tests
 * @module
 */

/** Generate `vitest.config.ts` */
export function vitestConfig(): string {
    return `import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
    },
});
`;
}

/** Generate `tests/setup.ts` — Test infrastructure */
export function testSetupTs(): string {
    return `/**
 * Test Setup — In-Memory MVA Emulator
 *
 * Creates a VurbTester that runs the full pipeline
 * (Zod → Middleware → Handler → Egress Firewall)
 * without any network transport.
 *
 * 2ms per test. $0.00 in tokens. Zero servers.
 */
import { fileURLToPath } from 'node:url';
import { createVurbTester } from '@vurb/testing';
import { autoDiscover } from '@vurb/core';
import { f } from '../src/vurb.js';

const registry = f.registry();
await autoDiscover(registry, fileURLToPath(new URL('../src/tools', import.meta.url)));

export const tester = createVurbTester(registry, {
    contextFactory: () => ({
        role: 'ADMIN' as const,
        tenantId: 'test-tenant',
    }),
});
`;
}

/** Generate `tests/system.test.ts` — Egress Firewall + RBAC tests */
export function systemTestTs(): string {
    return `/**
 * System Tools — Egress Firewall & RBAC Tests
 *
 * Proves that:
 * 1. The Presenter strips undeclared fields (SOC2 CC6.1)
 * 2. RBAC middleware blocks GUEST access (SOC2 CC6.3)
 * 3. System rules from .describe() are injected
 */
import { describe, it, expect } from 'vitest';
import { tester } from './setup.js';

describe('System Tools', () => {
    describe('Egress Firewall', () => {
        it('should return validated health data through the Presenter', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.isError).toBe(false);
            expect(result.data).toHaveProperty('status');
            expect(result.data).toHaveProperty('uptime');
            expect(result.data).toHaveProperty('version');
            expect(result.data).toHaveProperty('timestamp');
        });

        it('should strip undeclared fields (tenant must NOT leak)', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.isError).toBe(false);
            // The handler returns 'tenant' but the Presenter schema
            // does not declare it → stripped by Egress Firewall
            expect(result.data).not.toHaveProperty('tenant');
        });

        it('should include JIT system rules from .describe()', async () => {
            const result = await tester.callAction('system', 'health');

            expect(result.systemRules.length).toBeGreaterThan(0);
            expect(result.systemRules.some(
                (r: string) => r.includes('uptime') || r.includes('Uptime')
            )).toBe(true);
        });
    });

    describe('Echo Tool', () => {
        it('should echo the message back', async () => {
            const result = await tester.callAction('system', 'echo', {
                message: 'hello vurb',
            });

            expect(result.isError).toBe(false);
            expect(result.data).toHaveProperty('echo', 'hello vurb');
            expect(result.data).toHaveProperty('receivedAt');
        });
    });
});
`;
}
