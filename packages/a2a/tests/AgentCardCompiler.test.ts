import { describe, it, expect } from 'vitest';
import { compileAgentCard, type A2ABuilderLike, type A2APromptLike, type A2AResourceLike } from '../src/index.js';
import { A2A_PROTOCOL_VERSION } from '../src/constants.js';

// ── Test Fixtures ────────────────────────────────────────

function makeBuilder(
    name: string,
    description?: string,
    tags?: readonly string[],
): A2ABuilderLike {
    return {
        getName: () => name,
        buildToolDefinition: () => (description ? { description } : {}),
        getTags: tags ? () => tags : undefined,
    };
}

const BASE_CONFIG = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'http://localhost:3001',
};

// ── Tests ────────────────────────────────────────────────

describe('AgentCardCompiler', () => {
    describe('compileAgentCard — basic compilation', () => {
        it('compiles a minimal card with empty skills array', () => {
            const card = compileAgentCard(BASE_CONFIG, []);

            expect(card.name).toBe('test-agent');
            expect(card.version).toBe('1.0.0');
            expect(card.url).toBe('http://localhost:3001');
            expect(card.protocolVersion).toBe(A2A_PROTOCOL_VERSION);
            expect(card.skills).toEqual([]);
        });

        it('always includes a description (default generated)', () => {
            const card = compileAgentCard(BASE_CONFIG, []);
            expect(card.description).toContain('test-agent');
        });

        it('includes capabilities with streaming enabled', () => {
            const card = compileAgentCard(BASE_CONFIG, []);

            expect(card.capabilities.streaming).toBe(true);
            expect(card.capabilities.pushNotifications).toBe(false);
            expect(card.capabilities.stateTransitionHistory).toBe(true);
        });

        it('includes default input/output modes', () => {
            const card = compileAgentCard(BASE_CONFIG, []);

            expect(card.defaultInputModes).toContain('application/json');
            expect(card.defaultInputModes).toContain('text/plain');
            expect(card.defaultOutputModes).toContain('application/json');
            expect(card.defaultOutputModes).toContain('text/plain');
        });

        it('includes additionalInterfaces with JSONRPC transport', () => {
            const card = compileAgentCard(BASE_CONFIG, []);

            expect(card.additionalInterfaces).toHaveLength(1);
            expect(card.additionalInterfaces![0].transport).toBe('JSONRPC');
            expect(card.additionalInterfaces![0].url).toBe('http://localhost:3001');
        });
    });

    describe('compileAgentCard — tool → skill mapping', () => {
        it('maps a single tool to a skill', () => {
            const builders = [makeBuilder('billing.create-invoice', 'Creates an invoice')];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills).toHaveLength(1);
            expect(card.skills[0].id).toBe('billing.create-invoice');
            expect(card.skills[0].name).toBe('billing.create-invoice');
            expect(card.skills[0].description).toBe('Creates an invoice');
        });

        it('maps multiple tools to skills preserving order', () => {
            const builders = [
                makeBuilder('alpha', 'First'),
                makeBuilder('beta', 'Second'),
                makeBuilder('gamma', 'Third'),
            ];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills).toHaveLength(3);
            expect(card.skills.map((s) => s.id)).toEqual(['alpha', 'beta', 'gamma']);
        });

        it('preserves tags from builders', () => {
            const builders = [makeBuilder('crm.contacts', 'Contacts', ['crm', 'contacts'])];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills[0].tags).toEqual(['crm', 'contacts']);
        });

        it('provides default tags when builder has no getTags', () => {
            const builder: A2ABuilderLike = {
                getName: () => 'plain-tool',
                buildToolDefinition: () => ({ description: 'No tags' }),
            };
            const card = compileAgentCard(BASE_CONFIG, [builder]);

            expect(card.skills[0].tags).toEqual(['tool']);
        });

        it('sets inputModes and outputModes for tools', () => {
            const card = compileAgentCard(BASE_CONFIG, [makeBuilder('tool-a', 'A tool')]);

            expect(card.skills[0].inputModes).toEqual(['application/json']);
            expect(card.skills[0].outputModes).toEqual(['application/json']);
        });

        it('handles builder with null buildToolDefinition', () => {
            const builder: A2ABuilderLike = {
                getName: () => 'null-def',
                buildToolDefinition: () => null,
            };
            const card = compileAgentCard(BASE_CONFIG, [builder]);

            expect(card.skills).toHaveLength(1);
            expect(card.skills[0].description).toContain('null-def');
        });

        it('handles builder with undefined buildToolDefinition', () => {
            const builder: A2ABuilderLike = {
                getName: () => 'undef-def',
                buildToolDefinition: () => undefined,
            };
            const card = compileAgentCard(BASE_CONFIG, [builder]);

            expect(card.skills).toHaveLength(1);
            expect(card.skills[0].description).toContain('undef-def');
        });

        it('generates default description for tool without description', () => {
            const builder: A2ABuilderLike = {
                getName: () => 'silent-tool',
                buildToolDefinition: () => ({}),
            };
            const card = compileAgentCard(BASE_CONFIG, [builder]);

            expect(card.skills[0].description).toBe('Executes the silent-tool operation.');
        });
    });

    describe('compileAgentCard — prompt → skill mapping', () => {
        it('maps prompts to skills with prompt: prefix', () => {
            const prompts: A2APromptLike[] = [
                { name: 'code-review', description: 'Review code for best practices' },
            ];
            const card = compileAgentCard(BASE_CONFIG, [], prompts);

            expect(card.skills).toHaveLength(1);
            expect(card.skills[0].id).toBe('prompt:code-review');
            expect(card.skills[0].tags).toEqual(['prompt']);
        });

        it('sets text/plain modes for prompts', () => {
            const prompts: A2APromptLike[] = [{ name: 'summarize' }];
            const card = compileAgentCard(BASE_CONFIG, [], prompts);

            expect(card.skills[0].inputModes).toEqual(['text/plain']);
            expect(card.skills[0].outputModes).toEqual(['text/plain']);
        });

        it('generates default description for prompt without description', () => {
            const prompts: A2APromptLike[] = [{ name: 'summarize' }];
            const card = compileAgentCard(BASE_CONFIG, [], prompts);

            expect(card.skills[0].description).toBe('Executes the summarize prompt.');
        });
    });

    describe('compileAgentCard — resource → skill mapping', () => {
        it('maps resources to skills with resource: prefix', () => {
            const resources: A2AResourceLike[] = [
                { name: 'docs', description: 'Documentation' },
            ];
            const card = compileAgentCard(BASE_CONFIG, [], undefined, resources);

            expect(card.skills).toHaveLength(1);
            expect(card.skills[0].id).toBe('resource:docs');
            expect(card.skills[0].tags).toEqual(['resource']);
        });
    });

    describe('compileAgentCard — bridge config overrides', () => {
        it('overrides name from bridge config', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { name: 'Custom Agent' } },
                [],
            );
            expect(card.name).toBe('Custom Agent');
        });

        it('overrides description from bridge config', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { description: 'A financial agent' } },
                [],
            );
            expect(card.description).toBe('A financial agent');
        });

        it('overrides URL from bridge config and propagates to interfaces', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { url: 'https://agent.example.com' } },
                [],
            );
            expect(card.url).toBe('https://agent.example.com');
            expect(card.additionalInterfaces![0].url).toBe('https://agent.example.com');
        });

        it('includes provider from bridge config', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { provider: { organization: 'Vinkius', url: 'https://vinkius.com' } } },
                [],
            );
            expect(card.provider?.organization).toBe('Vinkius');
        });

        it('includes security from bridge config', () => {
            const card = compileAgentCard(
                {
                    ...BASE_CONFIG,
                    bridge: {
                        securitySchemes: {
                            bearer: { type: 'http', scheme: 'bearer' },
                        },
                        security: [{ bearer: [] }],
                    },
                },
                [],
            );
            expect(card.securitySchemes?.['bearer']).toBeDefined();
            expect(card.security).toHaveLength(1);
        });

        it('includes documentationUrl from bridge config', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { documentationUrl: 'https://docs.example.com' } },
                [],
            );
            expect(card.documentationUrl).toBe('https://docs.example.com');
        });

        it('includes iconUrl from bridge config', () => {
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { iconUrl: 'https://cdn.example.com/icon.png' } },
                [],
            );
            expect(card.iconUrl).toBe('https://cdn.example.com/icon.png');
        });
    });

    describe('compileAgentCard — combined primitives', () => {
        it('combines tools, prompts, and resources into skills', () => {
            const builders = [makeBuilder('tool-a', 'Tool A')];
            const prompts: A2APromptLike[] = [{ name: 'prompt-b' }];
            const resources: A2AResourceLike[] = [{ name: 'resource-c' }];

            const card = compileAgentCard(BASE_CONFIG, builders, prompts, resources);

            expect(card.skills).toHaveLength(3);
            expect(card.skills[0].id).toBe('tool-a');
            expect(card.skills[1].id).toBe('prompt:prompt-b');
            expect(card.skills[2].id).toBe('resource:resource-c');
        });
    });

    describe('compileAgentCard — spec compliance validation', () => {
        it('all required fields are present on AgentCard', () => {
            const card = compileAgentCard(BASE_CONFIG, [makeBuilder('test', 'Test')]);

            // Required by spec
            expect(typeof card.name).toBe('string');
            expect(typeof card.description).toBe('string');
            expect(typeof card.url).toBe('string');
            expect(typeof card.version).toBe('string');
            expect(typeof card.protocolVersion).toBe('string');
            expect(card.capabilities).toBeDefined();
            expect(Array.isArray(card.skills)).toBe(true);
            expect(Array.isArray(card.defaultInputModes)).toBe(true);
            expect(Array.isArray(card.defaultOutputModes)).toBe(true);
        });

        it('all required fields are present on AgentSkill', () => {
            const card = compileAgentCard(BASE_CONFIG, [makeBuilder('test', 'Test', ['tag'])]);
            const skill = card.skills[0];

            expect(typeof skill.id).toBe('string');
            expect(typeof skill.name).toBe('string');
            expect(typeof skill.description).toBe('string');
            expect(Array.isArray(skill.tags)).toBe(true);
        });

        it('protocol version matches constant', () => {
            const card = compileAgentCard(BASE_CONFIG, []);
            expect(card.protocolVersion).toBe('1.0.0');
        });
    });

    describe('compileAgentCard — scale tests', () => {
        it('handles 1,000 tools', () => {
            const builders = Array.from({ length: 1000 }, (_, i) =>
                makeBuilder(`tool-${i}`, `Tool #${i}`),
            );
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills).toHaveLength(1000);
            expect(card.skills[999].id).toBe('tool-999');
        });

        it('produces valid JSON-serializable output', () => {
            const builders = [makeBuilder('test', 'Test tool', ['tag'])];
            const card = compileAgentCard(BASE_CONFIG, builders);
            const json = JSON.stringify(card);
            const parsed = JSON.parse(json);

            expect(parsed.name).toBe('test-agent');
            expect(parsed.skills[0].id).toBe('test');
        });
    });

    describe('compileAgentCard — adversarial inputs', () => {
        it('handles XSS in tool name', () => {
            const builders = [makeBuilder('<script>alert("xss")</script>', 'XSS test')];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills[0].id).toBe('<script>alert("xss")</script>');
        });

        it('handles unicode in all fields', () => {
            const builders = [makeBuilder('工具', '日本語の説明', ['タグ'])];
            const card = compileAgentCard(
                { ...BASE_CONFIG, bridge: { name: '代理人', description: '説明' } },
                builders,
            );

            expect(card.name).toBe('代理人');
            expect(card.skills[0].id).toBe('工具');
            expect(card.skills[0].description).toBe('日本語の説明');
        });

        it('handles empty strings', () => {
            const builders = [makeBuilder('', 'Empty name')];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills[0].id).toBe('');
        });

        it('handles prototype pollution attempt', () => {
            const builders = [makeBuilder('__proto__', 'Pollution')];
            const card = compileAgentCard(BASE_CONFIG, builders);

            expect(card.skills[0].id).toBe('__proto__');
            expect((card as Record<string, unknown>)['__proto__']).toBe(Object.prototype);
        });
    });

    describe('compileAgentCard — idempotency', () => {
        it('produces identical output for identical input', () => {
            const builders = [makeBuilder('tool-a', 'Description')];
            const card1 = compileAgentCard(BASE_CONFIG, builders);
            const card2 = compileAgentCard(BASE_CONFIG, builders);

            expect(JSON.stringify(card1)).toBe(JSON.stringify(card2));
        });
    });
});
