/**
 * A2A Protocol constants — well-known paths, JSON-RPC methods, error codes.
 *
 * Aligned with the official @a2a-js/sdk constants and error code registry.
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

// ── Well-Known Paths ─────────────────────────────────────

/** Standard agent discovery endpoint (IANA registered). */
export const AGENT_CARD_PATH = '/.well-known/agent-card.json' as const;

/**
 * Legacy agent discovery endpoint (supported for backward compatibility).
 * @deprecated Prefer `AGENT_CARD_PATH` (`/.well-known/agent-card.json`).
 */
export const AGENT_CARD_PATH_LEGACY = '/.well-known/agent.json' as const;

/** Default JSON-RPC endpoint for A2A operations. */
export const A2A_JSON_RPC_PATH = '/a2a' as const;

// ── Protocol Version ─────────────────────────────────────

/** Current A2A protocol version supported by this bridge. */
export const A2A_PROTOCOL_VERSION = '1.0.0' as const;

// ── HTTP Headers ─────────────────────────────────────────

/** Extension header used in HTTP transport. */
export const HTTP_EXTENSION_HEADER = 'X-A2A-Extensions' as const;

// ── JSON-RPC Methods ─────────────────────────────────────

export const A2A_METHODS = {
    /** Send a message and get a synchronous response. */
    MESSAGE_SEND: 'message/send',
    /** Send a message and receive streaming SSE updates. */
    MESSAGE_STREAM: 'message/stream',
    /** Retrieve a task by ID. */
    TASKS_GET: 'tasks/get',
    /** Cancel a running task. */
    TASKS_CANCEL: 'tasks/cancel',
    /** Resume a streaming connection for a task. */
    TASKS_RESUBSCRIBE: 'tasks/resubscribe',
    /** Set push notification configuration for a task. */
    PUSH_NOTIFICATION_SET: 'tasks/pushNotificationConfig/set',
    /** Get push notification configuration for a task. */
    PUSH_NOTIFICATION_GET: 'tasks/pushNotificationConfig/get',
    /** List push notification configurations for a task. */
    PUSH_NOTIFICATION_LIST: 'tasks/pushNotificationConfig/list',
    /** Delete push notification configuration for a task. */
    PUSH_NOTIFICATION_DELETE: 'tasks/pushNotificationConfig/delete',
    /** Fetch the authenticated extended agent card. */
    GET_AUTHENTICATED_EXTENDED_CARD: 'agent/getAuthenticatedExtendedCard',
} as const;

// ── JSON-RPC Error Codes ─────────────────────────────────

export const A2A_ERROR_CODES = {
    // Standard JSON-RPC 2.0
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,

    // A2A-specific (§8.2)
    TASK_NOT_FOUND: -32001,
    TASK_NOT_CANCELABLE: -32002,
    PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
    UNSUPPORTED_OPERATION: -32004,
    CONTENT_TYPE_NOT_SUPPORTED: -32005,
    INVALID_AGENT_RESPONSE: -32006,
    AUTHENTICATED_EXTENDED_CARD_NOT_CONFIGURED: -32007,
} as const;
