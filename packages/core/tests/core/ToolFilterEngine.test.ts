import { describe, it, expect } from 'vitest';
import { filterTools } from '../../src/core/registry/ToolFilterEngine.js';
import { GroupedToolBuilder, success } from '../../src/core/index.js';
import type { ToolResponse } from '../../src/core/index.js';

const dummyHandler = async (_ctx: unknown, _args: Record<string, unknown>): Promise<ToolResponse> =>
    success('ok');

function createBuilder(name: string, tags: string[] = []) {
    const builder = new GroupedToolBuilder(name)
        .action({ name: 'list', handler: dummyHandler });
    if (tags.length > 0) builder.tags(...tags);
    return builder;
}

describe('ToolFilterEngine — filterTools', () => {
    const builders = [
        createBuilder('auth', ['public']),
        createBuilder('task', ['authenticated', 'project-context']),
        createBuilder('admin', ['authenticated', 'admin']),
    ];

    // ── Defensive: empty / undefined filter ─────────────

    it('should return all tools when filter is an empty object', () => {
        const tools = filterTools(builders, {});
        expect(tools).toHaveLength(3);
    });

    it('should return all tools when filter is undefined (default param)', () => {
        const tools = filterTools(builders);
        expect(tools).toHaveLength(3);
    });

    // ── AND logic (tags) ────────────────────────────────

    it('should filter by required tags (AND logic)', () => {
        const tools = filterTools(builders, { tags: ['authenticated'] });
        const names = tools.map(t => t.name);
        expect(names).toEqual(['task', 'admin']);
    });

    it('should filter by multiple required tags (AND)', () => {
        const tools = filterTools(builders, { tags: ['authenticated', 'admin'] });
        const names = tools.map(t => t.name);
        expect(names).toEqual(['admin']);
    });

    it('should return empty when required tag matches nothing', () => {
        const tools = filterTools(builders, { tags: ['nonexistent'] });
        expect(tools).toHaveLength(0);
    });

    // ── OR logic (anyTag) ───────────────────────────────

    it('should filter by anyTag (OR logic)', () => {
        const tools = filterTools(builders, { anyTag: ['public', 'admin'] });
        const names = tools.map(t => t.name);
        expect(names).toContain('auth');
        expect(names).toContain('admin');
        expect(names).not.toContain('task');
    });

    it('should return empty when anyTag matches nothing', () => {
        const tools = filterTools(builders, { anyTag: ['nonexistent'] });
        expect(tools).toHaveLength(0);
    });

    // ── Exclude logic ───────────────────────────────────

    it('should exclude tools by tag', () => {
        const tools = filterTools(builders, { exclude: ['admin'] });
        const names = tools.map(t => t.name);
        expect(names).toContain('auth');
        expect(names).toContain('task');
        expect(names).not.toContain('admin');
    });

    // ── Combined filters ────────────────────────────────

    it('should combine tags + exclude', () => {
        const tools = filterTools(builders, { tags: ['authenticated'], exclude: ['admin'] });
        const names = tools.map(t => t.name);
        expect(names).toEqual(['task']);
    });

    it('should combine anyTag + exclude', () => {
        const tools = filterTools(builders, { anyTag: ['public', 'authenticated'], exclude: ['admin'] });
        const names = tools.map(t => t.name);
        expect(names).toContain('auth');
        expect(names).toContain('task');
        expect(names).not.toContain('admin');
    });

    // ── Edge: builders with no tags ─────────────────────

    it('should include untagged builders when no filter criteria are set', () => {
        const untagged = [createBuilder('plain')];
        const tools = filterTools(untagged, {});
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('plain');
    });

    it('should exclude untagged builders from anyTag filter', () => {
        const mixed = [createBuilder('plain'), createBuilder('tagged', ['core'])];
        const tools = filterTools(mixed, { anyTag: ['core'] });
        const names = tools.map(t => t.name);
        expect(names).toEqual(['tagged']);
    });
});
