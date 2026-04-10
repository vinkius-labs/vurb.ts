/**
 * Bug #58 (superseded by brand-based detection) — `isToolResponse` guard.
 *
 * The original shape-based heuristic was vulnerable to false positives
 * from domain objects that coincidentally matched the ToolResponse shape.
 * Now uses `TOOL_RESPONSE_BRAND` symbol stamped by all framework helpers
 * (success/error/toolError/toonSuccess), consistent with BuildPipeline.ts.
 *
 * Manual construction without helpers is explicitly NOT detected —
 * always use the framework response helpers.
 */
import { describe, it, expect } from 'vitest';
import { isToolResponse } from '../../src/presenter/PostProcessor.js';
import { success, error } from '../../src/core/response.js';

describe('isToolResponse brand-based guard', () => {
    it('should accept ToolResponse created via success() helper', () => {
        expect(isToolResponse(success('hello'))).toBe(true);
    });

    it('should accept ToolResponse created via error() helper', () => {
        expect(isToolResponse(error('failed'))).toBe(true);
    });

    it('should accept ToolResponse created via success() with object', () => {
        expect(isToolResponse(success({ id: '123' }))).toBe(true);
    });

    // Manual construction without helpers — now correctly rejected
    it('should reject manually constructed object matching ToolResponse shape', () => {
        expect(isToolResponse({
            content: [{ type: 'text', text: 'hello' }],
        })).toBe(false);
    });

    it('should reject manually constructed object with image content', () => {
        expect(isToolResponse({
            content: [{ type: 'image', data: 'base64...', mimeType: 'image/png' }],
        })).toBe(false);
    });

    it('should reject manually constructed empty content array', () => {
        // Without brand, even empty content arrays are rejected
        expect(isToolResponse({ content: [] })).toBe(false);
    });

    it('should reject content array with items lacking type property', () => {
        expect(isToolResponse({ content: [{ foo: 'bar' }] })).toBe(false);
    });

    it('should reject content array where type is not a string', () => {
        expect(isToolResponse({ content: [{ type: 42 }] })).toBe(false);
    });

    it('should reject content array with null first element', () => {
        expect(isToolResponse({ content: [null] })).toBe(false);
    });

    it('should still reject non-array content', () => {
        expect(isToolResponse({ content: 'string' })).toBe(false);
        expect(isToolResponse({ content: {} })).toBe(false);
    });

    it('should reject manually constructed ToolResponse with isError flag', () => {
        // No brand → not detected, even with isError
        expect(isToolResponse({
            content: [{ type: 'text', text: 'error' }],
            isError: true,
        })).toBe(false);
    });

    it('should reject domain model that happens to have content array', () => {
        const cmsPage = {
            title: 'My Page',
            content: [
                { paragraph: 'Hello world', bold: true },
                { paragraph: 'Second line' },
            ],
        };
        expect(isToolResponse(cmsPage)).toBe(false);
    });
});
