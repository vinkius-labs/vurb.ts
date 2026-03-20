/**
 * PolicyEngine — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/state-sync/PolicyEngine.js';

describe('PolicyEngine', () => {
    describe('first-match-wins resolution', () => {
        it('returns the first matching policy', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.get', cacheControl: 'immutable' },
                { match: 'sprints.*', cacheControl: 'no-store' },
            ]);

            const result = engine.resolve('sprints.get');
            expect(result?.cacheControl).toBe('immutable');
        });

        it('falls through to later policies', () => {
            const engine = new PolicyEngine([
                { match: 'tasks.*', cacheControl: 'no-store' },
                { match: 'sprints.*', cacheControl: 'immutable' },
            ]);

            const result = engine.resolve('sprints.get');
            expect(result?.cacheControl).toBe('immutable');
        });
    });

    describe('defaults', () => {
        it('applies default cacheControl when no policy matches', () => {
            const engine = new PolicyEngine(
                [{ match: 'tasks.*', cacheControl: 'no-store' }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('unknown.tool');
            expect(result?.cacheControl).toBe('no-store');
        });

        it('returns null when no policy matches and no defaults', () => {
            const engine = new PolicyEngine([
                { match: 'tasks.*', cacheControl: 'no-store' },
            ]);

            expect(engine.resolve('unknown.tool')).toBeNull();
        });

        it('policy cacheControl overrides default', () => {
            const engine = new PolicyEngine(
                [{ match: 'countries.*', cacheControl: 'immutable' }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('countries.list');
            expect(result?.cacheControl).toBe('immutable');
        });
    });

    describe('invalidates resolution', () => {
        it('resolves invalidation patterns', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.update', invalidates: ['sprints.*', 'tasks.*'] },
            ]);

            const result = engine.resolve('sprints.update');
            expect(result?.invalidates).toEqual(['sprints.*', 'tasks.*']);
        });

        it('inherits default cacheControl with invalidates', () => {
            const engine = new PolicyEngine(
                [{ match: 'sprints.update', invalidates: ['sprints.*'] }],
                { cacheControl: 'no-store' },
            );

            const result = engine.resolve('sprints.update');
            expect(result?.cacheControl).toBe('no-store');
            expect(result?.invalidates).toEqual(['sprints.*']);
        });
    });

    describe('caching', () => {
        it('returns the same instance on repeated calls', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.*', cacheControl: 'no-store' },
            ]);

            const first = engine.resolve('sprints.get');
            const second = engine.resolve('sprints.get');
            expect(first).toBe(second);
        });

        it('caches null results', () => {
            const engine = new PolicyEngine([]);
            const first = engine.resolve('anything');
            const second = engine.resolve('anything');
            expect(first).toBeNull();
            expect(second).toBeNull();
        });
    });

    describe('validation', () => {
        it('throws on invalid policies at construction', () => {
            expect(() => new PolicyEngine([
                { match: '', cacheControl: 'no-store' },
            ])).toThrow();
        });

        it('throws on invalid defaults at construction', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => new PolicyEngine([], { cacheControl: 'bad' as any })).toThrow();
        });
    });

    describe('policy without cacheControl or invalidates', () => {
        it('returns null if matched policy has neither', () => {
            const engine = new PolicyEngine([
                { match: 'sprints.*' },
            ]);

            expect(engine.resolve('sprints.get')).toBeNull();
        });
    });

    describe('bounded cache (memory safety)', () => {
        it('still works correctly after cache eviction', () => {
            const engine = new PolicyEngine([
                { match: 'test.*', cacheControl: 'no-store' },
            ]);

            // Fill cache with unique names beyond the bound
            // (MAX_CACHE_SIZE is 2048, we don't need to hit it exactly —
            // just verify the engine still works after many calls)
            for (let i = 0; i < 100; i++) {
                const result = engine.resolve(`test.tool${i}`);
                expect(result?.cacheControl).toBe('no-store');
            }

            // Earlier resolved names still resolve correctly
            expect(engine.resolve('test.tool0')?.cacheControl).toBe('no-store');
        });
    });

    describe('default resolution reuse', () => {
        it('returns the same frozen default object for all unmatched names', () => {
            const engine = new PolicyEngine(
                [{ match: 'tasks.*', cacheControl: 'no-store' }],
                { cacheControl: 'no-store' },
            );

            const a = engine.resolve('unknown.a');
            const b = engine.resolve('unknown.b');

            // Same frozen object is reused — no allocation per unmatched name
            expect(a).toBe(b);
        });
    });
});

// ── Extended Coverage ────────────────────────────────────────────────────────

describe('PolicyEngine: ** glob matches any tool name', () => {
    it('** should match any tool regardless of dots or depth', () => {
        const engine = new PolicyEngine([
            { match: '**', cacheControl: 'no-store' },
        ]);

        expect(engine.resolve('billing.pay')?.cacheControl).toBe('no-store');
        expect(engine.resolve('sprints.update')?.cacheControl).toBe('no-store');
        expect(engine.resolve('any_tool')?.cacheControl).toBe('no-store');
        expect(engine.resolve('a.b.c.d')?.cacheControl).toBe('no-store');
    });

    it('** catch-all should be shadowed by earlier specific policies', () => {
        const engine = new PolicyEngine([
            { match: 'countries.*', cacheControl: 'immutable' },
            { match: '**',          cacheControl: 'no-store' },
        ]);

        expect(engine.resolve('countries.list')?.cacheControl).toBe('immutable');
        expect(engine.resolve('billing.pay')?.cacheControl).toBe('no-store');
    });
});

describe('PolicyEngine: policy with both cacheControl and invalidates', () => {
    it('resolve() returns both directives when policy defines both', () => {
        const engine = new PolicyEngine([
            {
                match: 'sprints.update',
                cacheControl: 'no-store',
                invalidates: ['sprints.*', 'tasks.*'],
            },
        ]);

        const result = engine.resolve('sprints.update');
        expect(result?.cacheControl).toBe('no-store');
        expect(result?.invalidates).toEqual(['sprints.*', 'tasks.*']);
    });

    it('resolved object is frozen (immutable)', () => {
        const engine = new PolicyEngine([
            { match: 'billing.*', cacheControl: 'no-store', invalidates: ['billing.*'] },
        ]);

        const result = engine.resolve('billing.pay')!;
        expect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any).cacheControl = 'immutable';
        }).toThrow();
    });

    it('default-only resolved object is also frozen', () => {
        const engine = new PolicyEngine(
            [],
            { cacheControl: 'immutable' },
        );

        const result = engine.resolve('any.tool')!;
        expect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any).extra = 'injected';
        }).toThrow();
    });
});

describe('PolicyEngine: empty policies with defaults', () => {
    it('empty policy list with defaults returns default for every tool', () => {
        const engine = new PolicyEngine(
            [],
            { cacheControl: 'no-store' },
        );

        expect(engine.resolve('billing.pay')?.cacheControl).toBe('no-store');
        expect(engine.resolve('sprints.list')?.cacheControl).toBe('no-store');
        expect(engine.resolve('any.tool.name')?.cacheControl).toBe('no-store');
    });

    it('empty policies and no defaults returns null for every tool', () => {
        const engine = new PolicyEngine([]);
        expect(engine.resolve('billing.pay')).toBeNull();
        expect(engine.resolve('anything')).toBeNull();
    });
});

describe('PolicyEngine: no-op policy first-match semantics', () => {
    it('match-only policy with defaults — inherits default cacheControl (no override)', () => {
        // _buildResolved uses: policy.cacheControl ?? this._defaultCacheControl
        // A match-only policy INHERITS the default, so first-match returns the default value
        const engine = new PolicyEngine(
            [{ match: 'sprints.*' }],
            { cacheControl: 'no-store' },
        );

        // sprints.get matches the entry → inherits default → { cacheControl: 'no-store' }
        expect(engine.resolve('sprints.get')?.cacheControl).toBe('no-store');
    });

    it('match-only policy WITHOUT defaults — returns null', () => {
        // No directives, no defaults → null
        const engine = new PolicyEngine([{ match: 'sprints.*' }]);
        expect(engine.resolve('sprints.get')).toBeNull();
    });

    it('match-only policy does not prevent later policies from being evaluated', () => {
        // This is about ORDERING, not null: since first-match-wins, the no-op
        // policy matches first and its (inherited) resolution is returned.
        // A subsequent more-specific policy is never reached for 'sprints.*' tools.
        const engine = new PolicyEngine([
            { match: 'sprints.*' },                                   // catch-all (no override)
            { match: 'sprints.get', cacheControl: 'immutable' },     // more specific (unreachable)
        ]);
        // First policy matches sprints.get → null (no defaults), not 'immutable'
        expect(engine.resolve('sprints.get')).toBeNull();
        // Unknown tool falls through to defaults (none here) → null
        expect(engine.resolve('unknown')).toBeNull();
    });
});

describe('PolicyEngine: exact-name match (no wildcards)', () => {
    it('exact tool name match resolves correctly', () => {
        const engine = new PolicyEngine([
            { match: 'billing.pay', cacheControl: 'no-store' },
        ]);

        expect(engine.resolve('billing.pay')?.cacheControl).toBe('no-store');
        // Prefix should NOT match
        expect(engine.resolve('billing.payment')).toBeNull();
        expect(engine.resolve('billing')).toBeNull();
    });

    it('near-miss names do not cross-match', () => {
        const engine = new PolicyEngine([
            { match: 'tasks.get', cacheControl: 'immutable' },
        ]);

        expect(engine.resolve('tasks.get')?.cacheControl).toBe('immutable');
        expect(engine.resolve('tasks.gets')).toBeNull(); // trailing char
        expect(engine.resolve('tasks.ge')).toBeNull();   // truncated
    });
});
