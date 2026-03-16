/**
 * Bug #13 Regression: FluentToolBuilder._addParam() prototype chain check
 *
 * BUG: `_addParam()` used `name in this._withParams` to check for duplicates.
 * The `in` operator walks the entire prototype chain, so names like
 * `toString`, `constructor`, `valueOf`, `hasOwnProperty` etc. — which exist
 * on Object.prototype — would falsely throw "Duplicate parameter name".
 *
 * FIX: Replaced `in` with `Object.prototype.hasOwnProperty.call()` to only
 * check own properties.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { initVurb } from '../../src/index.js';

describe('Bug #13 Regression: _addParam prototype chain', () => {
    const f = initVurb();

    it('should accept parameter named "constructor"', () => {
        expect(() => {
            f.query('test.constructor_param')
                .describe('Test tool')
                .withString('constructor', 'Constructor name')
                .handle(async () => 'ok');
        }).not.toThrow();
    });

    it('should accept parameter named "toString"', () => {
        expect(() => {
            f.query('test.toString_param')
                .describe('Test tool')
                .withString('toString', 'String representation')
                .handle(async () => 'ok');
        }).not.toThrow();
    });

    it('should accept parameter named "valueOf"', () => {
        expect(() => {
            f.query('test.valueOf_param')
                .describe('Test tool')
                .withString('valueOf', 'Value of something')
                .handle(async () => 'ok');
        }).not.toThrow();
    });

    it('should accept parameter named "hasOwnProperty"', () => {
        expect(() => {
            f.query('test.hasOwnProperty_param')
                .describe('Test tool')
                .withString('hasOwnProperty', 'Has own property flag')
                .handle(async () => 'ok');
        }).not.toThrow();
    });

    it('should still reject actual duplicate parameters', () => {
        expect(() => {
            f.query('test.dup_param')
                .describe('Test tool')
                .withString('name', 'First name')
                .withString('name', 'Duplicate name');
        }).toThrow(/Duplicate parameter name/);
    });
});
