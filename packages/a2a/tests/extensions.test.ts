import { describe, it, expect } from 'vitest';
import { Extensions } from '../src/extensions.js';
import type { ExtensionURI } from '../src/extensions.js';

describe('Extensions', () => {
    describe('createFrom', () => {
        it('creates new Extensions from undefined', () => {
            const result = Extensions.createFrom(undefined, 'urn:a2a:ext:test');
            expect(result).toEqual(['urn:a2a:ext:test']);
        });

        it('appends to existing extensions', () => {
            const current: ExtensionURI[] = ['urn:a2a:ext:first'];
            const result = Extensions.createFrom(current, 'urn:a2a:ext:second');
            expect(result).toEqual(['urn:a2a:ext:first', 'urn:a2a:ext:second']);
        });

        it('does not duplicate existing extensions', () => {
            const current: ExtensionURI[] = ['urn:a2a:ext:test'];
            const result = Extensions.createFrom(current, 'urn:a2a:ext:test');
            expect(result).toBe(current); // Same reference
            expect(result).toEqual(['urn:a2a:ext:test']);
        });

        it('preserves original array immutability', () => {
            const current: ExtensionURI[] = ['a'];
            const result = Extensions.createFrom(current, 'b');
            expect(current).toEqual(['a']);
            expect(result).toEqual(['a', 'b']);
        });
    });

    describe('parseServiceParameter', () => {
        it('parses comma-separated extensions', () => {
            const result = Extensions.parseServiceParameter('urn:a,urn:b,urn:c');
            expect(result).toEqual(['urn:a', 'urn:b', 'urn:c']);
        });

        it('trims whitespace', () => {
            const result = Extensions.parseServiceParameter(' urn:a , urn:b ');
            expect(result).toEqual(['urn:a', 'urn:b']);
        });

        it('deduplicates entries', () => {
            const result = Extensions.parseServiceParameter('urn:a,urn:a,urn:b');
            expect(result).toEqual(['urn:a', 'urn:b']);
        });

        it('returns empty array for undefined', () => {
            const result = Extensions.parseServiceParameter(undefined);
            expect(result).toEqual([]);
        });

        it('returns empty array for empty string', () => {
            const result = Extensions.parseServiceParameter('');
            expect(result).toEqual([]);
        });

        it('filters out empty segments', () => {
            const result = Extensions.parseServiceParameter('urn:a,,urn:b,');
            expect(result).toEqual(['urn:a', 'urn:b']);
        });
    });

    describe('toServiceParameter', () => {
        it('converts extensions to comma-separated string', () => {
            const result = Extensions.toServiceParameter(['urn:a', 'urn:b', 'urn:c']);
            expect(result).toBe('urn:a,urn:b,urn:c');
        });

        it('handles single extension', () => {
            const result = Extensions.toServiceParameter(['urn:a']);
            expect(result).toBe('urn:a');
        });

        it('handles empty array', () => {
            const result = Extensions.toServiceParameter([]);
            expect(result).toBe('');
        });

        it('roundtrips with parseServiceParameter', () => {
            const original = ['urn:ext:one', 'urn:ext:two', 'urn:ext:three'];
            const serialized = Extensions.toServiceParameter(original);
            const parsed = Extensions.parseServiceParameter(serialized);
            expect(parsed).toEqual(original);
        });
    });
});
