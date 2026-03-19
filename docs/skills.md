# Agent Skills — Progressive Instruction Distribution

<!-- Prompt Card -->
<div style="margin:32px 0;padding:28px 32px;background:rgba(192,132,252,0.04);border:1px solid rgba(192,132,252,0.15);border-radius:12px;position:relative">
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:2px;font-weight:700">TELL YOUR AI AGENT</span>
<div style="font-size:16px;color:rgba(255,255,255,0.7);margin-top:12px;line-height:1.6;font-style:italic;font-family:Inter,sans-serif">"Register all SKILL.md files from ./skills and expose them as searchable MCP tools with progressive disclosure."</div>
<div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px">Works with Cursor · Claude Code · Copilot · Windsurf · Cline — via SKILL.md</div>
</div>

---

<!-- Editorial break -->
<div style="margin:48px 0;padding:56px 40px;background:#09090f;border:1px solid rgba(255,255,255,0.05);border-radius:12px;position:relative;overflow:hidden">
<div style="position:absolute;top:0;left:0;width:100%;height:1px;background:linear-gradient(90deg,transparent,rgba(192,132,252,0.3),transparent)"></div>
<span style="font-size:9px;color:rgba(192,132,252,0.6);letter-spacing:3px;font-weight:700">PROGRESSIVE DISCLOSURE</span>
<div style="font-size:36px;color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;letter-spacing:-1.5px;margin-top:12px;line-height:1.1">50 skills. Zero token waste.<br><span style="color:rgba(255,255,255,0.25)">Load only what you need.</span></div>
<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:16px;max-width:540px;line-height:1.7;font-family:Inter,sans-serif">The agent searches a lightweight index (~50 tokens/skill), loads only the relevant SKILL.md, and reads auxiliary files on demand. Three layers — each consuming tokens only when needed.</div>
</div>

AI agents are powerful, but they lack domain expertise. Every team solves this the same way: stuff instructions into the system prompt. This works — until the context window fills up with 50 skills worth of instructions for a task that needs one.

Vurb.ts's Agent Skills system makes this waste **structurally impossible**: skills are distributed on demand via MCP, and only the instructions the agent actually needs enter the context window.

> [!IMPORTANT]
> **Progressive Disclosure by Design.**
> The agent discovers skills by keyword, loads only the relevant instructions, and reads auxiliary files on demand. Three layers — each delivering progressively more detail, each consuming tokens only when needed.

## The Problem

Every approach to teaching AI agents has a fundamental tension:

| Approach | Risk |
|---|---|
| Giant system prompt with all instructions | Token cost explosion, context window overflow, attention dilution |
| One tool per skill (hardcoded) | Rigid, can't scale — 100 skills = 100 tools in `tools/list` |
| External RAG pipeline | Requires embedding infrastructure, adds latency, non-deterministic retrieval |

Agent Skills eliminates all three with three-layer disclosure: the agent searches a lightweight index (~50 tokens/skill), loads only what it needs (~500–2000 tokens), and reads auxiliary files on demand.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Agent sees a task → "I need Kubernetes deployment instructions"     │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │ SEARCH       │──▸│ LOAD         │──▸│ READ FILE                │ │
│  │ skills.search│   │ skills.load  │   │ skills.read_file         │ │
│  │              │   │              │   │                          │ │
│  │ ~50 tok/skill│   │ Full SKILL.md│   │ Auxiliary files          │ │
│  │ id + desc    │   │ + file list  │   │ (scripts, configs, etc.) │ │
│  └──────────────┘   └──────────────┘   └──────────────────────────┘ │
│                                                                      │
│  ✔ Filesystem auto-discovery        ✔ agentskills.io-compliant     │
│  ✔ Full-text search (MiniSearch)    ✔ Pluggable search engine      │
│  ✔ Symlink-hardened file access     ✔ Path traversal protection    │
│  ✔ Binary files (base64)           ✔ SKILL.md case-insensitive     │
└──────────────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **Search** — the agent calls `skills.search` with a keyword query. The registry returns metadata only: skill IDs, names, and descriptions. No instructions loaded.
2. **Load** — the agent calls `skills.load` with a specific `skill_id`. The registry returns the full `SKILL.md` instructions plus a list of auxiliary files available for reading.
3. **Read File** — if the instructions reference scripts, templates, or configs, the agent calls `skills.read_file` to fetch them individually. Text files return UTF-8; binary files return base64.

## Installation

```bash
npm install @vurb/skills
```

Peer dependency: `Vurb.ts` ≥ 3.0.0.

## Quick Start {#quickstart}

### Step 1 — Create Skills on Disk

Each skill lives in its own directory with a `SKILL.md` file:

```
skills/
├── deploy-k8s/
│   ├── SKILL.md              ← Frontmatter + instructions
│   ├── scripts/
│   │   └── rollback.sh       ← Readable via skills.read_file
│   └── templates/
│       └── deployment.yaml
├── database-migration/
│   ├── SKILL.md
│   └── examples/
│       └── migration.sql
└── code-review/
    └── SKILL.md
```

### Step 2 — Discover and Register

```typescript
import { initVurb } from '@vurb/core';
import { SkillRegistry, autoDiscoverSkills, createSkillTools } from '@vurb/skills';

interface AppContext { db: PrismaClient; userId: string }
const f = initVurb<AppContext>();

// Discover skills from the filesystem
const skills = new SkillRegistry();
await autoDiscoverSkills(skills, './skills');

// Create the three MCP tools
const [search, load, readFile] = createSkillTools(f, skills);

// Register alongside your domain tools
const registry = f.registry();
registry.register(search);
registry.register(load);
registry.register(readFile);
```

### Step 3 — Attach to Server

```typescript
registry.attachToServer(server, {
    contextFactory: (extra) => createAppContext(extra),
});
```

That's it. Any MCP client (Claude, Cursor, VS Code Copilot, etc.) can now search, load, and read skills through the standard MCP protocol.

## SKILL.md Format {#skill-format}

The `SKILL.md` file follows the [agentskills.io](https://agentskills.io) specification — YAML frontmatter followed by Markdown instructions:

```markdown
---
name: deploy-k8s
description: Deploy applications to Kubernetes clusters with zero downtime.
license: MIT
compatibility: Claude, GPT-4, Gemini
allowed-tools: Bash(kubectl:*) Bash(helm:*)
metadata:
  author: Platform Team
  version: "2.1"
  tags: infrastructure, devops
---
<a href="https://www.npmjs.com/package/@vurb/skills"><img src="https://img.shields.io/npm/v/@vurb/skills?color=blue" alt="npm" /></a>

# Kubernetes Deployment

## Prerequisites
- kubectl configured with cluster access
- Helm 3.x installed

## Steps
1. Verify cluster connectivity: `kubectl cluster-info`
2. Apply the deployment manifest...
```

### Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✔ | Lowercase alphanumeric + hyphens, 2–50 chars |
| `description` | `string` | ✔ | One-line summary (shown in search results) |
| `license` | `string` | | SPDX license identifier |
| `compatibility` | `string` | | Comma-separated list of supported agents |
| `allowed-tools` | `string[]` or space-delimited `string` | | Tools the skill may use |
| `metadata` | `Record<string, string>` | | Custom key-value pairs (author, version, tags) |

> **Note:** `allowed-tools` accepts both YAML array syntax and space-delimited strings. Both produce the same result.

## Auto-Discovery {#discovery}

`autoDiscoverSkills` recursively scans directories for `SKILL.md` files and registers all valid skills:

```typescript
import { SkillRegistry, autoDiscoverSkills } from '@vurb/skills';

const skills = new SkillRegistry({ validate: true });

// Scan a single directory
await autoDiscoverSkills(skills, './skills');

// Scan multiple directories
await autoDiscoverSkills(skills, ['./skills', './vendor-skills']);

// Strict mode — throws on any validation error
await autoDiscoverSkills(skills, './skills', { strict: true });

// Error callback — log without throwing
await autoDiscoverSkills(skills, './skills', {
    onError: (name, error) => console.warn(`Skipping ${name}: ${error.message}`),
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `strict` | `boolean` | `false` | Throw on validation errors instead of skipping |
| `onError` | `(name, error) => void` | — | Callback for individual skill errors |

## MCP Tools {#tools}

`createSkillTools` generates three MCP tools that follow the progressive disclosure pattern:

```typescript
const [search, load, readFile] = createSkillTools(f, skills, {
    prefix: 'skills', // default — produces: skills.search, skills.load, skills.read_file
});
```

### `skills.search` {#search}

Search the skill registry by keyword. Returns metadata only — lightweight for context windows.

```typescript
// Agent sends: { query: "kubernetes deploy" }
// Response:
{
    skills: [
        { id: "deploy-k8s", description: "Deploy applications to Kubernetes clusters." },
        { id: "k8s-troubleshoot", description: "Diagnose Kubernetes pod failures." }
    ],
    total: 15
}
```

Empty query or `*` returns all registered skills. The search uses prefix matching and fuzzy matching via MiniSearch.

### `skills.load` {#load}

Load full instructions for a specific skill. This is the primary instruction delivery mechanism.

```typescript
// Agent sends: { skill_id: "deploy-k8s" }
// Response:
{
    id: "deploy-k8s",
    instructions: "# Kubernetes Deployment\n\n## Prerequisites...",
    files: ["scripts/rollback.sh", "templates/deployment.yaml"],
    metadata: { author: "Platform Team", version: "2.1" }
}
```

When the skill is not found, the response includes a self-healing hint suggesting the agent search first.

### `skills.read_file` {#read-file}

Read an auxiliary file from a loaded skill. Security-hardened with path traversal protection.

```typescript
// Agent sends: { skill_id: "deploy-k8s", file_path: "scripts/rollback.sh" }
// Response:
{
    content: "#!/bin/bash\nkubectl rollout undo...",
    path: "scripts/rollback.sh",
    size: 1234,
    encoding: "utf-8",
    mimeType: "text/x-shellscript"
}
```

Binary files are returned as base64 with `encoding: "base64"`.

## Validation {#validation}

Skills are validated against the [agentskills.io](https://agentskills.io) specification:

```typescript
import { validateSkill, formatValidationIssues } from '@vurb/skills';

const result = validateSkill(skill);
// { valid: boolean, errors: ValidationIssue[], warnings: ValidationIssue[] }

if (!result.valid) {
    console.error(formatValidationIssues(result.errors));
}
```

### Validation Rules

| Rule | Severity | Description |
|---|---|---|
| Name format | Error | Lowercase alphanumeric + hyphens only |
| Name length | Error | 2–50 characters |
| Description required | Error | Non-empty description |
| Description length | Warning | Under 200 characters |
| Directory match | Error | Skill name must match its directory name |

## Security Model {#security}

The `skills.read_file` tool implements multiple layers of defense against path traversal and data exfiltration:

### Path Traversal Protection

```
Request: { file_path: "../../etc/passwd" }
                │
                ▼
┌──────────────────────────────────────────────────────┐
│ 1. Normalize     — backslashes → forward slashes     │
│ 2. Reject ..     — any segment containing '..'        │
│ 3. Boundary      — resolved path ⊂ skill directory   │
│ 4. Symlink       — fs.realpath() → verify target      │
│ 5. SKILL.md      — case-insensitive block             │
│ 6. Size limit    — reject files > maxFileSize         │
│ 7. Sanitize      — strip absolute paths from errors   │
└──────────────────────────────────────────────────────┘
                │
                ▼
        Error: "Path traversal detected"
```

| Layer | What It Does |
|---|---|
| **Normalization** | Converts backslashes, detects `..` segments |
| **Boundary check** | Resolved path must stay inside the skill directory |
| **Symlink resolution** | `fs.realpath()` verifies the real target stays within bounds |
| **SKILL.md blocking** | `SKILL.md` (case-insensitive) cannot be read via `read_file` — use `skills.load` |
| **Size limits** | Files above `maxFileSize` are rejected to prevent OOM |
| **Error sanitization** | Absolute server paths are never exposed to the agent |

## Custom Search Engine {#custom-search}

The registry uses `FullTextSearchEngine` (MiniSearch-based) by default. Swap it for any implementation of the `SkillSearchEngine` interface:

```typescript
import { SkillRegistry, type SkillSearchEngine } from '@vurb/skills';

class EmbeddingSearchEngine implements SkillSearchEngine {
    index(skills: SkillMetadata[]): void { /* build vector index */ }
    search(query: string, limit: number): SkillSearchResult[] { /* semantic search */ }
}

const registry = new SkillRegistry({
    searchEngine: new EmbeddingSearchEngine(),
});
```

## Best Practices {#best-practices}

### 1. One Skill Per Concern

Keep skills focused. A skill should map to a single task domain:

```
# ✔ Good — focused skills
skills/deploy-k8s/SKILL.md
skills/k8s-troubleshoot/SKILL.md
skills/k8s-monitoring/SKILL.md

# ✘ Bad — kitchen sink skill
skills/everything-k8s/SKILL.md   # 2000 lines of instructions
```

### 2. Write Descriptions for Search

The `description` field is what the agent sees during `skills.search`. Make it action-oriented and specific:

```yaml
# ✔ Good — searchable, specific
description: Deploy applications to Kubernetes clusters with zero-downtime rolling updates.

# ✘ Bad — vague, not searchable
description: Kubernetes stuff.
```

### 3. Keep Instructions Token-Efficient

The agent loads the full `SKILL.md` into its context window. Avoid verbose instructions — be precise and structured:

```markdown
# ✔ Good — structured, scannable
## Steps
1. Run `kubectl cluster-info` to verify connectivity
2. Apply manifest: `kubectl apply -f deployment.yaml`

# ✘ Bad — narrative prose
First, you should check if the cluster is available by running
the kubectl cluster-info command, which will show you whether
the Kubernetes control plane is running...
```

### 4. Use Auxiliary Files for Large Content

If a skill needs a 200-line YAML template, don't inline it in `SKILL.md`. Put it in a file and reference it:

```markdown
## Deployment Template
See `templates/deployment.yaml` for the full manifest.
Use `skills.read_file` to load it.
```

### 5. Validate Before Shipping

Run validation in CI to catch issues before deployment:

```typescript
import { SkillRegistry, autoDiscoverSkills } from '@vurb/skills';

const skills = new SkillRegistry({ validate: true });
await autoDiscoverSkills(skills, './skills', { strict: true });
// Throws on any validation error — fails the CI build
```

## API Reference {#api}

### `SkillRegistry` {#registry-api}

```typescript
class SkillRegistry {
    constructor(options?: SkillRegistryOptions);
    register(skill: Skill): void;
    registerAll(skills: Skill[]): void;
    search(query: string, limit?: number): SkillSearchResult[];
    load(id: string): Skill | null;
    readFile(skillId: string, filePath: string): Promise<SkillFileContent>;
    has(id: string): boolean;
    list(): string[];
    clear(): void;
}
```

### `SkillRegistryOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `validate` | `boolean` | `true` | Validate skills on registration |
| `maxFileSize` | `number` | `5_000_000` | Max readable file size in bytes (5MB) |
| `searchEngine` | `SkillSearchEngine` | `FullTextSearchEngine` | Custom search engine implementation |

### `autoDiscoverSkills(registry, dirs, options?)`

```typescript
async function autoDiscoverSkills(
    registry: SkillRegistry,
    dirs: string | string[],
    options?: AutoDiscoverSkillsOptions,
): Promise<string[]>
```

Returns an array of successfully discovered skill IDs.

### `createSkillTools(Vurb.ts, registry, options?)`

```typescript
function createSkillTools<TContext>(
    Vurb.ts: VurbInstance<TContext>,
    registry: SkillRegistry,
    options?: CreateSkillToolsOptions,
): [search, load, readFile]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `prefix` | `string` | `'skills'` | Tool name prefix (e.g., `skills.search`) |

### Parser Functions

```typescript
// Full parse — frontmatter + body + path → Skill
function parseSkillMd(content: string, path: string): Skill;

// Extract frontmatter and body separately
function extractFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string };

// Convert raw object to typed frontmatter
function toSkillFrontmatter(raw: Record<string, unknown>): SkillFrontmatter;
```

### Validation Functions

```typescript
function validateSkill(skill: Skill): ValidationResult;
function formatValidationIssues(issues: ValidationIssue[]): string;
```

## Types {#types}

```typescript
interface Skill {
    id: string;
    name: string;
    description: string;
    instructions: string;
    path: string;
    frontmatter: SkillFrontmatter;
    files: string[];
}

interface SkillFrontmatter {
    name: string;
    description: string;
    license?: string;
    compatibility?: string;
    metadata?: Record<string, string>;
    allowedTools?: string[];
}

interface SkillSearchResult {
    id: string;
    name: string;
    description: string;
    score: number;
}

interface SkillFileContent {
    content: string;
    path: string;
    size: number;
    encoding: 'utf-8' | 'base64';
    mimeType: string;
}

interface SkillSearchEngine {
    index(skills: SkillMetadata[]): void;
    search(query: string, limit: number): SkillSearchResult[];
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

interface ValidationIssue {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}
```
