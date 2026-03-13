/**
 * SubscriptionManager — Push Notification Tracking
 *
 * Tracks which resource URIs are subscribed and routes
 * `notifications/resources/updated` to the MCP transport layer.
 *
 * Designed to be embedded within {@link ResourceRegistry}.
 * Supports both in-process usage (framework) and external
 * delegation (runtime Redis bridge).
 *
 * @see {@link ResourceRegistry} for the public API
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────

/**
 * Notification sink for `notifications/resources/updated`.
 *
 * Set by ServerAttachment to bridge into the MCP transport.
 */
export type ResourceNotificationSink = (uri: string) => void | Promise<void>;

// ── Manager ──────────────────────────────────────────────

export class SubscriptionManager {
    private readonly _subscribed = new Set<string>();
    private _sink?: ResourceNotificationSink;

    /**
     * Subscribe to push notifications for a resource URI.
     *
     * @param uri - The resource URI to subscribe to
     */
    subscribe(uri: string): void {
        this._subscribed.add(uri);
    }

    /**
     * Unsubscribe from push notifications for a resource URI.
     *
     * @param uri - The resource URI to unsubscribe from
     */
    unsubscribe(uri: string): void {
        this._subscribed.delete(uri);
    }

    /**
     * Check if a URI is currently subscribed.
     *
     * @param uri - The URI to check
     */
    isSubscribed(uri: string): boolean {
        return this._subscribed.has(uri);
    }

    /**
     * Get all currently subscribed URIs.
     */
    getSubscriptions(): ReadonlySet<string> {
        return this._subscribed;
    }

    /**
     * Emit a `notifications/resources/updated` for a URI.
     *
     * Only emits if the URI is subscribed AND a sink is configured.
     * Errors in the sink are swallowed (best-effort delivery).
     *
     * @param uri - The URI of the resource that changed
     */
    async notify(uri: string): Promise<void> {
        if (!this._sink || !this._subscribed.has(uri)) return;

        try {
            const result = this._sink(uri);
            if (result instanceof Promise) {
                await result;
            }
        } catch {
            /* best-effort — sink must not break the pipeline */
        }
    }

    /**
     * Set the notification sink.
     *
     * @param sink - Callback that emits the MCP notification
     * @internal
     */
    setSink(sink: ResourceNotificationSink): void {
        this._sink = sink;
    }

    /** Number of active subscriptions. */
    get size(): number { return this._subscribed.size; }

    /** Remove all subscriptions. */
    clear(): void {
        this._subscribed.clear();
    }
}
