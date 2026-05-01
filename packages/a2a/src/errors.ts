/**
 * A2A transport-agnostic error classes.
 *
 * These Error subclasses map 1:1 to the A2A specification error codes,
 * enabling typed error handling in both client and server contexts.
 *
 * @see https://a2a-protocol.org/latest/specification/#82-a2a-specific-errors
 * @module
 */

import { A2A_ERROR_CODES } from './constants.js';

// ── Base ─────────────────────────────────────────────────

export abstract class A2AError extends Error {
    abstract readonly code: number;

    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }

    /** Convert to a JSON-RPC error object. */
    toJsonRpcError(): { code: number; message: string } {
        return { code: this.code, message: this.message };
    }
}

// ── A2A-specific errors ──────────────────────────────────

export class TaskNotFoundError extends A2AError {
    readonly code = A2A_ERROR_CODES.TASK_NOT_FOUND;

    constructor(message?: string) {
        super(message ?? 'Task not found');
    }
}

export class TaskNotCancelableError extends A2AError {
    readonly code = A2A_ERROR_CODES.TASK_NOT_CANCELABLE;

    constructor(message?: string) {
        super(message ?? 'Task cannot be canceled');
    }
}

export class PushNotificationNotSupportedError extends A2AError {
    readonly code = A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED;

    constructor(message?: string) {
        super(message ?? 'Push notifications are not supported');
    }
}

export class UnsupportedOperationError extends A2AError {
    readonly code = A2A_ERROR_CODES.UNSUPPORTED_OPERATION;

    constructor(message?: string) {
        super(message ?? 'This operation is not supported');
    }
}

export class ContentTypeNotSupportedError extends A2AError {
    readonly code = A2A_ERROR_CODES.CONTENT_TYPE_NOT_SUPPORTED;

    constructor(message?: string) {
        super(message ?? 'Incompatible content types');
    }
}

export class InvalidAgentResponseError extends A2AError {
    readonly code = A2A_ERROR_CODES.INVALID_AGENT_RESPONSE;

    constructor(message?: string) {
        super(message ?? 'Invalid agent response type');
    }
}

export class AuthenticatedExtendedCardNotConfiguredError extends A2AError {
    readonly code = A2A_ERROR_CODES.AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED;

    constructor(message?: string) {
        super(message ?? 'Authenticated Extended Card not configured');
    }
}
