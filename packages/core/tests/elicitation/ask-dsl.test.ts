/**
 * ask DSL — Field Descriptors & JSON Schema Compilation
 *
 * Tests the `ask.*` field factory methods and their `_compile()` output.
 * Covers:
 * - All field types (string, number, boolean, enum)
 * - Chaining (.default(), .describe(), .min(), .max())
 * - JSON Schema output correctness
 * - compileAskFields() for multi-field forms
 * - Edge cases: empty fields, enum with single value, extreme ranges
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    AskStringField,
    AskNumberField,
    AskBooleanField,
    AskEnumField,
} from '../../src/core/elicitation/types.js';
import { compileAskFields } from '../../src/core/elicitation/ask.js';
import { ask } from '../../src/core/elicitation/ask.js';

// ── ask.string() ─────────────────────────────────────────

describe('ask.string()', () => {
    it('creates a string field with no description', () => {
        const field = ask.string();
        expect(field).toBeInstanceOf(AskStringField);
        expect(field._compile()).toEqual({ type: 'string' });
    });

    it('creates a string field with description', () => {
        const field = ask.string('Your full name');
        expect(field._compile()).toEqual({
            type: 'string',
            description: 'Your full name',
        });
    });

    it('supports .default() chaining', () => {
        const field = ask.string('Name').default('Alice');
        expect(field._compile()).toEqual({
            type: 'string',
            description: 'Name',
            default: 'Alice',
        });
    });

    it('supports .describe() override', () => {
        const field = ask.string('initial').describe('overridden');
        expect(field._compile()).toEqual({
            type: 'string',
            description: 'overridden',
        });
    });

    it('default empty string is a valid default', () => {
        const field = ask.string().default('');
        expect(field._compile()).toEqual({
            type: 'string',
            default: '',
        });
    });
});

// ── ask.number() ─────────────────────────────────────────

describe('ask.number()', () => {
    it('creates a number field with no constraints', () => {
        const field = ask.number();
        expect(field).toBeInstanceOf(AskNumberField);
        expect(field._compile()).toEqual({ type: 'number' });
    });

    it('accepts description', () => {
        const field = ask.number('Team size');
        expect(field._compile()).toEqual({
            type: 'number',
            description: 'Team size',
        });
    });

    it('supports .min() constraint', () => {
        const field = ask.number().min(1);
        expect(field._compile()).toEqual({
            type: 'number',
            minimum: 1,
        });
    });

    it('supports .max() constraint', () => {
        const field = ask.number().max(100);
        expect(field._compile()).toEqual({
            type: 'number',
            maximum: 100,
        });
    });

    it('supports .min().max() chaining', () => {
        const field = ask.number('Age').min(18).max(120);
        expect(field._compile()).toEqual({
            type: 'number',
            description: 'Age',
            minimum: 18,
            maximum: 120,
        });
    });

    it('supports .default() with constraints', () => {
        const field = ask.number().min(0).max(10).default(5);
        expect(field._compile()).toEqual({
            type: 'number',
            minimum: 0,
            maximum: 10,
            default: 5,
        });
    });

    it('handles min(0) correctly (falsy but valid)', () => {
        const field = ask.number().min(0);
        expect(field._compile().minimum).toBe(0);
    });

    it('handles max(0) correctly (falsy but valid)', () => {
        const field = ask.number().max(0);
        expect(field._compile().maximum).toBe(0);
    });

    it('handles negative min/max ranges', () => {
        const field = ask.number().min(-100).max(-1);
        expect(field._compile()).toEqual({
            type: 'number',
            minimum: -100,
            maximum: -1,
        });
    });
});

// ── ask.boolean() ────────────────────────────────────────

describe('ask.boolean()', () => {
    it('creates a boolean field', () => {
        const field = ask.boolean();
        expect(field).toBeInstanceOf(AskBooleanField);
        expect(field._compile()).toEqual({ type: 'boolean' });
    });

    it('accepts description', () => {
        const field = ask.boolean('Accept terms');
        expect(field._compile()).toEqual({
            type: 'boolean',
            description: 'Accept terms',
        });
    });

    it('supports .default(true)', () => {
        const field = ask.boolean('Subscribe').default(true);
        expect(field._compile()).toEqual({
            type: 'boolean',
            description: 'Subscribe',
            default: true,
        });
    });

    it('supports .default(false)', () => {
        const field = ask.boolean().default(false);
        expect(field._compile()).toEqual({
            type: 'boolean',
            default: false,
        });
    });
});

// ── ask.enum() ───────────────────────────────────────────

describe('ask.enum()', () => {
    it('creates an enum field from string tuple', () => {
        const field = ask.enum(['a', 'b', 'c'] as const);
        expect(field).toBeInstanceOf(AskEnumField);
        expect(field._compile()).toEqual({
            type: 'string',
            enum: ['a', 'b', 'c'],
        });
    });

    it('accepts description', () => {
        const field = ask.enum(['free', 'pro'] as const, 'Plan');
        expect(field._compile()).toEqual({
            type: 'string',
            enum: ['free', 'pro'],
            description: 'Plan',
        });
    });

    it('supports .default()', () => {
        const field = ask.enum(['us', 'eu'] as const, 'Region').default('eu');
        expect(field._compile()).toEqual({
            type: 'string',
            enum: ['us', 'eu'],
            description: 'Region',
            default: 'eu',
        });
    });

    it('supports single-value enum', () => {
        const field = ask.enum(['only'] as const);
        expect(field._compile()).toEqual({
            type: 'string',
            enum: ['only'],
        });
    });

    it('supports .describe() override', () => {
        const field = ask.enum(['a', 'b'] as const, 'initial').describe('overridden');
        expect(field._compile()).toEqual({
            type: 'string',
            enum: ['a', 'b'],
            description: 'overridden',
        });
    });
});

// ── compileAskFields() ──────────────────────────────────

describe('compileAskFields()', () => {
    it('compiles an empty field set', () => {
        const schema = compileAskFields({});
        expect(schema).toEqual({
            type: 'object',
            properties: {},
            required: [],
        });
    });

    it('compiles a single field', () => {
        const schema = compileAskFields({
            name: ask.string('Name'),
        });
        expect(schema).toEqual({
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name' },
            },
            required: ['name'],
        });
    });

    it('compiles multiple fields of different types', () => {
        const schema = compileAskFields({
            name: ask.string('Name'),
            age: ask.number('Age').min(0).max(150),
            active: ask.boolean('Active'),
            tier: ask.enum(['free', 'pro'] as const, 'Tier'),
        });

        expect(schema.type).toBe('object');
        expect(schema.required).toEqual(['name', 'age', 'active', 'tier']);
        expect(Object.keys(schema.properties)).toHaveLength(4);
        expect(schema.properties.name.type).toBe('string');
        expect(schema.properties.age.type).toBe('number');
        expect(schema.properties.age.minimum).toBe(0);
        expect(schema.properties.age.maximum).toBe(150);
        expect(schema.properties.active.type).toBe('boolean');
        expect(schema.properties.tier.type).toBe('string');
        expect(schema.properties.tier.enum).toEqual(['free', 'pro']);
    });

    it('marks all fields as required', () => {
        const schema = compileAskFields({
            a: ask.string(),
            b: ask.number(),
            c: ask.boolean(),
        });
        expect(schema.required).toEqual(['a', 'b', 'c']);
    });
});
