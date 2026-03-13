/**
 * ResourceBuilder — Fluent Builder for MCP Resources
 *
 * Provides a fluent API for defining MCP Resources that expose
 * data to LLMs. Resources can optionally be subscribable, enabling
 * push notifications when data changes.
 *
 * @example
 * ```typescript
 * import { defineResource } from '@vurb/core';
 *
 * const stockPrice = defineResource<AppContext>('stock_price', {
 *     uri: 'stock://prices/{symbol}',
 *     mimeType: 'application/json',
 *     description: 'Real-time stock price for a given symbol',
 *     subscribable: true,
 *     handler: async (uri, ctx) => {
 *         const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
 *         const price = await ctx.stockApi.getPrice(symbol);
 *         return { text: JSON.stringify(price) };
 *     },
 * });
 * ```
 *
 * @see {@link ResourceRegistry} for registration and routing
 * @see {@link SubscriptionManager} for subscription tracking
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/**
 * Content returned by a resource read handler.
 *
 * Mirrors the MCP `ReadResourceResult.contents[0]` shape.
 */
export interface ResourceContent {
    /** Textual content of the resource (UTF-8) */
    readonly text?: string;
    /** Base64-encoded binary content (mutually exclusive with `text`) */
    readonly blob?: string;
}

/**
 * Handler function invoked when a client reads a resource.
 *
 * @param uri - The fully resolved URI requested by the client
 * @param ctx - Application context (from contextFactory)
 * @returns The resource content
 */
export type ResourceHandler<TContext> = (
    uri: string,
    ctx: TContext,
) => ResourceContent | Promise<ResourceContent>;

/**
 * Configuration for defining a resource.
 */
export interface ResourceConfig<TContext> {
    /** URI or URI template (with `{placeholders}`) identifying this resource */
    readonly uri: string;
    /** Human-readable description shown to AI agents */
    readonly description?: string;
    /** MIME type of the resource content */
    readonly mimeType?: string;
    /** Optional tags for filtering */
    readonly tags?: string[];
    /** Whether AI agents can subscribe to push notifications for this resource */
    readonly subscribable?: boolean;
    /**
     * MCP resource annotations for audience, priority, and freshness.
     *
     * @see https://spec.modelcontextprotocol.io/2025-03-26/server/resources/#resource-annotations
     */
    readonly annotations?: {
        readonly audience?: Array<'user' | 'assistant'>;
        readonly priority?: number;
    };
    /** Handler called when a client reads this resource */
    readonly handler: ResourceHandler<TContext>;
}

/**
 * Compiled resource definition for MCP `resources/list`.
 */
export interface McpResourceDef {
    readonly uri: string;
    readonly name: string;
    readonly description?: string;
    readonly mimeType?: string;
    readonly annotations?: {
        readonly audience?: Array<'user' | 'assistant'>;
        readonly priority?: number;
    };
}

// ── Builder Interface ────────────────────────────────────

/**
 * Public interface for a resource builder.
 *
 * Consumed by {@link ResourceRegistry} for registration and routing.
 */
export interface ResourceBuilder<TContext = void> {
    /** Get the resource name (unique identifier) */
    getName(): string;
    /** Get the URI or URI template */
    getUri(): string;
    /** Get optional tags for filtering */
    getTags(): string[];
    /** Whether this resource supports subscriptions */
    isSubscribable(): boolean;
    /** Build the MCP resource definition for `resources/list` */
    buildResourceDefinition(): McpResourceDef;
    /** Read the resource content for a given URI */
    read(uri: string, ctx: TContext): Promise<ResourceContent>;
}

// ── Implementation ───────────────────────────────────────

class ResourceBuilderImpl<TContext> implements ResourceBuilder<TContext> {
    private readonly _name: string;
    private readonly _uri: string;
    private readonly _description: string | undefined;
    private readonly _mimeType: string | undefined;
    private readonly _tags: string[];
    private readonly _subscribable: boolean;
    private readonly _annotations: McpResourceDef['annotations'];
    private readonly _handler: ResourceHandler<TContext>;

    constructor(name: string, config: ResourceConfig<TContext>) {
        this._name = name;
        this._uri = config.uri;
        this._description = config.description;
        this._mimeType = config.mimeType ?? 'application/json';
        this._tags = config.tags ?? [];
        this._subscribable = config.subscribable ?? false;
        this._annotations = config.annotations;
        this._handler = config.handler;
    }

    getName(): string { return this._name; }
    getUri(): string { return this._uri; }
    getTags(): string[] { return this._tags; }
    isSubscribable(): boolean { return this._subscribable; }

    buildResourceDefinition(): McpResourceDef {
        const def: McpResourceDef = {
            uri: this._uri,
            name: this._name,
            ...(this._description ? { description: this._description } : {}),
            ...(this._mimeType ? { mimeType: this._mimeType } : {}),
            ...(this._annotations ? { annotations: this._annotations } : {}),
        };
        return def;
    }

    async read(uri: string, ctx: TContext): Promise<ResourceContent> {
        return this._handler(uri, ctx);
    }
}

// ── Factory ──────────────────────────────────────────────

/**
 * Define a new MCP Resource.
 *
 * @param name - Unique resource name (used as identifier)
 * @param config - Resource configuration
 * @returns A resource builder for registration in {@link ResourceRegistry}
 *
 * @example
 * ```typescript
 * const deployStatus = defineResource<AppContext>('deploy_status', {
 *     uri: 'deploy://status/{environment}',
 *     description: 'Real-time deploy pipeline status',
 *     subscribable: true,
 *     handler: async (uri, ctx) => {
 *         const env = uri.match(/deploy:\/\/status\/(.+)/)?.[1];
 *         const status = await ctx.deployService.getStatus(env);
 *         return { text: JSON.stringify(status) };
 *     },
 * });
 * ```
 */
export function defineResource<TContext = void>(
    name: string,
    config: ResourceConfig<TContext>,
): ResourceBuilder<TContext> {
    return new ResourceBuilderImpl<TContext>(name, config);
}
