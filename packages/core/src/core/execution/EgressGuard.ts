/**
 * EgressGuard — Payload Size Limiter (FinOps + OOM Shield)
 *
 * Prevents oversized tool responses from:
 * 1. Crashing the Node process with OOM (JSON.stringify of 30MB)
 * 2. Overflowing the LLM context window ($15 per wasted request)
 * 3. Saturating the transport layer
 *
 * This is a **brute-force safety net** — the last line of defense.
 * Presenter `.agentLimit()` is the domain-aware guard; this is the
 * byte-level guard for when `.agentLimit()` is not configured.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────┐
 *   │  ToolResponse from handler/Presenter         │
 *   │                                              │
 *   │  ┌──────────┐  within limit? ┌───────────┐  │
 *   │  │ measure  ├────YES────────►│ pass-thru │  │
 *   │  │ bytes    │                └───────────┘  │
 *   │  │          │  exceeds?      ┌───────────┐  │
 *   │  │          ├────YES────────►│ truncate  │  │
 *   │  └──────────┘                │ + inject  │  │
 *   │                              │ guidance  │  │
 *   │                              └───────────┘  │
 *   └──────────────────────────────────────────────┘
 *
 * Properties:
 * - Zero overhead when not configured (guard returns input directly)
 * - Measures byte length via Buffer.byteLength (UTF-8 accurate)
 * - Truncates at the text level, preserving valid ToolResponse shape
 * - Injects system intervention message for LLM self-correction
 *
 * @module
 * @internal
 */

import { type ToolResponse } from '../response.js';

// ── Configuration ────────────────────────────────────────

/**
 * Egress guard configuration.
 *
 * @example
 * ```typescript
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     maxPayloadBytes: 2 * 1024 * 1024, // 2MB safety net
 * });
 * ```
 */
export interface EgressConfig {
    /**
     * Maximum total payload size in bytes.
     * When a response exceeds this limit, the text content is
     * truncated and a system intervention message is appended.
     *
     * @minimum 1024 (1KB minimum to avoid unusable responses)
     */
    readonly maxPayloadBytes: number;
}

// ── Constants ────────────────────────────────────────────

const MIN_PAYLOAD_BYTES = 1024;

function buildTruncationSuffix(formattedLimit: string): string {
    return (
        `\n\n[SYSTEM INTERVENTION: Payload truncated at ${formattedLimit} to prevent memory crash. ` +
        `You MUST use pagination (limit/offset) or filters to retrieve smaller result sets.]`
    );
}

// ── Guard Implementation ─────────────────────────────────

/**
 * Apply egress guard to a ToolResponse.
 *
 * Measures the total byte length of all text content blocks.
 * If the total exceeds `maxPayloadBytes`, truncates the LAST
 * text block and appends a system intervention message.
 *
 * @param response - The ToolResponse to guard
 * @param maxPayloadBytes - Maximum allowed bytes
 * @returns The original response (if within limit) or a truncated copy
 *
 * @internal
 */
export function applyEgressGuard(
    response: ToolResponse,
    maxPayloadBytes: number,
): ToolResponse {
    const limit = Math.max(MIN_PAYLOAD_BYTES, maxPayloadBytes);

    // Measure total byte length across all content blocks
    let totalBytes = 0;
    for (const block of response.content) {
        totalBytes += byteLength(block.text);
    }

    // Fast path: within limit
    if (totalBytes <= limit) {
        return response;
    }

    // Truncation path: find how much to cut
    const suffix = buildTruncationSuffix(formatBytes(limit));
    const suffixBytes = byteLength(suffix);
    const targetBytes = limit - suffixBytes;

    if (targetBytes <= 0) {
        // Edge case: limit is smaller than the suffix itself
        return {
            content: [{ type: 'text', text: suffix.trim() }],
            isError: true,
        };
    }

    // Truncate by rebuilding content blocks
    let remainingBytes = targetBytes;
    const truncatedContent: { type: 'text'; text: string }[] = [];

    for (const block of response.content) {
        const blockBytes = byteLength(block.text);

        if (remainingBytes <= 0) {
            // Skip remaining blocks entirely
            break;
        }

        if (blockBytes <= remainingBytes) {
            // Block fits entirely
            truncatedContent.push({ type: 'text', text: block.text });
            remainingBytes -= blockBytes;
        } else {
            // Block needs truncation — truncate at character boundary
            const truncatedText = truncateToByteLimit(block.text, remainingBytes);
            truncatedContent.push({ type: 'text', text: truncatedText + suffix });
            remainingBytes = 0;
        }
    }

    // If blocks were skipped (remainingBytes exhausted exactly at a block
    // boundary), append the truncation suffix so the LLM knows content
    // was removed. Without this, the response looks deceptively complete.
    const allBlocksIncluded = truncatedContent.length === response.content.length;
    if (!allBlocksIncluded && truncatedContent.length > 0) {
        const last = truncatedContent[truncatedContent.length - 1]!;
        if (!last.text.endsWith(suffix.trim())) {
            truncatedContent[truncatedContent.length - 1] = {
                type: 'text',
                text: last.text + suffix,
            };
        }
    }

    // Ensure at least one content block exists
    if (truncatedContent.length === 0) {
        truncatedContent.push({ type: 'text', text: suffix.trim() });
    }

    const result: { content: { type: 'text'; text: string }[]; isError?: boolean } = {
        content: truncatedContent,
    };
    if (response.isError) {
        result.isError = true;
    }
    return result as ToolResponse;
}

// ── Utilities ────────────────────────────────────────────

/**
 * Get the UTF-8 byte length of a string.
 * Uses TextEncoder for cross-platform compatibility.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

function byteLength(str: string): number {
    return encoder.encode(str).byteLength;
}

/**
 * Truncate a string to fit within a byte limit.
 * Respects multi-byte UTF-8 character boundaries by backtracking
 * from the cut point to avoid producing U+FFFD replacement characters.
 */
function truncateToByteLimit(str: string, maxBytes: number): string {
    const encoded = encoder.encode(str);
    if (encoded.byteLength <= maxBytes) return str;

    // Backtrack from the byte boundary to a valid UTF-8 sequence start.
    // UTF-8 continuation bytes have the pattern 10xxxxxx (0x80..0xBF).
    let end = maxBytes;
    while (end > 0 && ((encoded[end] ?? 0) & 0xC0) === 0x80) {
        end--;
    }
    const sliced = encoded.slice(0, end);
    return decoder.decode(sliced);
}

/**
 * Format bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)}KB`;
    }
    return `${bytes}B`;
}
