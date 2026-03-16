/**
 * Model.toApi() — Unit Tests
 *
 * Tests the `toApi()` alias resolution function on compiled Models.
 * Covers:
 *   - Basic alias rename (agent key → API key)
 *   - Non-aliased fields pass through unchanged
 *   - Undefined values are stripped
 *   - Multiple aliases in same model
 *   - Empty input
 *   - Falsy values preserved (0, false, "")
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { defineModel } from '../../src/model/defineModel.js';

// ============================================================================
// Test Models
// ============================================================================

const ProposalModel = defineModel('Proposal', m => {
    m.casts({
        title:   m.string('Proposal title'),
        content: m.text('Body content').alias('description'),
        status:  m.enum('Status', ['draft', 'sent', 'accepted']),
    });
});

const TaskModel = defineModel('Task', m => {
    m.casts({
        title:       m.string('Task title'),
        description: m.text('Task description').alias('body'),
        due_date:    m.date('Due date').alias('deadline'),
        priority:    m.number('Priority level'),
    });
});

const NoAliasModel = defineModel('Simple', m => {
    m.casts({
        name:  m.string('Name'),
        email: m.string('Email'),
    });
});

// ============================================================================
// Basic Alias Resolution
// ============================================================================

describe('Model.toApi() — Alias Resolution', () => {
    it('should rename aliased field to API key', () => {
        const result = ProposalModel.toApi({
            title: 'New Deal',
            content: 'Proposal body text',
        });

        expect(result).toEqual({
            title: 'New Deal',
            description: 'Proposal body text',
        });
    });

    it('should rename multiple aliased fields', () => {
        const result = TaskModel.toApi({
            title: 'Fix bug',
            description: 'Fix the login issue',
            due_date: '2026-01-15',
            priority: 1,
        });

        expect(result).toEqual({
            title: 'Fix bug',
            body: 'Fix the login issue',
            deadline: '2026-01-15',
            priority: 1,
        });
    });
});

// ============================================================================
// Pass-Through Behavior
// ============================================================================

describe('Model.toApi() — Pass-Through', () => {
    it('should pass non-aliased fields unchanged', () => {
        const result = ProposalModel.toApi({
            title: 'X',
            status: 'draft',
        });

        expect(result).toEqual({
            title: 'X',
            status: 'draft',
        });
    });

    it('should work with a model that has no aliases', () => {
        const result = NoAliasModel.toApi({
            name: 'Alice',
            email: 'alice@example.com',
        });

        expect(result).toEqual({
            name: 'Alice',
            email: 'alice@example.com',
        });
    });

    it('should pass through unknown fields not in the model', () => {
        const result = ProposalModel.toApi({
            title: 'Y',
            extra_field: 'bonus',
        });

        // Unknown fields are not aliased, just passed through
        expect(result).toEqual({
            title: 'Y',
            extra_field: 'bonus',
        });
    });
});

// ============================================================================
// Undefined Stripping
// ============================================================================

describe('Model.toApi() — Undefined Stripping', () => {
    it('should strip undefined values', () => {
        const result = ProposalModel.toApi({
            title: 'Z',
            content: undefined,
            status: 'draft',
        });

        expect(result).toEqual({
            title: 'Z',
            status: 'draft',
        });
        expect('description' in result).toBe(false);
        expect('content' in result).toBe(false);
    });

    it('should strip undefined aliased fields', () => {
        const result = TaskModel.toApi({
            title: 'Task',
            description: undefined,
            due_date: undefined,
        });

        expect(result).toEqual({
            title: 'Task',
        });
    });
});

// ============================================================================
// Falsy Value Preservation
// ============================================================================

describe('Model.toApi() — Falsy Values', () => {
    it('should preserve empty string', () => {
        const result = ProposalModel.toApi({
            title: '',
            content: '',
        });

        expect(result).toEqual({
            title: '',
            description: '',
        });
    });

    it('should preserve zero', () => {
        const result = TaskModel.toApi({
            priority: 0,
        });

        expect(result).toEqual({
            priority: 0,
        });
    });

    it('should preserve false', () => {
        // Use a model with a boolean field
        const FlagModel = defineModel('Flag', m => {
            m.casts({
                enabled: m.boolean('Is enabled').alias('active'),
            });
        });

        const result = FlagModel.toApi({ enabled: false });

        expect(result).toEqual({ active: false });
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Model.toApi() — Edge Cases', () => {
    it('should handle empty input', () => {
        const result = ProposalModel.toApi({});
        expect(result).toEqual({});
    });

    it('should handle input with only undefined values', () => {
        const result = ProposalModel.toApi({
            title: undefined,
            content: undefined,
        });
        expect(result).toEqual({});
    });
});
