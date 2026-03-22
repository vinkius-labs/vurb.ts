/**
 * ServerResolver — Chain of Responsibility for MCP Server Detection
 *
 * Resolves an unknown input into a low-level McpServerLike instance
 * using a chain of type-narrowing strategies. Each step either resolves
 * the server or passes to the next resolver.
 *
 * Pure-function module: no state, no side effects.
 */


// ── Types ────────────────────────────────────────────────

/** Minimal duck-typed interface for the low-level MCP Server */
export interface McpServerLike {
    setRequestHandler: (...args: never[]) => void;
}

/** A single resolver in the chain */
type Resolver = (input: unknown) => McpServerLike | undefined;

// ── Type Guards (pure predicates) ────────────────────────

/**
 * Checks `typeof setRequestHandler === 'function'`, not just key presence.
 * A plain property check (`'setRequestHandler' in obj`) accepts any object with
 * a property of that name regardless of type (e.g. `{ setRequestHandler: 42 }`),
 * which then crashes at call time with "setRequestHandler is not a function".
 */
function isMcpServerLike(obj: unknown): obj is McpServerLike {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof (obj as Record<string, unknown>)['setRequestHandler'] === 'function'
    );
}

function hasServerProperty(obj: unknown): obj is { server: unknown } {
    return typeof obj === 'object' && obj !== null && 'server' in obj;
}

// ── Resolver Chain ───────────────────────────────────────

/** Resolve direct Server instance */
const directServerResolver: Resolver = (input) =>
    isMcpServerLike(input) ? input : undefined;

/** Resolve McpServer wrapper (has .server property exposing low-level Server) */
const wrappedServerResolver: Resolver = (input) =>
    hasServerProperty(input) && isMcpServerLike(input.server) ? input.server : undefined;

/** Ordered chain of resolvers — first match wins */
const resolverChain: readonly Resolver[] = [
    directServerResolver,
    wrappedServerResolver,
];

// ── Public API ───────────────────────────────────────────

/**
 * Resolve an unknown server input into a McpServerLike instance.
 *
 * Walks the resolver chain until one succeeds, or throws if none match.
 *
 * @param server - Server or McpServer instance (duck-typed)
 * @returns The resolved low-level Server
 * @throws Error if the input is not a valid server
 */
export function resolveServer(server: unknown): McpServerLike {
    if (server === null || server === undefined || typeof server !== 'object') {
        throw new Error(
            'attachToServer() requires a Server or McpServer instance.',
        );
    }

    for (const resolver of resolverChain) {
        const resolved = resolver(server);
        if (resolved !== undefined) {
            return resolved;
        }
    }

    // Include the received object's own keys in the error message to aid debugging.
    // Knowing which keys the object exposes narrows the problem to
    // "wrong wrapper type" vs "completely wrong argument".
    const receivedKeys = Object.keys(server as object).slice(0, 10).join(', ') || '(none)';
    throw new Error(
        'attachToServer() requires a Server or McpServer instance. ' +
        `The provided object does not have setRequestHandler() as a function. ` +
        `Received keys: [${receivedKeys}]`,
    );
}
