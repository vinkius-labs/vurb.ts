/**
 * Tests for createSkillTools — Single Grouped MCP Tool Factory.
 */

import { describe, it, expect } from 'vitest';
import { createSkillTools } from '../src/tools/createSkillTools.js';
import { SkillRegistry } from '../src/registry/SkillRegistry.js';
import { type Skill } from '../src/domain/Skill.js';

// ── Stub defineTool ──────────────────────────────────────

interface StubAction {
    readOnly?: boolean;
    params: Record<string, unknown>;
    description?: string;
    handler: (ctx: unknown, args: Record<string, unknown>) => unknown | Promise<unknown>;
}

interface StubToolDef {
    name: string;
    description: string;
    actions: Record<string, StubAction>;
}

function createStubDefineTool() {
    const tools: StubToolDef[] = [];

    const defineTool = (name: string, config: { description?: string; actions: Record<string, StubAction> }) => {
        const tool: StubToolDef = {
            name,
            description: config.description ?? '',
            actions: config.actions,
        };
        tools.push(tool);
        return {
            getName() { return tool.name; },
            buildToolDefinition() { return tool; },
        };
    };

    return { defineTool, tools };
}

// ── Test Helpers ─────────────────────────────────────────

function createSkill(overrides: Partial<Skill> = {}): Skill {
    return {
        id: 'test-skill',
        name: 'test-skill',
        description: 'A test skill for unit testing.',
        instructions: '# Steps\n1. Do something.',
        path: '/srv/skills/test-skill',
        frontmatter: {
            name: 'test-skill',
            description: 'A test skill for unit testing.',
        },
        files: ['scripts/run.sh'],
        ...overrides,
    };
}

function registryWith(...skills: Skill[]): SkillRegistry {
    const registry = new SkillRegistry({ validate: false });
    if (skills.length > 0) {
        registry.registerAll(skills);
    }
    return registry;
}

// ── Tests ────────────────────────────────────────────────

describe('createSkillTools', () => {
    describe('tool creation', () => {
        it('creates a single grouped tool', () => {
            const { defineTool } = createStubDefineTool();
            const registry = registryWith(createSkill());
            const result = createSkillTools(defineTool, registry);

            expect(result).toBeDefined();
            expect(result.getName()).toBe('skills');
        });

        it('grouped tool has 3 actions', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            expect(Object.keys(tools[0]!.actions)).toEqual(['search', 'load', 'read_file']);
        });

        it('uses custom prefix when provided', () => {
            const { defineTool } = createStubDefineTool();
            const registry = registryWith(createSkill());
            const result = createSkillTools(defineTool, registry, { prefix: 'abilities' });

            expect(result.getName()).toBe('abilities');
        });
    });

    describe('search action', () => {
        it('returns matching skills by query', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(
                createSkill({ id: 'k8s', name: 'k8s', description: 'Deploy to Kubernetes', frontmatter: { name: 'k8s', description: 'Deploy to Kubernetes' } }),
                createSkill({ id: 'pdf', name: 'pdf', description: 'Extract PDF text', frontmatter: { name: 'pdf', description: 'Extract PDF text' } }),
            );
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['search']!.handler;
            const result = handler(null, { query: 'kubernetes' }) as { skills: unknown[]; total: number };

            expect(result.skills.length).toBeGreaterThan(0);
            expect(result.total).toBe(2);
        });

        it('returns all skills for empty query', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(
                createSkill({ id: 'a', name: 'a', description: 'Skill A', frontmatter: { name: 'a', description: 'Skill A' } }),
                createSkill({ id: 'b', name: 'b', description: 'Skill B', frontmatter: { name: 'b', description: 'Skill B' } }),
            );
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['search']!.handler;
            const result = handler(null, { query: '' }) as { skills: unknown[]; total: number };

            expect(result.skills).toHaveLength(2);
            expect(result.total).toBe(2);
        });

        it('returns all skills for wildcard query', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(
                createSkill({ id: 'x', name: 'x', description: 'X', frontmatter: { name: 'x', description: 'X' } }),
            );
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['search']!.handler;
            const result = handler(null, { query: '*' }) as { skills: unknown[]; total: number };

            expect(result.skills).toHaveLength(1);
        });

        it('coerces missing query to empty string', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(
                createSkill({ id: 'y', name: 'y', description: 'Y', frontmatter: { name: 'y', description: 'Y' } }),
            );
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['search']!.handler;
            const result = handler(null, {}) as { skills: unknown[]; total: number };

            expect(result.skills).toHaveLength(1);
        });

        it('omits name from result when it matches id', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(
                createSkill({ id: 'same-name', name: 'same-name', description: 'Same', frontmatter: { name: 'same-name', description: 'Same' } }),
            );
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['search']!.handler;
            const result = handler(null, { query: '*' }) as { skills: Array<{ id: string; name?: string }> };

            // When name === id, the name field should be omitted to reduce payload
            expect(result.skills[0]!.name).toBeUndefined();
        });
    });

    describe('load action', () => {
        it('loads a skill by valid ID', () => {
            const { defineTool, tools } = createStubDefineTool();
            const skill = createSkill();
            const registry = registryWith(skill);
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['load']!.handler;
            const result = handler(null, { skill_id: 'test-skill' }) as { id: string; instructions: string; files: string[] };

            expect(result.id).toBe('test-skill');
            expect(result.instructions).toContain('Do something');
            expect(result.files).toEqual(['scripts/run.sh']);
        });

        it('returns error hint for unknown skill ID', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['load']!.handler;
            const result = handler(null, { skill_id: 'nonexistent' }) as { error: string; hint: string };

            expect(result.error).toContain('nonexistent');
            expect(result.hint).toContain('skills.search');
        });

        it('returns error hint for empty skill ID', () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['load']!.handler;
            const result = handler(null, {}) as { error: string; hint: string };

            expect(result.error).toBeDefined();
            expect(result.hint).toBeDefined();
        });
    });

    describe('read_file action', () => {
        it('returns sanitized error for unknown skill', async () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['read_file']!.handler;
            const result = await handler(null, { skill_id: 'unknown', file_path: 'foo.txt' }) as { error: string; hint: string };

            expect(result.error).toBeDefined();
            expect(result.hint).toContain('skills.load');
        });

        it('returns sanitized error for path traversal', async () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['read_file']!.handler;
            const result = await handler(null, { skill_id: 'test-skill', file_path: '../../../etc/passwd' }) as { error: string };

            expect(result.error).toBeDefined();
            // Error message should NOT contain absolute server paths
            expect(result.error).not.toMatch(/[A-Z]:[\\\/]/);
        });

        it('returns sanitized error for SKILL.md access', async () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['read_file']!.handler;
            const result = await handler(null, { skill_id: 'test-skill', file_path: 'SKILL.md' }) as { error: string };

            expect(result.error).toContain('skills.load');
        });

        it('returns sanitized error for empty inputs', async () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['read_file']!.handler;

            const result1 = await handler(null, { skill_id: '', file_path: 'foo.txt' }) as { error: string };
            expect(result1.error).toBeDefined();

            const result2 = await handler(null, { skill_id: 'test-skill', file_path: '' }) as { error: string };
            expect(result2.error).toBeDefined();
        });

        it('never exposes absolute server paths in errors', async () => {
            const { defineTool, tools } = createStubDefineTool();
            const registry = registryWith(createSkill());
            createSkillTools(defineTool, registry);

            const handler = tools[0]!.actions['read_file']!.handler;
            const result = await handler(null, { skill_id: 'test-skill', file_path: 'nonexistent.txt' }) as { error: string };

            expect(result.error).toBeDefined();
            // Must not leak server paths like C:\Users\... or /srv/...
            expect(result.error).not.toMatch(/[A-Z]:[\\\/]/i);
            expect(result.error).not.toMatch(/\/srv\//);
        });
    });
});
