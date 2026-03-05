/**
 * StateMachineGate.restore() — Regression Tests for Bug #1
 *
 * Bug: `restore()` sets `_currentState` but `init()` creates the XState
 * actor from `config.initial`, and the subscription overwrites `_currentState`
 * back to the initial state. The restored state is silently lost.
 *
 * These tests mock XState to simulate the actor code path (XState is an
 * optional peer dependency and is NOT installed in the test environment,
 * which is exactly why existing tests never caught this bug).
 *
 * Fix applied:
 * 1. `init()` now uses `_currentState` (possibly set by restore()) instead
 *    of `config.initial` when creating the machine.
 * 2. `restore()` now stops the XState actor and marks as uninitialized,
 *    forcing re-creation with the restored state on next transition.
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FsmConfig, FsmSnapshot } from '../../src/fsm/StateMachineGate.js';

// ── XState Mock ──────────────────────────────────────────
// We need to mock the dynamic import('xstate') to simulate the XState
// actor code path. The mock creates a minimal actor that:
// 1. Fires a subscription callback with the machine's initial state on .start()
// 2. Processes events and transitions to target states via .send()

interface MockSnapshot {
    value: string;
}

function createMockXState() {
    return {
        createMachine(config: FsmConfig) {
            return { config };
        },
        createActor(machine: { config: FsmConfig }) {
            const config = machine.config;
            let currentState = config.initial;
            let subscriber: ((snapshot: MockSnapshot) => void) | null = null;
            let running = false;

            return {
                subscribe(cb: (snapshot: MockSnapshot) => void) {
                    subscriber = cb;
                },
                start() {
                    running = true;
                    // XState fires the subscriber immediately with the initial state
                    // This is the exact behavior that caused Bug #1:
                    // if initial !== _currentState, it overwrites the restored state
                    subscriber?.({ value: currentState });
                },
                send(event: { type: string }) {
                    if (!running) return;
                    const stateConfig = config.states[currentState];
                    const target = stateConfig?.on?.[event.type];
                    if (target && config.states[target]) {
                        currentState = target;
                        subscriber?.({ value: currentState });
                    }
                },
                stop() {
                    running = false;
                    subscriber = null;
                },
            };
        },
    };
}

// ── Test Setup ───────────────────────────────────────────

// We mock the 'xstate' module to control the actor behavior
vi.mock('xstate', () => createMockXState());

// Must import AFTER vi.mock
const { StateMachineGate } = await import('../../src/fsm/StateMachineGate.js');

const checkoutConfig: FsmConfig = {
    id: 'checkout',
    initial: 'empty',
    states: {
        empty:     { on: { ADD_ITEM: 'has_items' } },
        has_items: { on: { CHECKOUT: 'payment', CLEAR: 'empty' } },
        payment:   { on: { PAY: 'confirmed', CANCEL: 'has_items' } },
        confirmed: { type: 'final' },
    },
};

const linearConfig: FsmConfig = {
    id: 'pipeline',
    initial: 'step1',
    states: {
        step1: { on: { NEXT: 'step2' } },
        step2: { on: { NEXT: 'step3' } },
        step3: { on: { NEXT: 'step4' } },
        step4: { on: { NEXT: 'done' } },
        done:  { type: 'final' },
    },
};

// ============================================================================
// REGRESSION: Bug #1 — restore() → transition() loses restored state
// ============================================================================

describe('Bug #1 Regression: restore() must survive init() with XState actor', () => {

    it('restore before first transition — init() must NOT overwrite _currentState', async () => {
        // This is the EXACT serverless/edge scenario:
        // 1. Request arrives
        // 2. restore({ state: 'has_items' }) sets _currentState = 'has_items'
        // 3. transition('CHECKOUT') triggers init() internally
        // 4. init() creates the XState actor
        //
        // BUG (old behavior): actor starts from config.initial ('empty'),
        //   subscription fires with 'empty', overwrites _currentState back to 'empty',
        //   transition('CHECKOUT') fails because 'empty' has no CHECKOUT transition.
        //
        // FIX (new behavior): init() creates machine with initial = _currentState ('has_items'),
        //   subscription fires with 'has_items' (no change), transition('CHECKOUT') succeeds.

        const gate = new StateMachineGate(checkoutConfig);

        // Simulate restore from external store (Redis, DynamoDB, etc.)
        gate.restore({ state: 'has_items', updatedAt: Date.now() });
        expect(gate.currentState).toBe('has_items');

        // First transition triggers init()
        const result = await gate.transition('CHECKOUT');

        // With the bug, currentState would be 'empty' (overwritten by actor start)
        // and CHECKOUT would fail (empty has no CHECKOUT transition)
        expect(result.changed).toBe(true);
        expect(result.previousState).toBe('has_items');
        expect(result.currentState).toBe('payment');
        expect(gate.currentState).toBe('payment');
    });

    it('restore to payment state then PAY — full serverless roundtrip', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: 'payment', updatedAt: Date.now() });

        const result = await gate.transition('PAY');

        expect(result.changed).toBe(true);
        expect(result.currentState).toBe('confirmed');
    });

    it('restore after init() — must reset actor and use restored state', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        // First: initialize normally (actor starts from 'empty')
        await gate.init();
        expect(gate.currentState).toBe('empty');

        // Transition to has_items via actor
        await gate.transition('ADD_ITEM');
        expect(gate.currentState).toBe('has_items');

        // Now restore to a different state (simulates new request in serverless)
        // BUG (old behavior): restore only sets _currentState but actor still
        //   thinks it's in 'has_items'. Next transition uses actor state, not restored.
        // FIX: restore() stops actor and marks uninitialized, so next transition
        //   re-creates actor from restored state.
        gate.restore({ state: 'payment', updatedAt: Date.now() });
        expect(gate.currentState).toBe('payment');

        // This transition should work from 'payment', not from 'has_items'
        const result = await gate.transition('PAY');
        expect(result.changed).toBe(true);
        expect(result.currentState).toBe('confirmed');
    });

    it('multiple restore cycles — each must reset actor correctly', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        // Cycle 1: restore to has_items, transition to payment
        gate.restore({ state: 'has_items', updatedAt: 1 });
        const r1 = await gate.transition('CHECKOUT');
        expect(r1.currentState).toBe('payment');

        // Cycle 2: restore to empty (different session), transition to has_items
        gate.restore({ state: 'empty', updatedAt: 2 });
        expect(gate.currentState).toBe('empty');
        const r2 = await gate.transition('ADD_ITEM');
        expect(r2.currentState).toBe('has_items');

        // Cycle 3: restore to payment, transition to confirmed
        gate.restore({ state: 'payment', updatedAt: 3 });
        const r3 = await gate.transition('PAY');
        expect(r3.currentState).toBe('confirmed');
    });

    it('restore-then-transition must produce correct tool visibility', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_add_item', ['empty', 'has_items'], 'ADD_ITEM');
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');

        // Restore to 'has_items'
        gate.restore({ state: 'has_items', updatedAt: Date.now() });

        // Tool visibility must reflect restored state, not initial
        expect(gate.isToolAllowed('cart_add_item')).toBe(true);
        expect(gate.isToolAllowed('cart_checkout')).toBe(true);
        expect(gate.isToolAllowed('cart_pay')).toBe(false);

        // Transition to payment
        await gate.transition('CHECKOUT');

        // Now payment tools should be visible
        expect(gate.isToolAllowed('cart_add_item')).toBe(false);
        expect(gate.isToolAllowed('cart_checkout')).toBe(false);
        expect(gate.isToolAllowed('cart_pay')).toBe(true);
    });

    it('restore to same state as initial should still work with XState', async () => {
        const gate = new StateMachineGate(checkoutConfig);

        // Even restoring to the initial state should produce a working actor
        gate.restore({ state: 'empty', updatedAt: Date.now() });
        const result = await gate.transition('ADD_ITEM');
        expect(result.changed).toBe(true);
        expect(result.currentState).toBe('has_items');
    });

    it('snapshot after restore-then-transition reflects correct state', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        gate.restore({ state: 'has_items', updatedAt: 100 });

        await gate.transition('CHECKOUT');
        const snap = gate.snapshot();
        expect(snap.state).toBe('payment');
        expect(snap.updatedAt).toBeGreaterThan(0);
    });

    it('transition callbacks fire correctly after restore with XState', async () => {
        const gate = new StateMachineGate(checkoutConfig);
        const cb = vi.fn();
        gate.onTransition(cb);

        gate.restore({ state: 'has_items', updatedAt: Date.now() });
        // restore itself should NOT fire callbacks
        expect(cb).not.toHaveBeenCalled();

        await gate.transition('CHECKOUT');
        // transition should fire callback
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('linear pipeline: restore to step3 then advance to done', async () => {
        const gate = new StateMachineGate(linearConfig);
        gate.restore({ state: 'step3', updatedAt: Date.now() });

        await gate.transition('NEXT'); // step3 → step4
        expect(gate.currentState).toBe('step4');

        await gate.transition('NEXT'); // step4 → done
        expect(gate.currentState).toBe('done');
    });

    it('concurrent serverless simulation: two sessions, shared gate', async () => {
        // This simulates the serverless pattern where a single StateMachineGate
        // is reused across requests for different sessions
        const gate = new StateMachineGate(checkoutConfig);
        gate.bindTool('cart_checkout', ['has_items'], 'CHECKOUT');
        gate.bindTool('cart_pay', ['payment'], 'PAY');

        // Request 1: Session A at 'has_items'
        gate.restore({ state: 'has_items', updatedAt: 1 });
        expect(gate.isToolAllowed('cart_checkout')).toBe(true);
        await gate.transition('CHECKOUT');
        const snapA = gate.snapshot();
        expect(snapA.state).toBe('payment');

        // Request 2: Session B at 'payment'
        gate.restore({ state: 'payment', updatedAt: 2 });
        expect(gate.isToolAllowed('cart_pay')).toBe(true);
        await gate.transition('PAY');
        const snapB = gate.snapshot();
        expect(snapB.state).toBe('confirmed');

        // Verify sessions diverged correctly
        expect(snapA.state).toBe('payment');
        expect(snapB.state).toBe('confirmed');
    });
});
