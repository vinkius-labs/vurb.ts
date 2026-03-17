/**
 * Bug #6 Regression: extractLastJson brace-in-string edge case
 *
 * BUG: The original greedy regex `/\{[\s\S]*\}/` was replaced in v3.6.2 with
 * backward brace counting (extractLastJson). However, the brace counter treated
 * `{` and `}` inside JSON string values as structural, causing failures when
 * the JSON itself contained braces in string fields (e.g. `{"reason": "has } in it"}`).
 *
 * FIX: Replace brace counting with try-parse from each `{` position,
 * using JSON.parse for validation. Handles braces inside strings, nested
 * objects, and multiple JSON blocks correctly.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { extractLastJson } from '../../src/presenter/JudgeChain.js';

describe('Bug #6 — extractLastJson handles braces inside JSON strings', () => {
    // ── Basic extraction ─────────────────────────────────

    it('extracts a simple JSON object from prose', () => {
        const raw = 'Based on analysis: {"safe": true, "reason": "ok"}';
        expect(JSON.parse(extractLastJson(raw)!)).toEqual({ safe: true, reason: 'ok' });
    });

    it('extracts the last JSON when multiple objects are present', () => {
        const raw = 'Here is {"wrong": 1} and then {"safe": false}';
        expect(JSON.parse(extractLastJson(raw)!)).toEqual({ safe: false });
    });

    it('returns null when no JSON is present', () => {
        expect(extractLastJson('Just plain text, no JSON here')).toBeNull();
    });

    it('returns null when no closing brace exists', () => {
        expect(extractLastJson('{"unclosed": true')).toBeNull();
    });

    // ── Braces inside strings (the actual bug) ──────────

    it('handles closing brace inside a string value', () => {
        const raw = '{"reason": "user typed } here", "safe": true}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.safe).toBe(true);
        expect(parsed.reason).toBe('user typed } here');
    });

    it('handles opening brace inside a string value', () => {
        const raw = '{"reason": "user typed { here", "safe": false}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        expect(JSON.parse(result!).safe).toBe(false);
    });

    it('handles both braces inside string values', () => {
        const raw = '{"reason": "between { and } chars", "safe": true}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        expect(JSON.parse(result!).safe).toBe(true);
    });

    // ── Complex nested structures ────────────────────────

    it('extracts nested JSON objects correctly', () => {
        const raw = 'Thinking... {"safe": true, "details": {"score": 0.95, "model": "gpt-4o"}}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.safe).toBe(true);
        expect(parsed.details.score).toBe(0.95);
    });

    it('handles JSON with escaped quotes in strings', () => {
        const raw = '{"reason": "the \\"safe\\" field is ok", "safe": true}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        expect(JSON.parse(result!).safe).toBe(true);
    });

    // ── LLM response patterns ────────────────────────────

    it('handles LLM reasoning with embedded JSON examples before verdict', () => {
        const raw = `I analyzed the content. An example of unsafe content would be {"safe": false, "reason": "harmful"}. However, this content is fine. {"safe": true, "reason": "benign content"}`;
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        const parsed = JSON.parse(result!);
        expect(parsed.safe).toBe(true);
        expect(parsed.reason).toBe('benign content');
    });

    it('extracts correctly when LLM wraps verdict in markdown code fences', () => {
        const raw = 'My analysis:\n```json\n{"safe": true}\n```';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        expect(JSON.parse(result!).safe).toBe(true);
    });

    it('handles empty JSON object', () => {
        const raw = 'Result: {}';
        const result = extractLastJson(raw);
        expect(result).not.toBeNull();
        expect(JSON.parse(result!)).toEqual({});
    });
});
