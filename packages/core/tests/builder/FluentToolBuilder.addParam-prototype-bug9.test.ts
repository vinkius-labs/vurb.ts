/**
 * Bug #9 — FluentToolBuilder._addParam() false-positive duplicate
 *         on names inherited from Object.prototype
 *
 * Root cause:
 *   `_addParam` uses `name in this._withParams` to detect duplicates.
 *   The `in` operator walks the prototype chain, so names like
 *   "toString", "constructor", "valueOf", "hasOwnProperty" match
 *   Object.prototype methods, causing a spurious "Duplicate parameter"
 *   error even though no parameter with that name was registered.
 *
 * Expected: `.withString('constructor', '...')` succeeds.
 * Actual:   throws "Duplicate parameter name 'constructor'".
 */
import { describe, it, expect } from 'vitest';
import { initVurb } from '../../src/index.js';

const f = initVurb();

describe('Bug #9 — _addParam prototype pollution false positive', () => {
    const prototypeNames = [
        'toString',
        'constructor',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
    ];

    for (const name of prototypeNames) {
        it(`should allow parameter named "${name}"`, () => {
            // This should NOT throw — the name is not actually a duplicate
            expect(() => {
                f.query(`test_${name}.do`)
                    .withString(name, `Param named ${name}`)
                    .handle(async () => 'ok');
            }).not.toThrow();
        });
    }

    it('should still reject actual duplicates', () => {
        expect(() => {
            f.query('dup_test.do')
                .withString('foo', 'first')
                .withString('foo', 'second')  // real duplicate
                .handle(async () => 'ok');
        }).toThrow(/Duplicate parameter name "foo"/);
    });
});
