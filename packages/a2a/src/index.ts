/**
 * @vurb/a2a — A2A Protocol Bridge for Vurb MCP Servers
 *
 * Expose any MCP server as an A2A-compliant agent with automatic
 * Agent Card generation, JSON-RPC task delegation, and structured
 * message exchange — zero protocol knowledge required.
 *
 * @example Quick start
 * ```typescript
 * import { compileAgentCard, A2AHandler, AGENT_CARD_PATH } from '@vurb/a2a';
 *
 * // 1. Compile Agent Card from MCP registry
 * const card = compileAgentCard(
 *     { name: 'billing-agent', version: '1.0.0', url: 'http://localhost:3001' },
 *     registry.getBuilders(),
 * );
 *
 * // 2. Handle A2A JSON-RPC requests
 * const handler = new A2AHandler(executor);
 * const response = await handler.handleRequest(jsonRpcRequest);
 * ```
 *
 * @module
 */

// ── Agent Card Compiler ──────────────────────────────────
export { compileAgentCard } from './AgentCardCompiler.js';
export type {
    AgentCardCompilerConfig,
    A2ABuilderLike,
    A2APromptLike,
    A2AResourceLike,
} from './AgentCardCompiler.js';

// ── Task Manager ─────────────────────────────────────────
export { TaskManager } from './TaskManager.js';
export type { TaskManagerConfig } from './TaskManager.js';

// ── A2A Handler (JSON-RPC dispatch) ──────────────────────
export { A2AHandler, A2A_LIST_TASKS_METHOD, A2A_METHODS_INTERNAL } from './A2AHandler.js';
export type { ToolExecutorLike, A2AHandlerConfig } from './A2AHandler.js';

// ── Streamable HTTP Transport ────────────────────────────
export { StreamableHttpTransport } from './StreamableHttpTransport.js';
export type {
    StreamingExecutorLike,
    SyncTransportResult,
    StreamTransportResult,
    TransportResult,
} from './StreamableHttpTransport.js';

// ── Error Classes ────────────────────────────────────────
export {
    A2AError,
    TaskNotFoundError,
    TaskNotCancelableError,
    PushNotificationNotSupportedError,
    UnsupportedOperationError,
    ContentTypeNotSupportedError,
    InvalidAgentResponseError,
    AuthenticatedExtendedCardNotConfiguredError,
} from './errors.js';

// ── Constants ────────────────────────────────────────────
export {
    AGENT_CARD_PATH,
    AGENT_CARD_PATH_LEGACY,
    A2A_JSON_RPC_PATH,
    A2A_PROTOCOL_VERSION,
    A2A_METHODS,
    A2A_ERROR_CODES,
    HTTP_EXTENSION_HEADER,
} from './constants.js';

// ── SSE Utilities ─────────────────────────────────────
export {
    SSE_HEADERS,
    formatSSEEvent,
    formatSSEErrorEvent,
    parseSseStream,
} from './sse.js';
export type { SseEvent } from './sse.js';

// ── Extensions ────────────────────────────────────────
export { Extensions } from './extensions.js';
export type { ExtensionURI } from './extensions.js';

// ── Types ────────────────────────────────────────────────
export type {
    // Roles & Parts
    A2ARole,
    TextPart,
    FilePart,
    FileWithBytes,
    FileWithUri,
    FileContent,
    DataPart,
    Part,

    // Messages
    Message,

    // Tasks
    TaskState,
    TaskStatus,
    Task,
    Artifact,

    // Streaming
    TaskStatusUpdateEvent,
    TaskArtifactUpdateEvent,
    TaskUpdateEvent,

    // Push Notifications
    PushNotificationAuthenticationInfo,
    PushNotificationConfig,
    AuthenticationInfo,
    TaskPushNotificationConfig,

    // Agent Discovery
    AgentProvider,
    AgentCapabilities,
    AgentExtension,
    AgentSkill,
    AgentInterface,
    TransportProtocol,
    AgentCardSignature,
    AgentCard,

    // Security
    APIKeySecurityScheme,
    HTTPAuthSecurityScheme,
    OAuth2SecurityScheme,
    OpenIdConnectSecurityScheme,
    MutualTlsSecurityScheme,
    SecurityScheme,
    OAuthFlows,
    AuthorizationCodeOAuthFlow,
    ClientCredentialsOAuthFlow,
    ImplicitOAuthFlow,
    PasswordOAuthFlow,

    // JSON-RPC
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcError,

    // Request/Response
    MessageSendParams,
    MessageSendConfiguration,
    SendMessageRequest,
    SendMessageConfiguration,
    TaskQueryParams,
    GetTaskRequest,
    TaskIdParams,
    CancelTaskRequest,
    ListTasksRequest,
    ListTasksResponse,

    // Push Notification Params
    GetTaskPushNotificationConfigParams,
    DeleteTaskPushNotificationConfigParams,

    // Discriminated Request Union
    A2ARequest,
    SendMessageJsonRpcRequest,
    SendStreamingMessageJsonRpcRequest,
    GetTaskJsonRpcRequest,
    CancelTaskJsonRpcRequest,
    TaskResubscriptionJsonRpcRequest,
    SetTaskPushNotificationConfigJsonRpcRequest,
    GetTaskPushNotificationConfigJsonRpcRequest,
    ListTaskPushNotificationConfigJsonRpcRequest,
    DeleteTaskPushNotificationConfigJsonRpcRequest,
    GetAuthenticatedExtendedCardJsonRpcRequest,

    // Bridge Config
    A2ABridgeConfig,
} from './types.js';
