/**
 * Federated Handoff Protocol — Zero-Trust Middleware
 *
 * Middleware para micro-servidores upstream.
 * Rejeita qualquer pedido sem um token de delegação HMAC válido
 * emitido por um SwarmGateway autorizado.
 *
 * @example
 * ```typescript
 * import { requireGatewayClearance } from '@vurb/core';
 *
 * export const refund = f.tool('finance.refund')
 *     .use(requireGatewayClearance(process.env.VURB_DELEGATION_SECRET!))
 *     .withString('invoiceId', 'Invoice ID')
 *     .handle(async (input, ctx) => {
 *         // ctx.handoffState       — carry-over state from the gateway
 *         // ctx.handoffScope       — delegation scope (e.g. 'finance')
 *         // ctx.handoffTid         — transaction ID for tracing
 *         // ctx.handoffTraceparent — W3C traceparent, if present
 *         return success(await stripe.refund(input.invoiceId));
 *     });
 * ```
 *
 * @module
 */
import { verifyDelegationToken, HandoffAuthError } from './DelegationToken.js';
import type { HandoffStateStore } from './index.js';

// ============================================================================
// Context extension
// ============================================================================

/**
 * Properties injected into the handler context by `requireGatewayClearance`.
 *
 * Merge with your own context type via intersection:
 * ```typescript
 * type AppContext = BaseContext & GatewayClearanceContext;
 * ```
 */
export interface GatewayClearanceContext {
    /** Carry-over state from the gateway (inline or hydrated via Claim-Check). */
    handoffState: Record<string, unknown>;
    /** Delegation scope — the `sub` claim of the token (e.g. `'finance'`). */
    handoffScope: string;
    /** Transaction ID for distributed tracing (correlates with gateway spans). */
    handoffTid: string;
    /** W3C traceparent header, if present in the token. */
    handoffTraceparent?: string;
}

// ============================================================================
// Middleware factory
// ============================================================================

/**
 * Zero-trust middleware que valida o token de delegação HMAC.
 *
 * Lê o header `x-vurb-delegation` do `extra` do pedido MCP,
 * verifica a assinatura HMAC-SHA256 e o TTL, e injeta
 * {@link GatewayClearanceContext} no contexto do handler.
 *
 * @param secret - Segredo HMAC partilhado entre o gateway e o micro-servidor.
 *                 Deve corresponder a `SwarmGatewayConfig.delegationSecret`.
 * @param store  - Store opcional para hidratação do Claim-Check (necessário quando
 *                 `carryOverState` pode exceder 2 KB).
 *
 * @throws {@link HandoffAuthError} — traduzido para erro `FORBIDDEN` pelo framework
 *         se não for capturado pelo handler.
 */
export function requireGatewayClearance(
    secret: string,
    store?: HandoffStateStore,
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) {
    return async (ctx: unknown): Promise<GatewayClearanceContext> => {
        const raw = extractDelegationHeader(ctx);

        if (!raw) {
            throw new HandoffAuthError(
                'MISSING_DELEGATION_TOKEN',
                'This tool requires a delegation token from the SwarmGateway. ' +
                'Direct access without a gateway is not permitted.',
            );
        }

        let claims;
        try {
            claims = await verifyDelegationToken(raw, secret, store);
        } catch (err) {
            if (err instanceof HandoffAuthError) throw err;
            throw new HandoffAuthError(
                'INVALID_DELEGATION_TOKEN',
                `Invalid token: ${(err as Error).message}`,
            );
        }

        return {
            handoffState:  claims.state ?? {},
            handoffScope:  claims.sub,
            handoffTid:    claims.tid,
            ...(claims.traceparent ? { handoffTraceparent: claims.traceparent } : {}),
        } as GatewayClearanceContext;
    };
}

// ============================================================================
// Header extraction — duck-typed, transport-agnostic
// ============================================================================

/**
 * Extract the delegation header value from the MCP handler context.
 * Header lookup is case-insensitive (HTTP/1.1 RFC 7230 §3.2).
 *
 * HTTP proxies (nginx, Cloudflare, AWS ALB) may normalize headers to
 * Title-Case (`X-Vurb-Delegation`) or strip them. A case-insensitive scan
 * with `toLowerCase()` ensures the token is found regardless of normalization.
 */
function extractDelegationHeader(ctx: unknown): string | undefined {
    if (!ctx || typeof ctx !== 'object') return undefined;
    const c = ctx as Record<string, unknown>;

    // MCP SDK extra: extra.requestInfo.headers['x-vurb-delegation']
    const requestInfo = c['requestInfo'];
    if (requestInfo && typeof requestInfo === 'object') {
        const h = (requestInfo as Record<string, unknown>)['headers'];
        const val = findHeaderCaseInsensitive(h, 'x-vurb-delegation');
        if (val !== undefined) return val;
    }

    // Fallback: ctx.headers (plain HTTP / custom transports)
    const val = findHeaderCaseInsensitive(c['headers'], 'x-vurb-delegation');
    if (val !== undefined) return val;

    return undefined;
}

/**
 * Case-insensitive lookup of `headerName` in a headers map.
 * Returns the value as a string if found, or `undefined`.
 */
function findHeaderCaseInsensitive(
    headers: unknown,
    headerName: string,
): string | undefined {
    if (!headers || typeof headers !== 'object') return undefined;
    const h = headers as Record<string, unknown>;
    const lower = headerName.toLowerCase();
    // Fast path: exact key (most common — MCP SDK always uses lowercase)
    if (typeof h[lower] === 'string') return h[lower] as string;
    // Slow path: scan all keys case-insensitively (proxy-normalized headers)
    for (const key of Object.keys(h)) {
        if (key.toLowerCase() === lower && typeof h[key] === 'string') {
            return h[key] as string;
        }
    }
    return undefined;
}
