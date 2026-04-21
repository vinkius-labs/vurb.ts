/**
 * AskResponse — Boolean Guards & Fail-Fast .data
 *
 * Tests the AskResponse factory and its behavioral contracts:
 * - Boolean guard correctness (.accepted, .declined, .cancelled)
 * - Fail-fast .data throws on non-accepted responses
 * - Data passthrough on accepted responses
 * - Edge cases: missing fields, undefined action, unexpected actions
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import {
    createAskResponse,
    ElicitationDeclinedError,
} from '../../src/core/elicitation/types.js';

describe('AskResponse — accepted', () => {
    it('sets accepted=true, declined=false, cancelled=false', () => {
        const response = createAskResponse<{ name: string }>({
            action: 'accept',
            content: { name: 'Alice' },
        });

        expect(response.action).toBe('accept');
        expect(response.accepted).toBe(true);
        expect(response.declined).toBe(false);
        expect(response.cancelled).toBe(false);
    });

    it('.data returns submitted content', () => {
        const response = createAskResponse<{ name: string; age: number }>({
            action: 'accept',
            content: { name: 'Alice', age: 30 },
        });

        expect(response.data).toEqual({ name: 'Alice', age: 30 });
    });

    it('.data is stable across multiple accesses', () => {
        const response = createAskResponse<{ x: number }>({
            action: 'accept',
            content: { x: 42 },
        });

        expect(response.data).toBe(response.data);
    });
});

describe('AskResponse — declined', () => {
    it('sets accepted=false, declined=true, cancelled=false', () => {
        const response = createAskResponse<{ name: string }>({
            action: 'decline',
        });

        expect(response.action).toBe('decline');
        expect(response.accepted).toBe(false);
        expect(response.declined).toBe(true);
        expect(response.cancelled).toBe(false);
    });

    it('.data throws ElicitationDeclinedError', () => {
        const response = createAskResponse<{ name: string }>({
            action: 'decline',
        });

        expect(() => response.data).toThrow(ElicitationDeclinedError);
        expect(() => response.data).toThrow(/declined/);
    });

    it('error message is actionable', () => {
        const response = createAskResponse<void>({ action: 'decline' });

        try {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            response.data;
            expect.unreachable('should have thrown');
        } catch (err) {
            expect((err as Error).message).toContain('.declined');
            expect((err as Error).message).toContain('.cancelled');
            expect((err as Error).name).toBe('ElicitationDeclinedError');
        }
    });
});

describe('AskResponse — cancelled', () => {
    it('sets accepted=false, declined=false, cancelled=true', () => {
        const response = createAskResponse<{ name: string }>({
            action: 'cancel',
        });

        expect(response.action).toBe('cancel');
        expect(response.accepted).toBe(false);
        expect(response.declined).toBe(false);
        expect(response.cancelled).toBe(true);
    });

    it('.data throws ElicitationDeclinedError', () => {
        const response = createAskResponse<{ name: string }>({
            action: 'cancel',
        });

        expect(() => response.data).toThrow(ElicitationDeclinedError);
        expect(() => response.data).toThrow(/cancelled/);
    });
});

describe('AskResponse — edge cases', () => {
    it('missing action defaults to "cancel"', () => {
        const response = createAskResponse<void>({});

        expect(response.action).toBe('cancel');
        expect(response.cancelled).toBe(true);
        expect(response.accepted).toBe(false);
        expect(response.declined).toBe(false);
    });

    it('undefined action defaults to "cancel"', () => {
        const response = createAskResponse<void>({ action: undefined });

        expect(response.action).toBe('cancel');
        expect(response.cancelled).toBe(true);
    });

    it('accepted response with undefined content returns undefined data', () => {
        const response = createAskResponse<void>({
            action: 'accept',
            content: undefined,
        });

        expect(response.accepted).toBe(true);
        expect(response.data).toBeUndefined();
    });

    it('accepted response with null content returns null data', () => {
        const response = createAskResponse<null>({
            action: 'accept',
            content: null,
        });

        expect(response.accepted).toBe(true);
        expect(response.data).toBeNull();
    });

    it('unknown action is treated as non-accepted', () => {
        const response = createAskResponse<void>({
            action: 'unknown_action',
        });

        // Not 'accept', 'decline', or 'cancel' — guards should be false for all known ones
        expect(response.accepted).toBe(false);
        expect(response.declined).toBe(false);
        expect(response.cancelled).toBe(false);
        // But .data should still throw because accepted is false
        expect(() => response.data).toThrow(ElicitationDeclinedError);
    });
});
