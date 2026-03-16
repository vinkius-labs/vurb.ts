/**
 * Presenter Template — MVA View Layer (Egress Firewall)
 * @module
 */

/** Generate `src/presenters/SystemPresenter.ts` */
export function systemPresenterTs(): string {
    return [
        '/**',
        ' * System Presenter — MVA View Layer (Egress Firewall)',
        ' *',
        ' * Defines how the Agent perceives system health data.',
        ' * The Model schema acts as a field whitelist — undeclared',
        ' * fields are physically stripped in RAM before they',
        ' * reach the LLM context window.',
        ' *',
        ' * Features demonstrated:',
        ' * - definePresenter() with Model schema (not raw z.object)',
        ' * - .describe() auto-rules (JIT — travel with data, not in global prompt)',
        ' * - ui.markdown() server-rendered UI blocks',
        ' * - suggestActions() for HATEOAS-style affordances',
        ' */',
        "import { definePresenter, ui } from '@vurb/core';",
        "import { SystemModel } from '../models/SystemModel.js';",
        '',
        'export const SystemPresenter = definePresenter({',
        "    name: 'SystemHealth',",
        '    schema: SystemModel,',
        '    // autoRules: true (default) — .describe() annotations become system rules',
        '    ui: (data) => [',
        '        ui.markdown(',
        '            `\uD83D\uDFE2 **${data.status}** | \u23F1 ${Math.floor(data.uptime)}s | v${data.version}`',
        '        ),',
        '    ],',
        "    suggestActions: (data) => data.status !== 'healthy'",
        "        ? [{ tool: 'system.health', reason: 'Re-check after issue resolution' }]",
        '        : [],',
        '});',
        '',
    ].join('\n');
}
