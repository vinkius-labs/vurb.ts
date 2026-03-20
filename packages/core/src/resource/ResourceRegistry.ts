/**
 * ResourceRegistry — Centralized Resource Registration & Routing
 *
 * The single place where all resource builders are registered and where
 * incoming `resources/list`, `resources/read`, `resources/subscribe`,
 * and `resources/unsubscribe` requests are routed.
 *
 * Mirrors the design of {@link PromptRegistry} with resource-specific features:
 * - O(1) routing via Map lookup
 * - URI template matching for dynamic resources
 * - Subscription tracking via {@link SubscriptionManager}
 * - Lifecycle sync via `notifyChanged()` (→ `notifications/resources/list_changed`)
 *
 * @example
 * ```typescript
 * import { ResourceRegistry, defineResource } from '@vurb/core';
 *
 * const resourceRegistry = new ResourceRegistry<AppContext>();
 * resourceRegistry.register(stockPrice);
 * resourceRegistry.register(deployStatus);
 *
 * registry.attachToServer(server, {
 *     contextFactory: createContext,
 *     resources: resourceRegistry,
 * });
 * ```
 *
 * @see {@link defineResource} for creating resource builders
 * @see {@link SubscriptionManager} for push notification tracking
 *
 * @module
 */
import { type ResourceBuilder, type McpResourceDef } from './ResourceBuilder.js';
import { SubscriptionManager, type ResourceNotificationSink } from './SubscriptionManager.js';

// ── Types ────────────────────────────────────────────────

/** Callback for sending `notifications/resources/list_changed`. */
export type ResourceListChangedSink = () => void;

// ── Registry ─────────────────────────────────────────────

export class ResourceRegistry<TContext = void> {
    private readonly _builders = new Map<string, ResourceBuilder<TContext>>();
    private readonly _subscriptions = new SubscriptionManager();
    private _listChangedSink?: ResourceListChangedSink;
    private _notifyDebounceTimer: ReturnType<typeof setTimeout> | undefined;

    // ── Registration ─────────────────────────────────────

    /**
     * Register a single resource builder.
     *
     * @param builder - A resource builder (from `defineResource()`)
     * @throws If a resource with the same name is already registered
     */
    register(builder: ResourceBuilder<TContext>): void {
        const name = builder.getName();
        if (this._builders.has(name)) {
            throw new Error(`Resource "${name}" is already registered.`);
        }
        this._builders.set(name, builder);
    }

    /**
     * Register multiple resource builders at once.
     */
    registerAll(...builders: ResourceBuilder<TContext>[]): void {
        for (const builder of builders) {
            this.register(builder);
        }
    }

    // ── List & Read (MCP protocol) ───────────────────────

    /**
     * Get all registered MCP Resource definitions for `resources/list`.
     *
     * Returns compiled resource metadata including URIs, descriptions,
     * MIME types, and annotations.
     */
    listResources(): McpResourceDef[] {
        const resources: McpResourceDef[] = [];
        for (const builder of this._builders.values()) {
            resources.push(builder.buildResourceDefinition());
        }
        return resources;
    }

    /**
     * Read a resource by URI for `resources/read`.
     *
     * Matches the requested URI against registered resource URI templates.
     * Returns the resource content or throws if no matching resource is found.
     *
     * @param uri - The URI requested by the client
     * @param ctx - Application context (from contextFactory)
     * @returns MCP-compatible resource read result
     */
    async readResource(
        uri: string,
        ctx: TContext,
    ): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
        const builder = this._findByUri(uri);
        if (!builder) {
            return { contents: [] };
        }

        const content = await builder.read(uri, ctx);
        const def = builder.buildResourceDefinition();

        return {
            contents: [{
                uri,
                ...(def.mimeType ? { mimeType: def.mimeType } : {}),
                ...(content.text !== undefined ? { text: content.text } : {}),
                ...(content.blob !== undefined ? { blob: content.blob } : {}),
            }],
        };
    }

    // ── Subscription Management ──────────────────────────

    /**
     * Subscribe to push notifications for a resource URI.
     *
     * Only succeeds if the resource is marked as `subscribable`.
     *
     * @param uri - The resource URI to subscribe to
     * @returns `true` if subscription was accepted, `false` if resource is not subscribable
     */
    subscribe(uri: string): boolean {
        const builder = this._findByUri(uri);
        if (!builder || !builder.isSubscribable()) {
            return false;
        }
        this._subscriptions.subscribe(uri);
        return true;
    }

    /**
     * Unsubscribe from push notifications for a resource URI.
     *
     * @param uri - The resource URI to unsubscribe from
     */
    unsubscribe(uri: string): void {
        this._subscriptions.unsubscribe(uri);
    }

    /**
     * Emit a resource update notification to subscribed clients.
     *
     * Only emits if the URI is subscribed. Uses the subscription manager's
     * notification sink (wired by ServerAttachment).
     *
     * @param uri - The URI of the resource that changed
     */
    async notifyUpdated(uri: string): Promise<void> {
        await this._subscriptions.notify(uri);
    }

    /**
     * Set the notification sink for `notifications/resources/updated`.
     *
     * Called by ServerAttachment when wiring the registry to the MCP server.
     *
     * @internal
     */
    setNotificationSink(sink: ResourceNotificationSink): void {
        this._subscriptions.setSink(sink);
    }

    // ── Lifecycle Sync ───────────────────────────────────

    /**
     * Set the sink for `notifications/resources/list_changed`.
     *
     * @internal — Called by ServerAttachment
     */
    setListChangedSink(sink: ResourceListChangedSink): void {
        this._listChangedSink = sink;
    }

    /**
     * Notify all connected clients that the resource catalog has changed.
     *
     * Sends `notifications/resources/list_changed`. Debounced: multiple
     * calls within 100ms are coalesced into one notification.
     */
    notifyChanged(): void {
        if (!this._listChangedSink) return;

        if (this._notifyDebounceTimer !== undefined) {
            clearTimeout(this._notifyDebounceTimer);
        }

        const sink = this._listChangedSink;
        this._notifyDebounceTimer = setTimeout(() => {
            sink();
            this._notifyDebounceTimer = undefined;
        }, 100);
    }

    // ── Query ────────────────────────────────────────────

    /** Check if a resource with the given name is registered. */
    has(name: string): boolean { return this._builders.has(name); }

    /** Number of registered resources. */
    get size(): number { return this._builders.size; }

    /** Whether any registered resource supports subscriptions. */
    get hasSubscribableResources(): boolean {
        for (const builder of this._builders.values()) {
            if (builder.isSubscribable()) return true;
        }
        return false;
    }

    /** Get the subscription manager (for testing and advanced wiring). */
    get subscriptions(): SubscriptionManager {
        return this._subscriptions;
    }

    /** Remove all registered resources and cancel pending timers. */
    clear(): void {
        this._builders.clear();
        this._subscriptions.clear();
        if (this._notifyDebounceTimer !== undefined) {
            clearTimeout(this._notifyDebounceTimer);
            this._notifyDebounceTimer = undefined;
        }
    }

    // ── Private ──────────────────────────────────────────

    /**
     * Find a builder by exact URI match or template match.
     *
     * First tries exact match (O(1) via Map lookup on URI).
     * Falls back to template matching (O(n) scan, but n is tiny).
     */
    private _findByUri(uri: string): ResourceBuilder<TContext> | undefined {
        // Fast path: exact URI match
        for (const builder of this._builders.values()) {
            if (builder.getUri() === uri) return builder;
        }

        // Slow path: URI template matching
        for (const builder of this._builders.values()) {
            if (this._matchesTemplate(builder.getUri(), uri)) return builder;
        }

        return undefined;
    }

    /**
     * Check if a URI matches a template pattern.
     *
     * Template: `stock://prices/{symbol}` matches `stock://prices/AAPL`
     *
     * Bug #5 fix: Escapes regex metacharacters in static segments
     * to prevent `.`, `+`, `*` etc. from being interpreted as regex syntax.
     */
    private _matchesTemplate(template: string, uri: string): boolean {
        // Split at {placeholder} boundaries, escape each static segment,
        // then rejoin with capture groups.
        const segments = template.split(/\{[^}]+\}/);
        const escaped = segments.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regexStr = escaped.join('([^/]+)');
        const regex = new RegExp(`^${regexStr}$`);
        return regex.test(uri);
    }
}
