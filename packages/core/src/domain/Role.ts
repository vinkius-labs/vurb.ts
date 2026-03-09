/**
 * MCP participant roles.
 *
 * Used in {@link Annotations} to specify the intended audience
 * for a resource.
 *
 * @example
 * ```typescript
 * import { Role, createAnnotations } from '@vurb/core';
 *
 * const annotations = createAnnotations({
 *     audience: [Role.USER, Role.ASSISTANT],
 *     priority: 0.9,
 * });
 * ```
 */
export enum Role {
    /** Human user */
    USER = "USER",
    /** AI assistant */
    ASSISTANT = "ASSISTANT"
}
