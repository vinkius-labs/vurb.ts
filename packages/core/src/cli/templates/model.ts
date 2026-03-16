/**
 * Model Template — MVA Domain Layer (defineModel)
 * @module
 */

/** Generate `src/models/SystemModel.ts` */
export function systemModelTs(): string {
    return `/**
 * System Model — MVA Domain Layer (defineModel)
 *
 * Defines the shape of system health data using defineModel().
 * The Model provides:
 * - Field types with m.string(), m.number(), etc.
 * - .describe() annotations that become JIT system rules
 * - Validation and casting for the domain entity
 *
 * The Presenter references this Model instead of raw z.object(),
 * keeping a single source of truth for the data shape.
 */
import { defineModel } from '@vurb/core';

export const SystemModel = defineModel('SystemHealth', m => {
    m.casts({
        status:    m.string('Server operational status'),
        uptime:    m.number('Uptime in seconds since process start'),
        version:   m.string('Server version string'),
        timestamp: m.string('ISO 8601 timestamp of this check'),
    });
});
`;
}
