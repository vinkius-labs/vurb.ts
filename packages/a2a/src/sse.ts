/**
 * Server-Sent Events (SSE) utilities for A2A streaming transport.
 *
 * Provides shared formatting and parsing functions for SSE events,
 * matching the official a2a-js SDK's `sse_utils.ts` module.
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module
 */

// ── SSE Headers ──────────────────────────────────────────

/**
 * Standard HTTP headers for Server-Sent Events (SSE) streaming responses.
 * Ensures proper SSE behavior across different proxies and clients.
 */
export const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
} as const;

// ── SSE Event Types ──────────────────────────────────────

/**
 * Represents a parsed SSE event with type and data.
 */
export interface SseEvent {
    readonly type: string;
    readonly data: string;
}

// ── SSE Event Formatting (Server-side) ───────────────────

/**
 * Formats a data event for Server-Sent Events (SSE) protocol.
 * Creates a standard SSE event with JSON-stringified data.
 *
 * @param event - The event data to send (will be JSON stringified)
 * @returns Formatted SSE event string following the SSE specification
 *
 * @example
 * ```ts
 * formatSSEEvent({ kind: 'message', text: 'Hello' });
 * // Returns: "data: {\"kind\":\"message\",\"text\":\"Hello\"}\n\n"
 * ```
 */
export function formatSSEEvent(event: unknown): string {
    return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Formats an error event for Server-Sent Events (SSE) protocol.
 * Error events use the "error" event type to distinguish them from data events,
 * allowing clients to handle errors differently.
 *
 * @param error - The error object (will be JSON stringified)
 * @returns Formatted SSE error event string with custom event type
 *
 * @example
 * ```ts
 * formatSSEErrorEvent({ code: -32603, message: 'Internal error' });
 * // Returns: "event: error\ndata: {\"code\":-32603,\"message\":\"Internal error\"}\n\n"
 * ```
 */
export function formatSSEErrorEvent(error: unknown): string {
    return `event: error\ndata: ${JSON.stringify(error)}\n\n`;
}

// ── SSE Event Parsing (Client-side) ──────────────────────

/**
 * Parses a Server-Sent Events (SSE) stream from a Response object.
 * Yields parsed SSE events as they arrive.
 *
 * @param response - The fetch Response containing an SSE stream
 * @yields SseEvent objects with type and data fields
 *
 * @example
 * ```ts
 * for await (const event of parseSseStream(response)) {
 *   if (event.type === 'error') {
 *     handleError(JSON.parse(event.data));
 *   } else {
 *     handleData(JSON.parse(event.data));
 *   }
 * }
 * ```
 */
export async function* parseSseStream(
    response: Response,
): AsyncGenerator<SseEvent, void, undefined> {
    if (!response.body) {
        throw new Error('SSE response body is undefined. Cannot read stream.');
    }

    let buffer = '';
    let eventType = 'message';
    let eventData = '';

    const stream = response.body.pipeThrough(new TextDecoderStream());

    for await (const value of readFrom(stream)) {
        buffer += value;
        let lineEndIndex: number;

        while ((lineEndIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.substring(0, lineEndIndex).trim();
            buffer = buffer.substring(lineEndIndex + 1);

            if (line === '') {
                if (eventData) {
                    yield { type: eventType, data: eventData };
                    eventData = '';
                    eventType = 'message';
                }
            } else if (line.startsWith('event:')) {
                eventType = line.substring('event:'.length).trim();
            } else if (line.startsWith('data:')) {
                eventData = line.substring('data:'.length).trim();
            }
        }
    }

    // Yield any pending event at stream end
    if (eventData) {
        yield { type: eventType, data: eventData };
    }
}

/**
 * Reads string chunks from a ReadableStream using the reader API.
 * Uses manual reader approach because ReadableStream async iteration
 * is not supported in all environments.
 *
 * @param stream - The ReadableStream to read from
 * @yields String chunks from the stream
 */
async function* readFrom(stream: ReadableStream<string>): AsyncGenerator<string, void, void> {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}
