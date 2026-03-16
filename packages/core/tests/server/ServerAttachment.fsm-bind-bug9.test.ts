/**
 * Bug #9 — autoBindFsmFromBuilders naming mismatch for single-action default tools
 *
 * PROBLEM:
 * In flat exposition mode, single-action builders with action key 'default' get
 * a bare tool name (no _default suffix) in ExpositionCompiler.compileFlat():
 *
 *   const flatName = (isSingleAction && action.key === 'default')
 *       ? toolName           // ← bare name: "check_balance"
 *       : `${toolName}${separator}${action.key}`;
 *
 * But autoBindFsmFromBuilders() ALWAYS uses the suffixed name:
 *
 *   const flatName = `${toolName}${separator}${action.key}`;
 *   // → "check_balance_default"   ← WRONG
 *
 * IMPACT:
 * The FSM gate binds "check_balance_default" but the tool is exposed as
 * "check_balance". isToolAllowed("check_balance") finds no binding → returns
 * true (ungated). The FSM state gate is SILENTLY BYPASSED for all standalone
 * tools using f.query() / f.mutation() / f.action() in flat mode.
 *
 * This is a security/correctness issue: .bindState() has no effect on
 * single-action tools, which are the MOST COMMON tool type in Vurb.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Minimal mocks to demonstrate the naming mismatch ─────

interface MockAction {
    key: string;
}

interface MockBinding {
    states: string[];
    transition?: string;
}

/**
 * Simulate the ExpositionCompiler's flat name logic (correct).
 */
function computeFlatName(toolName: string, actions: MockAction[], action: MockAction, separator: string): string {
    const isSingleAction = actions.length === 1;
    return (isSingleAction && action.key === 'default')
        ? toolName
        : `${toolName}${separator}${action.key}`;
}

/**
 * Simulate the CURRENT autoBindFsmFromBuilders logic (BUGGY).
 */
function computeFsmBindNameBuggy(toolName: string, action: MockAction, separator: string): string {
    return `${toolName}${separator}${action.key}`;
}

/**
 * Simulate the FIXED autoBindFsmFromBuilders logic.
 */
function computeFsmBindNameFixed(toolName: string, actions: MockAction[], action: MockAction, separator: string): string {
    const isSingleAction = actions.length === 1;
    return (isSingleAction && action.key === 'default')
        ? toolName
        : `${toolName}${separator}${action.key}`;
}

describe('Bug #9: autoBindFsmFromBuilders flat name mismatch', () => {
    it('PROVES THE BUG: single-action default tool name diverges between exposition and FSM binding', () => {
        const toolName = 'check_balance';
        const actions: MockAction[] = [{ key: 'default' }];
        const separator = '_';

        // ExpositionCompiler produces this flat name for the tool:
        const exposedName = computeFlatName(toolName, actions, actions[0]!, separator);

        // autoBindFsmFromBuilders registers this name in the FSM:
        const fsmBoundName = computeFsmBindNameBuggy(toolName, actions[0]!, separator);

        // They SHOULD be equal, but they're NOT:
        expect(exposedName).toBe('check_balance');         // correct: bare name
        expect(fsmBoundName).toBe('check_balance_default'); // buggy: suffixed name

        // THE BUG: names don't match
        expect(exposedName).not.toBe(fsmBoundName);
    });

    it('PROVES THE FIX: fixed logic produces matching names', () => {
        const toolName = 'check_balance';
        const actions: MockAction[] = [{ key: 'default' }];
        const separator = '_';

        const exposedName = computeFlatName(toolName, actions, actions[0]!, separator);
        const fsmBoundName = computeFsmBindNameFixed(toolName, actions, actions[0]!, separator);

        // After fix, both should be the bare tool name:
        expect(exposedName).toBe(fsmBoundName);
        expect(exposedName).toBe('check_balance');
    });

    it('multi-action builders are NOT affected (names already match)', () => {
        const toolName = 'projects';
        const actions: MockAction[] = [{ key: 'list' }, { key: 'create' }];
        const separator = '_';

        for (const action of actions) {
            const exposedName = computeFlatName(toolName, actions, action, separator);
            const fsmBoundName = computeFsmBindNameBuggy(toolName, action, separator);

            // Multi-action names match even with the buggy code:
            expect(exposedName).toBe(fsmBoundName);
        }
    });

    it('single-action with NON-default key is NOT affected', () => {
        const toolName = 'projects';
        const actions: MockAction[] = [{ key: 'list' }];
        const separator = '_';

        const exposedName = computeFlatName(toolName, actions, actions[0]!, separator);
        const fsmBoundName = computeFsmBindNameBuggy(toolName, actions[0]!, separator);

        // Named single-action: both produce "projects_list"
        expect(exposedName).toBe(fsmBoundName);
        expect(exposedName).toBe('projects_list');
    });

    it('SECURITY IMPACT: FSM gate is silently bypassed for default single-action tools', () => {
        // Simulate the FSM gate behavior
        const bindings = new Map<string, { allowedStates: Set<string> }>();

        function bindTool(name: string, states: string[]) {
            bindings.set(name, { allowedStates: new Set(states) });
        }

        function isToolAllowed(name: string, currentState: string): boolean {
            const binding = bindings.get(name);
            if (!binding) return true; // Ungated — always visible
            return binding.allowedStates.has(currentState);
        }

        // Developer binds check_balance to only be visible in 'authenticated' state
        const toolName = 'check_balance';
        const actions: MockAction[] = [{ key: 'default' }];

        // BUGGY: FSM binds "check_balance_default"
        const fsmName = computeFsmBindNameBuggy(toolName, actions[0]!, '_');
        bindTool(fsmName, ['authenticated']);

        // But the tool is exposed as "check_balance"
        const exposedName = computeFlatName(toolName, actions, actions[0]!, '_');

        // FSM check on the EXPOSED name — no binding found → ALWAYS ALLOWED
        expect(isToolAllowed(exposedName, 'unauthenticated')).toBe(true); // SHOULD be false!
        expect(isToolAllowed(exposedName, 'authenticated')).toBe(true);   // correct

        // The FSM gate has NO EFFECT — the tool is accessible in ALL states
    });
});
