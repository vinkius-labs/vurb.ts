/**
 * @vurb/skills — Agent Skills Distribution via MCP
 *
 * Progressive disclosure of domain-specific instructions for AI agents.
 * Search → Load → Read: three layers of skill delivery, optimized for
 * context window efficiency.
 *
 * @example
 * ```typescript
 * import { initVurb, ToolRegistry, defineTool } from '@vurb/core';
 * import { SkillRegistry, autoDiscoverSkills, createSkillTools } from '@vurb/skills';
 *
 * const f = initVurb<AppContext>();
 *
 * // 1. Load skills from server's local directory
 * const skills = new SkillRegistry();
 * await autoDiscoverSkills(skills, './skills');
 *
 * // 2. Create a grouped MCP tool with search/load/read_file actions
 * const skillsTool = createSkillTools(defineTool, skills);
 *
 * // 3. Register alongside your domain tools
 * const registry = f.registry();
 * registry.register(skillsTool);
 *
 * // → Remote agents can now search/load/read skills via MCP
 * ```
 *
 * @module
 * @packageDocumentation
 */

// ── Domain ───────────────────────────────────────────────
export type {
    Skill,
    SkillFrontmatter,
    SkillMetadata,
    SkillSearchResult,
    SkillFileContent,
} from './domain/Skill.js';

// ── Parser ───────────────────────────────────────────────
export {
    parseSkillMd,
    extractFrontmatter,
    toSkillFrontmatter,
} from './parser/SkillParser.js';

// ── Validator ────────────────────────────────────────────
export {
    validateSkill,
    formatValidationIssues,
} from './parser/SkillValidator.js';
export type {
    ValidationResult,
    ValidationIssue,
    ValidationSeverity,
} from './parser/SkillValidator.js';

// ── Search ───────────────────────────────────────────────
export { FullTextSearchEngine } from './search/SkillSearchEngine.js';
export type { SkillSearchEngine } from './search/SkillSearchEngine.js';

// ── Registry ─────────────────────────────────────────────
export { SkillRegistry } from './registry/SkillRegistry.js';
export type { SkillRegistryOptions } from './registry/SkillRegistry.js';

// ── Discovery ────────────────────────────────────────────
export { autoDiscoverSkills } from './discovery/autoDiscoverSkills.js';
export type { AutoDiscoverSkillsOptions } from './discovery/autoDiscoverSkills.js';

// ── MCP Tools ────────────────────────────────────────────
export { createSkillTools } from './tools/createSkillTools.js';
export type { CreateSkillToolsOptions } from './tools/createSkillTools.js';
