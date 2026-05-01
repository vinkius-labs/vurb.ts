/**
 * Shared message utilities for A2A skill resolution and argument extraction.
 *
 * Centralised logic used by both A2AHandler (sync path) and
 * StreamableHttpTransport (streaming path) to avoid divergence.
 *
 * @module
 * @internal
 */

import type { Message } from './types.js';

/**
 * Resolve which MCP tool to call from an A2A message.
 *
 * Priority:
 * 1. `metadata.skill_id` — explicit skill selection
 * 2. First DataPart with `data.tool_name` — structured invocation
 * 3. First TextPart text content — used as tool name (exact match)
 */
export function resolveSkillId(message: Pick<Message, 'metadata' | 'parts'>): string | undefined {
    // 1. Explicit skill_id in metadata
    const metaSkill = message.metadata?.['skill_id'];
    if (typeof metaSkill === 'string' && metaSkill.length > 0) {
        return metaSkill;
    }

    // 2. DataPart with tool_name
    for (const part of message.parts) {
        if (part.kind === 'data' && typeof part.data['tool_name'] === 'string') {
            return part.data['tool_name'];
        }
    }

    // 3. TextPart as tool name (first text part, trimmed)
    for (const part of message.parts) {
        if (part.kind === 'text' && part.text.trim().length > 0) {
            const trimmed = part.text.trim();
            if (!trimmed.includes(' ') || trimmed.length < 64) {
                return trimmed;
            }
        }
    }

    return undefined;
}

/**
 * Extract tool arguments from an A2A message.
 *
 * Priority:
 * 1. First DataPart `data` (excluding `tool_name`)
 * 2. TextPart content wrapped as `{ text: "..." }`
 */
export function extractMessageArgs(message: Pick<Message, 'parts'>): Record<string, unknown> {
    // 1. DataPart
    for (const part of message.parts) {
        if (part.kind === 'data') {
            const { tool_name: _, ...args } = part.data;
            return args;
        }
    }

    // 2. TextPart
    for (const part of message.parts) {
        if (part.kind === 'text') {
            return { text: part.text };
        }
    }

    return {};
}
