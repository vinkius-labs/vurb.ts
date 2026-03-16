import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineResource, type ResourceBuilder } from '../../src/resource/ResourceBuilder.js';
import { ResourceRegistry } from '../../src/resource/ResourceRegistry.js';
import { SubscriptionManager } from '../../src/resource/SubscriptionManager.js';

// ============================================================================
// defineResource() Tests
// ============================================================================

describe('defineResource()', () => {
    it('should create a resource with name and URI', () => {
        const res = defineResource('stock_price', {
            uri: 'stock://prices/{symbol}',
            handler: async () => ({ text: '{}' }),
        });
        expect(res.getName()).toBe('stock_price');
        expect(res.getUri()).toBe('stock://prices/{symbol}');
    });

    it('should default mimeType to application/json', () => {
        const res = defineResource('data', {
            uri: 'data://test',
            handler: async () => ({ text: '{}' }),
        });
        const def = res.buildResourceDefinition();
        expect(def.mimeType).toBe('application/json');
    });

    it('should allow custom mimeType', () => {
        const res = defineResource('text', {
            uri: 'text://readme',
            mimeType: 'text/plain',
            handler: async () => ({ text: 'hello' }),
        });
        const def = res.buildResourceDefinition();
        expect(def.mimeType).toBe('text/plain');
    });

    it('should build resource definition with all fields', () => {
        const res = defineResource('deploy_status', {
            uri: 'deploy://status/{env}',
            description: 'Real-time deploy pipeline status',
            mimeType: 'application/json',
            subscribable: true,
            annotations: {
                audience: ['assistant'],
                priority: 0.8,
            },
            handler: async () => ({ text: '{}' }),
        });

        const def = res.buildResourceDefinition();
        expect(def).toEqual({
            uri: 'deploy://status/{env}',
            name: 'deploy_status',
            description: 'Real-time deploy pipeline status',
            mimeType: 'application/json',
            annotations: {
                audience: ['assistant'],
                priority: 0.8,
            },
        });
    });

    it('should be subscribable when flag is set', () => {
        const sub = defineResource('live', {
            uri: 'live://data',
            subscribable: true,
            handler: async () => ({ text: '{}' }),
        });
        const notSub = defineResource('static', {
            uri: 'static://data',
            handler: async () => ({ text: '{}' }),
        });
        expect(sub.isSubscribable()).toBe(true);
        expect(notSub.isSubscribable()).toBe(false);
    });

    it('should support tags', () => {
        const res = defineResource('tagged', {
            uri: 'tagged://data',
            tags: ['monitoring', 'realtime'],
            handler: async () => ({ text: '{}' }),
        });
        expect(res.getTags()).toEqual(['monitoring', 'realtime']);
    });

    it('should default tags to empty array', () => {
        const res = defineResource('no_tags', {
            uri: 'no://tags',
            handler: async () => ({ text: '{}' }),
        });
        expect(res.getTags()).toEqual([]);
    });

    it('should read resource content via handler', async () => {
        const res = defineResource<{ apiKey: string }>('price', {
            uri: 'stock://prices/{symbol}',
            handler: async (uri, ctx) => {
                const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
                return { text: JSON.stringify({ symbol, key: ctx.apiKey }) };
            },
        });

        const content = await res.read('stock://prices/AAPL', { apiKey: 'secret' });
        const parsed = JSON.parse(content.text!);
        expect(parsed.symbol).toBe('AAPL');
        expect(parsed.key).toBe('secret');
    });

    it('should support blob content', async () => {
        const res = defineResource('binary', {
            uri: 'binary://file',
            mimeType: 'image/png',
            handler: async () => ({ blob: 'base64data==' }),
        });

        const content = await res.read('binary://file', undefined as never);
        expect(content.blob).toBe('base64data==');
    });
});

// ============================================================================
// ResourceRegistry Tests
// ============================================================================

describe('ResourceRegistry', () => {
    let registry: ResourceRegistry<void>;
    let stockPrice: ResourceBuilder<void>;
    let deployStatus: ResourceBuilder<void>;

    beforeEach(() => {
        registry = new ResourceRegistry<void>();
        stockPrice = defineResource('stock_price', {
            uri: 'stock://prices/{symbol}',
            description: 'Real-time stock price',
            subscribable: true,
            handler: async (uri) => {
                const symbol = uri.match(/stock:\/\/prices\/(.+)/)?.[1];
                return { text: JSON.stringify({ symbol, price: 142.50 }) };
            },
        });
        deployStatus = defineResource('deploy_status', {
            uri: 'deploy://status/{env}',
            description: 'Deploy pipeline status',
            handler: async () => ({ text: JSON.stringify({ stage: 'building' }) }),
        });
    });

    // ── Registration ──

    it('should register a resource', () => {
        registry.register(stockPrice);
        expect(registry.size).toBe(1);
        expect(registry.has('stock_price')).toBe(true);
    });

    it('should register multiple resources', () => {
        registry.registerAll(stockPrice, deployStatus);
        expect(registry.size).toBe(2);
    });

    it('should reject duplicate resource names', () => {
        registry.register(stockPrice);
        const duplicate = defineResource('stock_price', {
            uri: 'other://uri',
            handler: async () => ({ text: '{}' }),
        });
        expect(() => registry.register(duplicate)).toThrow(/already registered/);
    });

    // ── List ──

    it('should list all resources', () => {
        registry.registerAll(stockPrice, deployStatus);
        const resources = registry.listResources();
        expect(resources).toHaveLength(2);
        expect(resources.map(r => r.name)).toEqual(['stock_price', 'deploy_status']);
    });

    // ── Read ──

    it('should read a resource by exact URI', async () => {
        registry.register(deployStatus);
        // deployStatus has template URI, but read with matching URI works
        const result = await registry.readResource('deploy://status/staging', undefined as never);
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe('deploy://status/staging');
        const body = JSON.parse(result.contents[0].text!);
        expect(body.stage).toBe('building');
    });

    it('should read resource matching URI template', async () => {
        registry.register(stockPrice);
        const result = await registry.readResource('stock://prices/AAPL', undefined as never);
        expect(result.contents).toHaveLength(1);
        const body = JSON.parse(result.contents[0].text!);
        expect(body.symbol).toBe('AAPL');
        expect(body.price).toBe(142.50);
    });

    it('should return empty contents for unknown URIs', async () => {
        registry.register(stockPrice);
        const result = await registry.readResource('unknown://resource', undefined as never);
        expect(result.contents).toHaveLength(0);
    });

    // ── Subscriptions ──

    it('should accept subscription for subscribable resources', () => {
        registry.register(stockPrice);
        const accepted = registry.subscribe('stock://prices/AAPL');
        expect(accepted).toBe(true);
    });

    it('should reject subscription for non-subscribable resources', () => {
        registry.register(deployStatus);
        const accepted = registry.subscribe('deploy://status/staging');
        expect(accepted).toBe(false);
    });

    it('should reject subscription for unknown URIs', () => {
        const accepted = registry.subscribe('unknown://resource');
        expect(accepted).toBe(false);
    });

    it('should unsubscribe from resources', () => {
        registry.register(stockPrice);
        registry.subscribe('stock://prices/AAPL');
        registry.unsubscribe('stock://prices/AAPL');
        expect(registry.subscriptions.isSubscribed('stock://prices/AAPL')).toBe(false);
    });

    it('should detect subscribable resources', () => {
        const emptyRegistry = new ResourceRegistry();
        expect(emptyRegistry.hasSubscribableResources).toBe(false);

        registry.register(deployStatus);
        expect(registry.hasSubscribableResources).toBe(false);

        registry.register(stockPrice);
        expect(registry.hasSubscribableResources).toBe(true);
    });

    // ── Lifecycle ──

    it('should clear all resources and subscriptions', () => {
        registry.registerAll(stockPrice, deployStatus);
        registry.subscribe('stock://prices/AAPL');
        registry.clear();
        expect(registry.size).toBe(0);
        expect(registry.subscriptions.size).toBe(0);
    });

    it('should debounce notifyChanged', async () => {
        const sink = vi.fn();
        registry.setListChangedSink(sink);

        // Rapid-fire calls
        registry.notifyChanged();
        registry.notifyChanged();
        registry.notifyChanged();

        // Should not have fired yet (debounced)
        expect(sink).not.toHaveBeenCalled();

        // Wait for debounce
        await new Promise(r => setTimeout(r, 150));
        expect(sink).toHaveBeenCalledTimes(1);
    });

    // ── Push Notifications ──

    it('should notify subscribed URIs via notification sink', async () => {
        const sink = vi.fn();
        registry.setNotificationSink(sink);
        registry.register(stockPrice);
        registry.subscribe('stock://prices/AAPL');

        await registry.notifyUpdated('stock://prices/AAPL');
        expect(sink).toHaveBeenCalledWith('stock://prices/AAPL');
    });

    it('should NOT notify unsubscribed URIs', async () => {
        const sink = vi.fn();
        registry.setNotificationSink(sink);
        registry.register(stockPrice);

        // No subscription → no notification
        await registry.notifyUpdated('stock://prices/AAPL');
        expect(sink).not.toHaveBeenCalled();
    });
});

// ============================================================================
// SubscriptionManager Tests
// ============================================================================

describe('SubscriptionManager', () => {
    let manager: SubscriptionManager;

    beforeEach(() => {
        manager = new SubscriptionManager();
    });

    it('should subscribe to a URI', () => {
        manager.subscribe('stock://prices/AAPL');
        expect(manager.isSubscribed('stock://prices/AAPL')).toBe(true);
        expect(manager.size).toBe(1);
    });

    it('should unsubscribe from a URI', () => {
        manager.subscribe('stock://prices/AAPL');
        manager.unsubscribe('stock://prices/AAPL');
        expect(manager.isSubscribed('stock://prices/AAPL')).toBe(false);
        expect(manager.size).toBe(0);
    });

    it('should return all subscriptions', () => {
        manager.subscribe('stock://prices/AAPL');
        manager.subscribe('deploy://status/prod');
        const subs = manager.getSubscriptions();
        expect(subs.size).toBe(2);
        expect(subs.has('stock://prices/AAPL')).toBe(true);
        expect(subs.has('deploy://status/prod')).toBe(true);
    });

    it('should notify via sink when subscribed', async () => {
        const sink = vi.fn();
        manager.setSink(sink);
        manager.subscribe('stock://prices/AAPL');

        await manager.notify('stock://prices/AAPL');
        expect(sink).toHaveBeenCalledWith('stock://prices/AAPL');
    });

    it('should NOT notify when URI is not subscribed', async () => {
        const sink = vi.fn();
        manager.setSink(sink);

        await manager.notify('stock://prices/AAPL');
        expect(sink).not.toHaveBeenCalled();
    });

    it('should NOT notify when no sink is set', async () => {
        manager.subscribe('stock://prices/AAPL');
        // No sink set → should not throw
        await manager.notify('stock://prices/AAPL');
    });

    it('should swallow errors from the sink (best-effort)', async () => {
        const sink = vi.fn().mockRejectedValue(new Error('sink failure'));
        manager.setSink(sink);
        manager.subscribe('stock://prices/AAPL');

        // Should not throw
        await expect(manager.notify('stock://prices/AAPL')).resolves.toBeUndefined();
    });

    it('should handle async sinks', async () => {
        const results: string[] = [];
        const sink = vi.fn().mockImplementation(async (uri: string) => {
            await new Promise(r => setTimeout(r, 10));
            results.push(uri);
        });
        manager.setSink(sink);
        manager.subscribe('stock://prices/AAPL');

        await manager.notify('stock://prices/AAPL');
        expect(results).toEqual(['stock://prices/AAPL']);
    });

    it('should clear all subscriptions', () => {
        manager.subscribe('a://1');
        manager.subscribe('b://2');
        manager.subscribe('c://3');
        manager.clear();
        expect(manager.size).toBe(0);
    });

    it('should handle idempotent subscribe', () => {
        manager.subscribe('a://1');
        manager.subscribe('a://1');
        expect(manager.size).toBe(1);
    });

    it('should handle unsubscribe for non-existent URI', () => {
        // Should not throw
        manager.unsubscribe('nonexistent://uri');
        expect(manager.size).toBe(0);
    });
});

// ============================================================================
// Bug #5 Regression — _matchesTemplate must escape regex metacharacters
//
// Without escaping, dots/plus/asterisks in URI templates are interpreted
// as regex syntax, causing false matches (e.g. `data.api.com` matching
// `dataXapiYcom`).
// ============================================================================

describe('ResourceRegistry: Template matching with metacharacters (Bug #5)', () => {
    it('should NOT match when dots in URI are treated as wildcards', async () => {
        const registry = new ResourceRegistry<void>();
        const res = defineResource('api_data', {
            uri: 'https://data.api.com/users/{id}',
            handler: async () => ({ text: '{}' }),
        });
        registry.register(res);

        // Exact match should work
        const valid = await registry.readResource('https://data.api.com/users/42', undefined as never);
        expect(valid.contents).toHaveLength(1);

        // Dots should NOT match arbitrary chars
        const invalid = await registry.readResource('https://dataXapiYcom/users/42', undefined as never);
        expect(invalid.contents).toHaveLength(0);
    });

    it('should escape plus signs in URI templates', async () => {
        const registry = new ResourceRegistry<void>();
        const res = defineResource('cpp_docs', {
            uri: 'docs://c++/reference/{topic}',
            handler: async () => ({ text: '{}' }),
        });
        registry.register(res);

        const valid = await registry.readResource('docs://c++/reference/vectors', undefined as never);
        expect(valid.contents).toHaveLength(1);

        // + should not mean "one or more of previous char"
        const invalid = await registry.readResource('docs://ccc/reference/vectors', undefined as never);
        expect(invalid.contents).toHaveLength(0);
    });

    it('should escape question marks in URI templates', async () => {
        const registry = new ResourceRegistry<void>();
        const res = defineResource('query_data', {
            uri: 'api://search?q={term}',
            handler: async () => ({ text: '{}' }),
        });
        registry.register(res);

        const valid = await registry.readResource('api://search?q=hello', undefined as never);
        expect(valid.contents).toHaveLength(1);

        // ? should not make previous char optional
        const invalid = await registry.readResource('api://searchq=hello', undefined as never);
        expect(invalid.contents).toHaveLength(0);
    });

    it('should escape brackets and pipes in URI templates', async () => {
        const registry = new ResourceRegistry<void>();
        const res = defineResource('bracket_data', {
            uri: 'proto://data[v1]/items/{id}',
            handler: async () => ({ text: '{}' }),
        });
        registry.register(res);

        const valid = await registry.readResource('proto://data[v1]/items/99', undefined as never);
        expect(valid.contents).toHaveLength(1);

        // [ should not be interpreted as character class
        const invalid = await registry.readResource('proto://datav/items/99', undefined as never);
        expect(invalid.contents).toHaveLength(0);
    });
});
