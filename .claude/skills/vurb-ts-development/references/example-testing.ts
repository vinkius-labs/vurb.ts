/**
 * TESTING EXAMPLE — MVA Pipeline Assertions
 *
 * Demonstrates @vurb/testing for in-memory MVA lifecycle emulation.
 * The VurbTester runs the REAL pipeline (Zod → Middleware → Handler → Presenter → Egress)
 * in RAM — zero tokens consumed, zero servers, deterministic.
 *
 * Key patterns shown:
 *   - createVurbTester() — in-memory test harness
 *   - Egress Firewall assertions — PII physically absent from response
 *   - System Rules assertions — JIT rules travel with data
 *   - Middleware assertions — RBAC enforcement
 *   - Error handling assertions — self-healing error structure
 *   - Context overrides — test different user roles
 */

import { describe, it, expect } from 'vitest';
import { createVurbTester } from '@vurb/testing';
import { initVurb, defineModel, definePresenter } from '@vurb/core';

// ─── SETUP ───────────────────────────────────────────────────

interface TestContext {
    role: 'ADMIN' | 'USER' | 'GUEST';
    tenantId: string;
}

const f = initVurb<TestContext>();

// Model with hidden fields
const CustomerModel = defineModel('Customer', m => {
    m.casts({
        id:            m.uuid(),
        name:          m.string('Full name'),
        email:         m.string('Email address').describe('Email addresses are PII — handle with care.'),
        phone:         m.string('Phone number'),
        credit_score:  m.number('Internal credit score'),
    });
    m.hidden(['credit_score']);   // never exposed to agent
    m.timestamps();
    m.fillable({
        create: ['name', 'email', 'phone'],
        update: ['name', 'phone'],
    });
});

const CustomerPresenter = definePresenter({
    name: 'Customer',
    schema: CustomerModel,
    agentLimit: { max: 10 },
});

// Auth middleware
const requireAuth = f.middleware(async (ctx) => {
    if (ctx.role === 'GUEST') throw new Error('Authentication required');
    return { role: ctx.role };
});

// Tools
const customerRouter = f.router('customer').use(requireAuth);

const listCustomers = customerRouter.query('list')
    .describe('List all customers')
    .withOptionalNumber('take', 'Max results')
    .returns(CustomerPresenter)
    .handle(async (input) => {
        // Simulated database response — includes hidden fields
        return [
            { id: 'c-1', name: 'Alice', email: 'alice@test.com', phone: '+1-555-0101', credit_score: 780, created_at: '2024-01-01', updated_at: '2024-06-01' },
            { id: 'c-2', name: 'Bob', email: 'bob@test.com', phone: '+1-555-0102', credit_score: 650, created_at: '2024-02-01', updated_at: '2024-07-01' },
        ];
    });

const getCustomer = customerRouter.query('get')
    .describe('Get a customer by ID')
    .withString('id', 'Customer UUID')
    .returns(CustomerPresenter)
    .handle(async (input) => {
        if (input.id === 'not-found') return f.error('NOT_FOUND', 'Customer not found')
            .suggest('Use customer.list to find valid IDs')
            .actions('customer.list');
        return { id: input.id, name: 'Alice', email: 'alice@test.com', phone: '+1-555-0101', credit_score: 780, created_at: '2024-01-01', updated_at: '2024-06-01' };
    });

// Registry
const registry = f.registry();
registry.register(listCustomers);
registry.register(getCustomer);

// ─── TESTS ───────────────────────────────────────────────────

describe('Customer MVA Pipeline', () => {
    const tester = createVurbTester(registry, {
        contextFactory: () => ({ role: 'ADMIN' as const, tenantId: 't_42' }),
    });

    // ── Egress Firewall ──────────────────────────────────
    it('should strip hidden fields (credit_score)', async () => {
        const result = await tester.callAction('customer', 'list');

        expect(result.isError).toBe(false);
        expect(result.data).toHaveLength(2);

        // PII physically absent — not filtered client-side, stripped in RAM
        expect(result.data[0]).not.toHaveProperty('credit_score');
        expect(result.data[1]).not.toHaveProperty('credit_score');

        // Allowed fields present
        expect(result.data[0]).toHaveProperty('name', 'Alice');
        expect(result.data[0]).toHaveProperty('email', 'alice@test.com');
    });

    // ── JIT System Rules ─────────────────────────────────
    it('should include system rules from Model .describe()', async () => {
        const result = await tester.callAction('customer', 'list');

        // Rules travel WITH data, not in global prompt
        expect(result.systemRules).toContain('Email addresses are PII — handle with care.');
    });

    // ── Symbol Invisibility ──────────────────────────────
    it('should not leak metadata through JSON serialization', async () => {
        const result = await tester.callAction('customer', 'list');

        // Transport never sees hidden fields
        const serialized = JSON.stringify(result.rawResponse);
        expect(serialized).not.toContain('credit_score');
    });

    // ── Middleware — RBAC ─────────────────────────────────
    it('should block GUEST users', async () => {
        const result = await tester.callAction(
            'customer', 'list', {},
            { role: 'GUEST' as const, tenantId: 't_42' },  // override context
        );

        expect(result.isError).toBe(true);
    });

    it('should allow ADMIN users', async () => {
        const result = await tester.callAction('customer', 'list');
        expect(result.isError).toBe(false);
    });

    // ── Error Handling ───────────────────────────────────
    it('should return self-healing error for not found', async () => {
        const result = await tester.callAction('customer', 'get', { id: 'not-found' });

        expect(result.isError).toBe(true);
        // The error response contains structured recovery hints
    });

    it('should return data for valid ID', async () => {
        const result = await tester.callAction('customer', 'get', { id: 'c-1' });

        expect(result.isError).toBe(false);
        expect(result.data).toHaveProperty('name', 'Alice');
        expect(result.data).not.toHaveProperty('credit_score');
    });
});
