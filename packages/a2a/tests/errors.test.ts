import { describe, it, expect } from 'vitest';
import {
    A2AError,
    TaskNotFoundError,
    TaskNotCancelableError,
    PushNotificationNotSupportedError,
    UnsupportedOperationError,
    ContentTypeNotSupportedError,
    InvalidAgentResponseError,
    AuthenticatedExtendedCardNotConfiguredError,
    A2A_ERROR_CODES,
} from '../src/index.js';

describe('A2A Error Classes', () => {
    const errorMap: Array<[string, typeof A2AError, number, string]> = [
        ['TaskNotFoundError', TaskNotFoundError as never, A2A_ERROR_CODES.TASK_NOT_FOUND, 'Task not found'],
        ['TaskNotCancelableError', TaskNotCancelableError as never, A2A_ERROR_CODES.TASK_NOT_CANCELABLE, 'Task cannot be canceled'],
        ['PushNotificationNotSupportedError', PushNotificationNotSupportedError as never, A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED, 'Push notifications are not supported'],
        ['UnsupportedOperationError', UnsupportedOperationError as never, A2A_ERROR_CODES.UNSUPPORTED_OPERATION, 'This operation is not supported'],
        ['ContentTypeNotSupportedError', ContentTypeNotSupportedError as never, A2A_ERROR_CODES.CONTENT_TYPE_NOT_SUPPORTED, 'Incompatible content types'],
        ['InvalidAgentResponseError', InvalidAgentResponseError as never, A2A_ERROR_CODES.INVALID_AGENT_RESPONSE, 'Invalid agent response type'],
        ['AuthenticatedExtendedCardNotConfiguredError', AuthenticatedExtendedCardNotConfiguredError as never, A2A_ERROR_CODES.AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED, 'Authenticated Extended Card not configured'],
    ];

    describe('instantiation and defaults', () => {
        for (const [name, ErrorClass, code, defaultMsg] of errorMap) {
            it(`${name} has correct code ${code}`, () => {
                const err = new (ErrorClass as new () => A2AError)();
                expect(err.code).toBe(code);
            });

            it(`${name} has default message`, () => {
                const err = new (ErrorClass as new () => A2AError)();
                expect(err.message).toBe(defaultMsg);
            });

            it(`${name} accepts custom message`, () => {
                const err = new (ErrorClass as new (msg?: string) => A2AError)('Custom');
                expect(err.message).toBe('Custom');
            });

            it(`${name} has correct name`, () => {
                const err = new (ErrorClass as new () => A2AError)();
                expect(err.name).toBe(name);
            });

            it(`${name} is instanceof Error`, () => {
                const err = new (ErrorClass as new () => A2AError)();
                expect(err).toBeInstanceOf(Error);
            });

            it(`${name} is instanceof A2AError`, () => {
                const err = new (ErrorClass as new () => A2AError)();
                expect(err).toBeInstanceOf(A2AError);
            });
        }
    });

    describe('toJsonRpcError', () => {
        it('serializes to JSON-RPC error format', () => {
            const err = new TaskNotFoundError('Task xyz not found');
            const rpc = err.toJsonRpcError();

            expect(rpc).toEqual({
                code: -32001,
                message: 'Task xyz not found',
            });
        });

        it('serializes default message', () => {
            const err = new UnsupportedOperationError();
            const rpc = err.toJsonRpcError();

            expect(rpc.code).toBe(-32004);
            expect(rpc.message).toBe('This operation is not supported');
        });
    });

    describe('error code uniqueness', () => {
        it('all error codes are unique', () => {
            const codes = errorMap.map(([, , code]) => code);
            const uniqueCodes = new Set(codes);
            expect(uniqueCodes.size).toBe(codes.length);
        });
    });
});
