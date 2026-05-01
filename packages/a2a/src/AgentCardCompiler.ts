/**
 * AgentCardCompiler — Compiles MCP registry metadata into an A2A Agent Card.
 *
 * This is the core bridge: takes tools, prompts, and resources from an MCP
 * server and produces a spec-compliant A2A Agent Card manifest. Uses
 * duck-typed interfaces (same pattern as ServerCard) to avoid circular
 * dependencies with heavy registry types.
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

import { A2A_PROTOCOL_VERSION } from './constants.js';
import type { AgentCard, AgentSkill, A2ABridgeConfig, AgentProvider } from './types.js';

// ── Duck-typed interfaces ────────────────────────────────
// Minimal contracts for metadata extraction without importing
// full ToolBuilder/GroupedToolBuilder generics.

export interface A2ABuilderLike {
    getName(): string;
    buildToolDefinition?(): { description?: string } | null | undefined;
    getTags?(): readonly string[];
}

export interface A2APromptLike {
    readonly name: string;
    readonly description?: string;
}

export interface A2AResourceLike {
    readonly name: string;
    readonly description?: string;
    readonly uri?: string;
}

// ── Compiler Config ──────────────────────────────────────

export interface AgentCardCompilerConfig {
    /** Server name. */
    readonly name: string;
    /** Server version. */
    readonly version?: string;
    /** Publicly reachable URL. */
    readonly url: string;
    /** Bridge configuration overrides. */
    readonly bridge?: A2ABridgeConfig;
}

// ── Compiler ─────────────────────────────────────────────

/**
 * Compile an A2A Agent Card from MCP registry metadata.
 *
 * Pure function — no side effects. Called once at startup and cached.
 *
 * @param config - Server identity and bridge configuration
 * @param builders - Tool builders from the MCP registry
 * @param prompts - Prompt definitions (optional)
 * @param resources - Resource definitions (optional)
 * @returns A2A Agent Card manifest
 */
export function compileAgentCard(
    config: AgentCardCompilerConfig,
    builders: Iterable<A2ABuilderLike>,
    prompts?: Iterable<A2APromptLike>,
    resources?: Iterable<A2AResourceLike>,
): AgentCard {
    const skills: AgentSkill[] = [];

    // ── Extract skills from tool builders ────────────────
    for (const builder of builders) {
        const name = builder.getName();
        const def = builder.buildToolDefinition?.();
        const tags = builder.getTags?.() ?? [];

        skills.push({
            id: name,
            name,
            description: def?.description ?? `Executes the ${name} operation.`,
            tags: tags.length > 0 ? [...tags] : ['tool'],
            inputModes: ['application/json'],
            outputModes: ['application/json'],
        });
    }

    // ── Extract skills from prompts ──────────────────────
    if (prompts) {
        for (const prompt of prompts) {
            skills.push({
                id: `prompt:${prompt.name}`,
                name: prompt.name,
                description: prompt.description ?? `Executes the ${prompt.name} prompt.`,
                tags: ['prompt'],
                inputModes: ['text/plain'],
                outputModes: ['text/plain'],
            });
        }
    }

    // ── Extract skills from resources ────────────────────
    if (resources) {
        for (const resource of resources) {
            skills.push({
                id: `resource:${resource.name}`,
                name: resource.name,
                description: resource.description ?? `Accesses the ${resource.name} resource.`,
                tags: ['resource'],
                inputModes: ['text/plain'],
                outputModes: ['application/json'],
            });
        }
    }

    // ── Build the Agent Card ─────────────────────────────
    const bridge = config.bridge;
    const agentUrl = bridge?.url ?? config.url;

    const card: AgentCard = {
        name: bridge?.name ?? config.name,
        description: bridge?.description ?? `A2A-compatible agent powered by ${config.name}.`,
        url: agentUrl,
        version: bridge?.version ?? config.version ?? '1.0.0',
        protocolVersion: A2A_PROTOCOL_VERSION,
        capabilities: {
            streaming: true,
            pushNotifications: false,
            stateTransitionHistory: true,
        },
        defaultInputModes: ['application/json', 'text/plain'],
        defaultOutputModes: ['application/json', 'text/plain'],
        skills,
        ...(bridge?.provider ? { provider: bridge.provider } : {}),
        ...(bridge?.securitySchemes ? { securitySchemes: bridge.securitySchemes } : {}),
        ...(bridge?.security ? { security: bridge.security } : {}),
        ...(bridge?.documentationUrl ? { documentationUrl: bridge.documentationUrl } : {}),
        ...(bridge?.iconUrl ? { iconUrl: bridge.iconUrl } : {}),
        additionalInterfaces: [
            { transport: 'JSONRPC', url: agentUrl },
        ],
    };

    return card;
}
