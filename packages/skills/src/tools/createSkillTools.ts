/**
 * createSkillTools — MCP Tool Factory for Agent Skills
 *
 * Generates the three MCP tools required for progressive disclosure:
 *   1. `skills.search` — Find skills by description (Layer 1: metadata)
 *   2. `skills.load`   — Load full instructions (Layer 2: instructions)
 *   3. `skills.read_file` — Read auxiliary files (Layer 3: resources)
 *
 * Built using Vurb's `f.query()` fluent builder.
 *
 * @module
 */

import { type SkillRegistry } from '../registry/SkillRegistry.js';

// ── Types ────────────────────────────────────────────────

/**
 * Duck-typed Vurb instance — avoids hard coupling to `vurb` internals.
 * Only requires the `query()` method from `initVurb<TContext>()`.
 */
interface VurbQueryFactory {
    query(name: string): FluentBuilder;
}

/**
 * Duck-typed FluentToolBuilder chain.
 * Mirrors the subset of the Vurb builder API we actually use.
 */
interface FluentBuilder {
    describe(desc: string): FluentBuilder;
    withString(name: string, desc: string): FluentBuilder;
    withNumber(name: string, desc: string): FluentBuilder;
    handle(handler: (input: Record<string, unknown>) => unknown | Promise<unknown>): ToolBuilderResult;
}

/**
 * Duck-typed result from `.handle()` — a registered tool builder.
 */
interface ToolBuilderResult {
    getName(): string;
    buildToolDefinition(): unknown;
}

// ── Options ──────────────────────────────────────────────

/**
 * Options for skill tool creation.
 */
export interface CreateSkillToolsOptions {
    /**
     * Maximum search results per query.
     * @default 10
     */
    readonly searchLimit?: number | undefined;

    /**
     * Tool name prefix. Tools will be named `{prefix}.search`, etc.
     * @default 'skills'
     */
    readonly prefix?: string | undefined;
}

// ── Factory ──────────────────────────────────────────────

/**
 * Create the three MCP tools for serving Agent Skills.
 *
 * @param f - Vurb instance from `initVurb<TContext>()`
 * @param registry - SkillRegistry with skills already loaded
 * @param options - Tool configuration
 * @returns Array of three tool builders: [search, load, readFile]
 *
 * @example
 * ```typescript
 * import { initVurb, ToolRegistry } from '@vurb/core';
 * import { SkillRegistry, autoDiscoverSkills, createSkillTools } from '@vurb/skills';
 *
 * const f = initVurb<AppContext>();
 * const skills = new SkillRegistry();
 * await autoDiscoverSkills(skills, './skills');
 *
 * const [search, load, readFile] = createSkillTools(f, skills);
 * const registry = f.registry();
 * registry.registerAll(search, load, readFile);
 * ```
 */
export function createSkillTools(
    f: VurbQueryFactory,
    registry: SkillRegistry,
    options: CreateSkillToolsOptions = {},
): [search: ToolBuilderResult, load: ToolBuilderResult, readFile: ToolBuilderResult] {
    const prefix = options.prefix ?? 'skills';
    const limit = options.searchLimit ?? 10;

    // ── skills.search ────────────────────────────────────
    const searchTool = f.query(`${prefix}.search`)
        .describe(
            'Find skills relevant to a task description. ' +
            'Use this to discover skills. If you already have a skill_id, skip to skills.load. ' +
            'If too many results, refine your query with more specific terms. ' +
            'Use "" or "*" to list all available skills.',
        )
        .withString('query', 'Natural-language task description (e.g. "extract PDF text")')
        .handle((input: Record<string, unknown>) => {
            const query = String(input['query'] ?? '');
            const result = registry.search(query, limit);
            return {
                skills: result.skills.map(s => ({
                    id: s.id,
                    description: s.description,
                    score: s.score,
                    ...(s.name !== s.id ? { name: s.name } : {}),
                })),
                total: result.total,
            };
        });

    // ── skills.load ──────────────────────────────────────
    const loadTool = f.query(`${prefix}.load`)
        .describe(
            'Load a skill\'s full instructions. ' +
            'Call this after selecting an id from skills.search. ' +
            'Returns detailed step-by-step instructions and available files.',
        )
        .withString('skill_id', 'Skill identifier from search results (e.g. "pdf-processing")')
        .handle((input: Record<string, unknown>) => {
            const skillId = String(input['skill_id'] ?? '');
            const skill = registry.load(skillId);

            if (!skill) {
                return {
                    error: `Skill "${skillId}" not found`,
                    hint: 'Use skills.search to find valid skill IDs',
                };
            }

            return {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                instructions: skill.instructions,
                files: skill.files,
            };
        });

    // ── skills.read_file ─────────────────────────────────
    const readFileTool = f.query(`${prefix}.read_file`)
        .describe(
            'Read a file inside a skill directory. ' +
            'Use this to access scripts, references, or assets listed in the skill\'s files array. ' +
            'Handles both text (utf-8) and binary (base64) files.',
        )
        .withString('skill_id', 'Skill identifier from skills.load')
        .withString('file_path', 'Relative path inside the skill (e.g. "scripts/deploy.sh")')
        .handle(async (input: Record<string, unknown>) => {
            const skillId = String(input['skill_id'] ?? '');
            const filePath = String(input['file_path'] ?? '');

            try {
                const result = await registry.readFile(skillId, filePath);
                return {
                    content: result.content,
                    size: result.size,
                    encoding: result.encoding,
                    mime_type: result.mimeType,
                };
            } catch (err) {
                // Sanitize: fs errors often contain absolute paths
                const rawMsg = err instanceof Error ? err.message : String(err);
                const safeMsg = rawMsg.includes(filePath)
                    ? rawMsg.replace(/[A-Z]:[\\\/][^"'\s]+/gi, '<path>').replace(/\/[\w/.-]+\/[\w.-]+/g, '<path>')
                    : `Cannot read file "${filePath}"`;
                return {
                    error: safeMsg,
                    hint: 'Use skills.load to see available files for this skill',
                };
            }
        });

    return [searchTool, loadTool, readFileTool];
}
