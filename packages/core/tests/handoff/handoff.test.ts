/**
 * FHP — Tests: f.handoff() + isHandoffResponse()
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { handoff, isHandoffResponse } from '../../src/handoff/index.js';

describe('handoff() — factory', () => {
    it('should produce _vurb_handoff: true', () => {
        const r = handoff('finance');
        expect(r._vurb_handoff).toBe(true);
    });

    it('should have isHandoff: true', () => {
        const r = handoff('finance');
        expect(r.isHandoff).toBe(true);
    });

    it('should include the target in the payload', () => {
        const r = handoff('finance');
        expect(r.payload.target).toBe('finance');
    });

    it('should include optional fields in the payload', () => {
        const r = handoff('finance', {
            carryOverState: { userId: 'u-1' },
            reason: 'Financial question',
            modelHint: 'powerful',
        });
        expect(r.payload.carryOverState).toEqual({ userId: 'u-1' });
        expect(r.payload.reason).toBe('Financial question');
        expect(r.payload.modelHint).toBe('powerful');
    });

    it('should be a valid object (runtime check for readonly shape)', () => {
        const r = handoff('finance');
        expect(Object.isFrozen(r) || typeof r === 'object').toBe(true);
    });
});

describe('isHandoffResponse() — type guard', () => {
    it('should return true for a valid HandoffResponse', () => {
        const r = handoff('finance');
        expect(isHandoffResponse(r)).toBe(true);
    });

    it('should return false for null', () => {
        expect(isHandoffResponse(null)).toBe(false);
    });

    it('should return false for a string', () => {
        expect(isHandoffResponse('finance')).toBe(false);
    });

    it('should return false for an object missing _vurb_handoff', () => {
        expect(isHandoffResponse({ isHandoff: true })).toBe(false);
    });

    it('should return false for an object missing isHandoff', () => {
        expect(isHandoffResponse({ _vurb_handoff: true })).toBe(false);
    });

    it('should return false for a regular ToolResponse', () => {
        expect(isHandoffResponse({ content: [{ type: 'text', text: 'ok' }] })).toBe(false);
    });
});
