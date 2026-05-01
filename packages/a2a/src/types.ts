/**
 * A2A Protocol type definitions — spec-compliant TypeScript interfaces.
 *
 * Aligned with the official a2a-js SDK (a2aproject/a2a-js) JSON-Schema-generated types.
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

// ── Role ─────────────────────────────────────────────────

export type A2ARole = 'user' | 'agent';

// ── Part (discriminated union) ───────────────────────────

export interface TextPart {
    readonly kind: 'text';
    readonly text: string;
    readonly metadata?: Record<string, unknown>;
}

export interface FilePart {
    readonly kind: 'file';
    readonly file: FileWithBytes | FileWithUri;
    readonly metadata?: Record<string, unknown>;
}

export interface FileWithBytes {
    readonly bytes: string;
    readonly mimeType?: string;
    readonly name?: string;
}

export interface FileWithUri {
    readonly uri: string;
    readonly mimeType?: string;
    readonly name?: string;
}

/**
 * @deprecated Use `FileWithBytes | FileWithUri` instead.
 */
export interface FileContent {
    readonly name?: string;
    readonly mimeType?: string;
    readonly bytes?: string;
    readonly uri?: string;
}

export interface DataPart {
    readonly kind: 'data';
    readonly data: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

// ── Message ──────────────────────────────────────────────

export interface Message {
    /** Discriminator — always `'message'`. */
    readonly kind: 'message';
    /** Unique message identifier (typically UUID). Required by spec. */
    readonly messageId: string;
    /** Sender role: `user` or `agent`. */
    readonly role: A2ARole;
    /** Content parts composing the message body. */
    readonly parts: readonly Part[];
    /** Metadata for extensions. Key is extension-specific identifier. */
    readonly metadata?: Record<string, unknown>;
    /** Context identifier for grouping related interactions. */
    readonly contextId?: string;
    /** Task this message belongs to. */
    readonly taskId?: string;
    /** Reference to other task IDs for additional context. */
    readonly referenceTaskIds?: readonly string[];
    /** URIs of extensions relevant to this message. */
    readonly extensions?: readonly string[];
}

// ── TaskState ────────────────────────────────────────────

export type TaskState =
    | 'submitted'
    | 'working'
    | 'input-required'
    | 'completed'
    | 'canceled'
    | 'failed'
    | 'rejected'
    | 'auth-required'
    | 'unknown';

// ── TaskStatus ───────────────────────────────────────────

export interface TaskStatus {
    readonly state: TaskState;
    readonly message?: Message;
    readonly timestamp?: string;
}

// ── Artifact ─────────────────────────────────────────────

export interface Artifact {
    readonly artifactId: string;
    readonly name?: string;
    readonly description?: string;
    readonly parts: readonly Part[];
    readonly metadata?: Record<string, unknown>;
    /** URIs of extensions relevant to this artifact. */
    readonly extensions?: readonly string[];
}

// ── Task ─────────────────────────────────────────────────

export interface Task {
    /** Discriminator — always `'task'`. */
    readonly kind: 'task';
    /** Unique task identifier, server-generated. */
    readonly id: string;
    /** Server-generated context identifier. */
    readonly contextId: string;
    /** Current task status. */
    readonly status: TaskStatus;
    /** Artifacts generated during execution. */
    readonly artifacts?: readonly Artifact[];
    /** Conversation history. */
    readonly history?: readonly Message[];
    /** Extension metadata. */
    readonly metadata?: Record<string, unknown>;
}

// ── Streaming Events ─────────────────────────────────────

export interface TaskStatusUpdateEvent {
    readonly kind: 'status-update';
    readonly taskId: string;
    readonly contextId: string;
    readonly status: TaskStatus;
    readonly final: boolean;
    readonly metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
    readonly kind: 'artifact-update';
    readonly taskId: string;
    readonly contextId: string;
    readonly artifact: Artifact;
    readonly append?: boolean;
    readonly lastChunk?: boolean;
    readonly metadata?: Record<string, unknown>;
}

export type TaskUpdateEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

// ── Push Notification Objects ────────────────────────────

export interface PushNotificationAuthenticationInfo {
    readonly schemes: readonly string[];
    readonly credentials?: string;
}

export interface PushNotificationConfig {
    readonly url: string;
    readonly id?: string;
    readonly token?: string;
    readonly authentication?: PushNotificationAuthenticationInfo;
}

/**
 * @deprecated Use `PushNotificationAuthenticationInfo` instead.
 */
export type AuthenticationInfo = PushNotificationAuthenticationInfo;

export interface TaskPushNotificationConfig {
    readonly taskId: string;
    readonly pushNotificationConfig: PushNotificationConfig;
}

// ── Agent Discovery Objects ──────────────────────────────

export interface AgentProvider {
    /** Organization name. Required. */
    readonly organization: string;
    /** Organization URL. Required per spec. */
    readonly url: string;
}

export interface AgentCapabilities {
    readonly streaming?: boolean;
    readonly pushNotifications?: boolean;
    readonly stateTransitionHistory?: boolean;
    readonly extensions?: readonly AgentExtension[];
}

export interface AgentExtension {
    /** Unique URI identifying the extension. */
    readonly uri: string;
    readonly description?: string;
    readonly required?: boolean;
    readonly params?: Record<string, unknown>;
}

export interface AgentSkill {
    /** Unique skill identifier. */
    readonly id: string;
    /** Human-readable name. */
    readonly name: string;
    /** Skill description. Required per spec. */
    readonly description: string;
    /** Keyword tags. Required per spec (may be empty). */
    readonly tags: readonly string[];
    /** Example prompts or scenarios. */
    readonly examples?: readonly string[];
    /** Supported input MIME types (overrides agent defaults). */
    readonly inputModes?: readonly string[];
    /** Supported output MIME types (overrides agent defaults). */
    readonly outputModes?: readonly string[];
    /** Per-skill security requirements. */
    readonly security?: readonly Record<string, readonly string[]>[];
}

export interface AgentInterface {
    /** Transport protocol (`JSONRPC`, `GRPC`, `HTTP+JSON`). */
    readonly transport: string;
    /** URL where this interface is available. */
    readonly url: string;
}

/** Supported transport protocol identifiers. */
export type TransportProtocol = 'JSONRPC' | 'GRPC' | 'HTTP+JSON';

export interface AgentCardSignature {
    readonly protected: string;
    readonly signature: string;
    readonly header?: Record<string, unknown>;
}

export interface AgentCard {
    /** Agent name. Required. */
    readonly name: string;
    /** Agent description. Required per spec. */
    readonly description: string;
    /** Preferred endpoint URL. Required. */
    readonly url: string;
    /** Agent version. Required. */
    readonly version: string;
    /** A2A protocol version. Required. */
    readonly protocolVersion: string;
    /** Agent capabilities. Required. */
    readonly capabilities: AgentCapabilities;
    /** Agent skills. Required (may be empty). */
    readonly skills: readonly AgentSkill[];
    /** Default input MIME types. Required. */
    readonly defaultInputModes: readonly string[];
    /** Default output MIME types. Required. */
    readonly defaultOutputModes: readonly string[];
    /** Service provider. */
    readonly provider?: AgentProvider;
    /** Security schemes declaration (OpenAPI 3.0). */
    readonly securitySchemes?: Record<string, SecurityScheme>;
    /** Security requirements (OR of ANDs). */
    readonly security?: readonly Record<string, readonly string[]>[];
    /** JWS signatures for card integrity. */
    readonly signatures?: readonly AgentCardSignature[];
    /** Supports authenticated extended card endpoint. */
    readonly supportsAuthenticatedExtendedCard?: boolean;
    /** Preferred transport for the main URL. */
    readonly preferredTransport?: TransportProtocol;
    /** Additional transport interfaces. */
    readonly additionalInterfaces?: readonly AgentInterface[];
    /** Agent documentation URL. */
    readonly documentationUrl?: string;
    /** Agent icon URL. */
    readonly iconUrl?: string;
}

// ── Security Objects (OpenAPI 3.0) ───────────────────────

export interface APIKeySecurityScheme {
    readonly type: 'apiKey';
    readonly name: string;
    readonly in: 'header' | 'query' | 'cookie';
    readonly description?: string;
}

export interface HTTPAuthSecurityScheme {
    readonly type: 'http';
    readonly scheme: string;
    readonly bearerFormat?: string;
    readonly description?: string;
}

export interface OAuth2SecurityScheme {
    readonly type: 'oauth2';
    readonly flows: OAuthFlows;
    readonly description?: string;
    readonly oauth2MetadataUrl?: string;
}

export interface OpenIdConnectSecurityScheme {
    readonly type: 'openIdConnect';
    readonly openIdConnectUrl: string;
    readonly description?: string;
}

export interface MutualTlsSecurityScheme {
    readonly type: 'mutualTLS';
    readonly description?: string;
}

export type SecurityScheme =
    | APIKeySecurityScheme
    | HTTPAuthSecurityScheme
    | OAuth2SecurityScheme
    | OpenIdConnectSecurityScheme
    | MutualTlsSecurityScheme;

export interface OAuthFlows {
    readonly authorizationCode?: AuthorizationCodeOAuthFlow;
    readonly clientCredentials?: ClientCredentialsOAuthFlow;
    readonly implicit?: ImplicitOAuthFlow;
    readonly password?: PasswordOAuthFlow;
}

export interface AuthorizationCodeOAuthFlow {
    readonly authorizationUrl: string;
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Record<string, string>;
}

export interface ClientCredentialsOAuthFlow {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Record<string, string>;
}

export interface ImplicitOAuthFlow {
    readonly authorizationUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Record<string, string>;
}

export interface PasswordOAuthFlow {
    readonly tokenUrl: string;
    readonly refreshUrl?: string;
    readonly scopes: Record<string, string>;
}

// ── JSON-RPC 2.0 ─────────────────────────────────────────

export interface JsonRpcRequest {
    readonly jsonrpc: '2.0';
    readonly id: string | number;
    readonly method: string;
    readonly params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
    readonly jsonrpc: '2.0';
    readonly id: string | number | null;
    readonly result?: T;
    readonly error?: JsonRpcError;
}

export interface JsonRpcError {
    readonly code: number;
    readonly message: string;
    readonly data?: Record<string, unknown>;
}

// ── A2A Request Parameters ───────────────────────────────

export interface MessageSendParams {
    readonly message: Message;
    readonly configuration?: MessageSendConfiguration;
    readonly metadata?: Record<string, unknown>;
}

/** @deprecated Use `MessageSendParams` instead. */
export type SendMessageRequest = MessageSendParams;

export interface MessageSendConfiguration {
    readonly acceptedOutputModes?: readonly string[];
    readonly historyLength?: number;
    readonly pushNotificationConfig?: PushNotificationConfig;
    readonly blocking?: boolean;
}

/** @deprecated Use `MessageSendConfiguration` instead. */
export type SendMessageConfiguration = MessageSendConfiguration;

export interface TaskQueryParams {
    readonly id: string;
    readonly historyLength?: number;
    readonly metadata?: Record<string, unknown>;
}

/** @deprecated Use `TaskQueryParams` instead. */
export type GetTaskRequest = TaskQueryParams;

export interface TaskIdParams {
    readonly id: string;
    readonly metadata?: Record<string, unknown>;
}

/** @deprecated Use `TaskIdParams` instead. */
export type CancelTaskRequest = TaskIdParams;

export interface ListTasksRequest {
    readonly contextId?: string;
    readonly taskState?: TaskState;
    readonly cursor?: string;
    readonly limit?: number;
}

export interface ListTasksResponse {
    readonly tasks: readonly Task[];
    readonly nextCursor?: string;
}

export interface GetTaskPushNotificationConfigParams {
    readonly id: string;
    readonly metadata?: Record<string, unknown>;
    /** Filter to a specific push notification configuration. */
    readonly pushNotificationConfigId?: string;
}

export interface DeleteTaskPushNotificationConfigParams {
    readonly id: string;
    readonly metadata?: Record<string, unknown>;
    /** ID of the push notification configuration to delete. Required. */
    readonly pushNotificationConfigId: string;
}

// ── Discriminated Request Union ──────────────────────────

/**
 * Discriminated union of all A2A JSON-RPC 2.0 request types.
 * Uses `Omit` + intersection to correctly narrow `method` and `params`
 * without running into TS2430 (readonly interfaces vs index signatures).
 */
export type SendMessageJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'message/send';
    readonly params: MessageSendParams;
};

export type SendStreamingMessageJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'message/stream';
    readonly params: MessageSendParams;
};

export type GetTaskJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/get';
    readonly params: TaskQueryParams;
};

export type CancelTaskJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/cancel';
    readonly params: TaskIdParams;
};

export type TaskResubscriptionJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/resubscribe';
    readonly params: TaskIdParams;
};

export type SetTaskPushNotificationConfigJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/pushNotificationConfig/set';
    readonly params: TaskPushNotificationConfig;
};

export type GetTaskPushNotificationConfigJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/pushNotificationConfig/get';
    readonly params: GetTaskPushNotificationConfigParams;
};

export type ListTaskPushNotificationConfigJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/pushNotificationConfig/list';
    readonly params: TaskIdParams;
};

export type DeleteTaskPushNotificationConfigJsonRpcRequest = Omit<JsonRpcRequest, 'method' | 'params'> & {
    readonly method: 'tasks/pushNotificationConfig/delete';
    readonly params: DeleteTaskPushNotificationConfigParams;
};

export type GetAuthenticatedExtendedCardJsonRpcRequest = Omit<JsonRpcRequest, 'method'> & {
    readonly method: 'agent/getAuthenticatedExtendedCard';
};

/**
 * Discriminated union of all possible A2A JSON-RPC 2.0 requests.
 * Aligns with the official `A2ARequest` type from the a2a-js SDK.
 */
export type A2ARequest =
    | SendMessageJsonRpcRequest
    | SendStreamingMessageJsonRpcRequest
    | GetTaskJsonRpcRequest
    | CancelTaskJsonRpcRequest
    | TaskResubscriptionJsonRpcRequest
    | SetTaskPushNotificationConfigJsonRpcRequest
    | GetTaskPushNotificationConfigJsonRpcRequest
    | ListTaskPushNotificationConfigJsonRpcRequest
    | DeleteTaskPushNotificationConfigJsonRpcRequest
    | GetAuthenticatedExtendedCardJsonRpcRequest;

// ── Bridge Configuration ─────────────────────────────────

/**
 * Configuration for the A2A bridge.
 * Passed to `startServer({ a2a: ... })`.
 */
export interface A2ABridgeConfig {
    /** Agent display name override (defaults to server name). */
    readonly name?: string;
    /** Agent description (required for spec compliance). */
    readonly description?: string;
    /** Publicly reachable URL of this agent. */
    readonly url?: string;
    /** Agent version override (defaults to server version). */
    readonly version?: string;
    /** Provider information. */
    readonly provider?: AgentProvider;
    /** Security schemes for authentication. */
    readonly securitySchemes?: Record<string, SecurityScheme>;
    /** Security requirements. */
    readonly security?: readonly Record<string, readonly string[]>[];
    /** Task TTL in milliseconds (default: 3600000 = 1h). */
    readonly taskTtlMs?: number;
    /** Maximum stored tasks (default: 10000). */
    readonly maxTasks?: number;
    /** Agent documentation URL. */
    readonly documentationUrl?: string;
    /** Agent icon URL. */
    readonly iconUrl?: string;
}
