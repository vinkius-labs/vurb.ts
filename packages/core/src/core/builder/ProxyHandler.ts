/**
 * ProxyHandler — Standalone factory for `.proxy()` HTTP handlers.
 *
 * Creates handler functions that proxy tool input directly to
 * `ctx.client` HTTP methods. Applies Model aliases via `toApi()`
 * and auto-unwraps `{ data }` response envelopes.
 *
 * @module
 */

import { type Model } from '../../model/defineModel.js';

/** Options for the proxy handler factory */
export interface ProxyOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    unwrap?: boolean;
}

/** HTTP client interface expected on `ctx.client` */
interface HttpClient {
    get: <R>(url: string, params?: Record<string, unknown>) => Promise<R>;
    post: <R>(url: string, body?: unknown) => Promise<R>;
    put: <R>(url: string, body?: unknown) => Promise<R>;
    delete: <R>(url: string, params?: Record<string, unknown>) => Promise<R>;
}

// ── HTTP Method Dispatch Table ───────────────────────────

type Dispatcher = (
    client: HttpClient,
    url: string,
    params: Record<string, unknown>,
) => Promise<unknown>;

const HTTP_DISPATCH: Readonly<Record<'GET' | 'POST' | 'PUT' | 'DELETE', Dispatcher>> = {
    GET:    (client, url, params) => client.get(url, params),
    POST:   (client, url, params) => client.post(url, params),
    PUT:    (client, url, params) => client.put(url, params),
    DELETE: (client, url, params) => client.delete(url, params),
};

/**
 * Create a handler function that proxies to `ctx.client`.
 *
 * @param endpoint - API path with optional `:param` placeholders
 * @param httpMethod - HTTP method to use
 * @param shouldUnwrap - Whether to auto-unwrap `{ data }` envelopes
 * @param modelRef - Optional Model reference for alias resolution
 * @returns Async handler `(input, ctx) => Promise<unknown>`
 */
export function createProxyHandler(
    endpoint: string,
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE',
    shouldUnwrap: boolean,
    modelRef?: Model,
): (input: Record<string, unknown>, ctx: unknown) => Promise<unknown> {
    return async (input: Record<string, unknown>, ctx: unknown) => {
        // Resolve :param placeholders from input values
        let url = endpoint;
        const consumedKeys = new Set<string>();
        url = url.replace(/:([a-zA-Z_]+)/g, (_match, key: string) => {
            if (!(key in input) || input[key] === undefined) {
                throw new Error(
                    `Proxy endpoint "${endpoint}" requires path parameter ":${key}" ` +
                    `but it was not found in the tool input. ` +
                    `Add .withString('${key}', '...') to the tool builder.`,
                );
            }
            consumedKeys.add(key);
            return String(input[key]);
        });

        // Build clean params (strip undefined + consumed path params)
        const raw: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input)) {
            if (v !== undefined && !consumedKeys.has(k)) {
                raw[k] = v;
            }
        }

        // Apply Model aliases (agent-facing → API-facing key renames)
        const params = modelRef ? modelRef.toApi(raw) : raw;

        // Access the HTTP client from context
        const client = (ctx as Record<string, unknown>)['client'] as HttpClient;

        const dispatch = HTTP_DISPATCH[httpMethod];
        const response = await dispatch(client, url, params);

        // Auto-unwrap { data: ... } envelope
        if (shouldUnwrap
            && response !== null
            && typeof response === 'object'
            && 'data' in (response as Record<string, unknown>)
        ) {
            return (response as { data: unknown }).data;
        }

        return response;
    };
}
