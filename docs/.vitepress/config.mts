import { defineConfig } from 'vitepress'
import { getPageHeadTags, getPageSEO } from './seo'
import typedocSidebar from '../api/typedoc-sidebar.json'

export default defineConfig({
  title: "Vurb.ts",
  description: "The AI-First DX for the Model Context Protocol: building scalable Agentic APIs with the MVA pattern.",
  base: '/',
  cleanUrls: true,
  appearance: 'force-dark',
  sitemap: {
    hostname: 'https://mcp-fusion.vinkius.com'
  },

  head: [
    // ── Google Analytics ──
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-346DSQJMFD' }],
    ['script', {}, "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-346DSQJMFD');"],

    // ── Favicons ──
    ['link', { rel: 'icon', type: 'image/x-icon', href: 'https://site-assets.vinkius.com/vk/favicon/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: 'https://site-assets.vinkius.com/vk/favicon/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '96x96', href: 'https://site-assets.vinkius.com/vk/favicon/favicon-96x96.png' }],

    // ── PWA & Apple ──
    ['meta', { name: 'theme-color', content: '#000000' }],
    ['meta', { name: 'msapplication-TileColor', content: '#30363D' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Vurb.ts' }],
    ['meta', { name: 'application-name', content: 'Vurb.ts' }],

    // ── JSON-LD: SoftwareSourceCode ──
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      'name': 'vurb-ts',
      'alternateName': 'Vurb.ts',
      'description': 'The AI-First DX for the Model Context Protocol. Introduces Presenters — a deterministic View layer for AI agents — with action consolidation, cognitive guardrails, structured perception packages, and self-healing errors.',
      'url': 'https://mcp-fusion.vinkius.com/',
      'codeRepository': 'https://github.com/vinkius-labs/vurb.ts',
      'programmingLanguage': 'TypeScript',
      'runtimePlatform': 'Node.js',
      'license': 'https://opensource.org/licenses/Apache-2.0',
      'applicationCategory': 'DeveloperApplication',
      'keywords': [
        'MCP', 'Model Context Protocol', 'MVA', 'Model-View-Agent',
        'AI agents', 'LLM tools', 'TypeScript framework',
        'Presenter pattern', 'action consolidation', 'agentic HATEOAS',
        'cognitive guardrails', 'structured perception', 'self-healing errors',
        'tool routing', 'Zod validation', 'tRPC-style client',
        'Cursor MCP', 'Claude Desktop MCP', 'Claude Code MCP',
        'Windsurf MCP', 'Cline MCP', 'VS Code Copilot MCP',
        'Vercel AI SDK MCP', 'LangChain MCP server', 'LlamaIndex MCP backend',
        'Vercel MCP server', 'Cloudflare Workers MCP', 'AWS Lambda MCP',
        'OpenAPI to MCP', 'Prisma to MCP', 'n8n MCP',
        'mcp-fusion-vercel', 'mcp-fusion-cloudflare', 'mcp-fusion-aws',
        'mcp-fusion-openapi-gen', 'mcp-fusion-prisma-gen', 'mcp-fusion-n8n',
        'mcp-fusion-oauth', 'mcp-fusion-jwt', 'mcp-fusion-api-key', 'mcp-fusion-testing',
        'MCP server framework', 'build MCP server', 'MCP tool builder',
        'MCP resource subscriptions', 'real-time AI agent notifications',
        'MCP resources', 'subscribable resources', 'push notifications MCP'
      ],
      'author': {
        '@type': 'Person',
        'name': 'Renato Marinho',
        'url': 'https://github.com/renatomarinho'
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'Vinkius Labs',
        'url': 'https://github.com/vinkius-labs',
        'logo': 'https://site-assets.vinkius.com/vk/icon-v-black-min.png'
      },
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD',
        'availability': 'https://schema.org/InStock'
      },
      'operatingSystem': 'Cross-platform',
      'softwareRequirements': 'Node.js >= 18, TypeScript >= 5.7',
      'version': '1.0.0'
    })],

  ],

  transformPageData(pageData) {
    const seo = getPageSEO(pageData.relativePath);
    if (seo) {
      pageData.title = seo.title;
      pageData.titleTemplate = ':title';
      pageData.description = seo.description;
    }
  },

  transformHead({ pageData }) {
    return getPageHeadTags(pageData);
  },

  themeConfig: {
    logo: { src: 'https://site-assets.vinkius.com/vk/vurb-logo.png', width: 160, height: 36 },
    siteTitle: false,
    
    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Create MCP-Server Now', link: '/quickstart-lightspeed' },
      { text: 'Deploy MCP Servers', link: 'https://vinkius.com' },
      { text: 'Blog', link: '/blog/' },
    ],

    sidebar: [
      // ── Get Started ─────────────────────────────────────
      {
        text: 'Get Started',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Quickstart', link: '/quickstart-lightspeed' },
          { text: 'Enterprise Quickstart', link: '/enterprise-quickstart' },
          { text: 'Client Integrations', link: '/client-integrations' },
          { text: 'CLI Reference', link: '/governance/cli' },
          { text: 'Migration Guide', link: '/migration' },
        ]
      },

      // ── Architecture ────────────────────────────────────
      {
        text: 'Architecture',
        collapsed: true,
        items: [
          { text: 'MVA Pattern', link: '/mva-pattern' },
          { text: 'MVA At a Glance', link: '/mva/' },
          { text: 'Theory & Axioms', link: '/mva/theory' },
          { text: 'MVA vs MVC', link: '/mva/mva-vs-mvc' },
          { text: 'Comparison', link: '/comparison' },
          { text: 'Architecture Internals', link: '/architecture' },
          { text: 'Convention', link: '/mva-convention' },
        ]
      },

      // ── Building Tools ──────────────────────────────────
      {
        text: 'Building Tools',
        collapsed: true,
        items: [
          { text: 'Tools & Inputs', link: '/building-tools' },
          { text: 'Routing & Groups', link: '/routing' },
          { text: 'Tool Exposition', link: '/tool-exposition' },
          { text: 'Presenter', link: '/presenter' },
          {
            text: 'Presenter Internals',
            collapsed: true,
            items: [
              { text: 'Anatomy & Lifecycle', link: '/mva/presenter-anatomy' },
              { text: 'Perception Package', link: '/mva/perception-package' },
              { text: 'Affordances', link: '/mva/affordances' },
              { text: 'Context Tree-Shaking', link: '/mva/context-tree-shaking' },
              { text: 'Cognitive Guardrails', link: '/mva/cognitive-guardrails' },
              { text: 'Select Reflection', link: '/mva/select-reflection' },
            ]
          },
          { text: 'Middleware', link: '/middleware' },
          { text: 'Error Handling', link: '/error-handling' },
          { text: 'Result Monad', link: '/result-monad' },
          { text: 'Context & State', link: '/context' },
          { text: 'Prompts & Manifest', link: '/prompts' },
          { text: 'Dynamic Manifest', link: '/dynamic-manifest' },
          { text: 'Resource Subscriptions', link: '/resource-subscriptions' },
          { text: 'State Sync', link: '/state-sync' },
          { text: 'Cancellation', link: '/cancellation' },
          { text: 'Agent Skills', link: '/skills' },
          { text: 'Advanced Configuration', link: '/advanced-configuration' },
        ]
      },

      // ── Security & Governance ───────────────────────────
      {
        text: 'Security & Governance',
        collapsed: true,
        items: [
          { text: 'Security Overview', link: '/security/' },
          { text: 'DLP — PII Redaction', link: '/dlp-redaction' },
          { text: 'Sandbox Engine', link: '/sandbox' },
          { text: 'Runtime Guards', link: '/runtime-guards' },
          { text: 'FSM State Gate', link: '/fsm-state-gate' },
          { text: 'JudgeChain', link: '/security/judge-chain' },
          { text: 'Prompt Firewall', link: '/security/prompt-firewall' },
          { text: 'Input Firewall', link: '/security/input-firewall' },
          { text: 'Rate Limiter', link: '/security/rate-limiter' },
          { text: 'Audit Trail', link: '/security/audit-trail' },
          {
            text: 'Capability Governance',
            collapsed: true,
            items: [
              { text: 'Overview', link: '/governance/' },
              { text: 'Capability Lockfile', link: '/governance/capability-lockfile' },
              { text: 'Surface Integrity', link: '/governance/surface-integrity' },
              { text: 'Contract Diffing', link: '/governance/contract-diffing' },
              { text: 'Zero-Trust Attestation', link: '/governance/zero-trust-attestation' },
              { text: 'Blast Radius Analysis', link: '/governance/blast-radius' },
              { text: 'Token Economics', link: '/governance/token-economics' },
              { text: 'Semantic Probing', link: '/governance/semantic-probe' },
              { text: 'Self-Healing Context', link: '/governance/self-healing' },
              { text: 'CLI Reference', link: '/governance/cli' },
            ]
          },
          {
            text: 'Authentication',
            collapsed: true,
            items: [
              { text: 'OAuth', link: '/oauth' },
              { text: 'JWT Verification', link: '/jwt' },
              { text: 'API Key Validation', link: '/api-key' },
            ]
          },
        ]
      },

      // ── Connectors & Deploy ─────────────────────────────
      {
        text: 'Connectors & Deploy',
        collapsed: true,
        items: [
          { text: 'OpenAPI Generator', link: '/openapi-gen' },
          { text: 'Prisma Generator', link: '/prisma-gen' },
          { text: 'n8n Connector', link: '/n8n-connector' },
          { text: 'AWS Connector', link: '/aws-connector' },
          { text: 'Cloudflare Workers', link: '/cloudflare-adapter' },
          { text: 'Vercel', link: '/vercel-adapter' },
          { text: 'FusionClient', link: '/fusion-client' },
        ]
      },

      // ── Production ──────────────────────────────────────
      {
        text: 'Production',
        collapsed: true,
        items: [
          { text: 'Inspector', link: '/inspector' },
          { text: 'Observability', link: '/observability' },
          { text: 'Tracing', link: '/tracing' },
          { text: 'Introspection', link: '/introspection' },
          { text: 'Performance', link: '/performance' },
          { text: 'Scaling', link: '/scaling' },
          { text: 'Cost & Hallucination', link: '/cost-and-hallucination' },
          { text: 'Testing', link: '/testing' },
          {
            text: 'Test Suite',
            collapsed: true,
            items: [
              { text: 'Quick Start', link: '/testing/quickstart' },
              { text: 'Command-Line Runner', link: '/testing/command-line' },
              { text: 'Fixtures', link: '/testing/fixtures' },
              { text: 'Assertions', link: '/testing/assertions' },
              { text: 'Test Doubles', link: '/testing/test-doubles' },
              { text: 'Egress Firewall', link: '/testing/egress-firewall' },
              { text: 'System Rules', link: '/testing/system-rules' },
              { text: 'UI Blocks', link: '/testing/ui-blocks' },
              { text: 'Middleware Guards', link: '/testing/middleware-guards' },
              { text: 'OOM Guard', link: '/testing/oom-guard' },
              { text: 'Error Handling', link: '/testing/error-handling' },
              { text: 'Raw Response', link: '/testing/raw-response' },
              { text: 'CI/CD Integration', link: '/testing/ci-cd' },
              { text: 'Convention', link: '/testing/convention' },
            ]
          },
          {
            text: 'Enterprise',
            collapsed: true,
            items: [
              { text: 'Security & Auth', link: '/enterprise/security' },
              { text: 'Observability & Audit', link: '/enterprise/observability' },
              { text: 'Multi-Tenancy', link: '/enterprise/multi-tenancy' },
            ]
          },
          { text: 'Common Issues', link: '/common-issues/' },
          { text: 'DX Guide', link: '/dx-guide' },
          { text: 'Quickstart — Traditional', link: '/quickstart' },
        ]
      },

      // ── Cookbook ──────────────────────────────────────────
      {
        text: 'Cookbook',
        collapsed: true,
        items: [
          {
            text: 'Getting Started',
            collapsed: true,
            items: [
              { text: 'CRUD Operations', link: '/cookbook/crud' },
              { text: 'Request Lifecycle', link: '/cookbook/request-lifecycle' },
              { text: 'HMR Dev Server', link: '/cookbook/hmr-dev-server' },
              { text: 'Production Server', link: '/cookbook/production-server' },
            ]
          },
          {
            text: 'Presenter & MVA',
            collapsed: true,
            items: [
              { text: 'MVA Presenter', link: '/cookbook/mva-presenter' },
              { text: 'Presenter Composition', link: '/cookbook/presenter-composition' },
              { text: 'Custom Responses', link: '/cookbook/custom-responses' },
              { text: 'Context-Aware Rules', link: '/cookbook/context-aware-rules' },
              { text: 'Context Tree-Shaking', link: '/cookbook/context-tree-shaking' },
              { text: 'Select Reflection', link: '/cookbook/select-reflection' },
              { text: 'Agentic Affordances', link: '/cookbook/agentic-affordances' },
              { text: 'Cognitive Guardrails', link: '/cookbook/cognitive-guardrails' },
            ]
          },
          {
            text: 'Tool Building',
            collapsed: true,
            items: [
              { text: 'Hierarchical Groups', link: '/cookbook/hierarchical-groups' },
              { text: 'Functional Groups', link: '/cookbook/functional-groups' },
              { text: 'Tool Exposition', link: '/cookbook/tool-exposition' },
              { text: 'Error Handling', link: '/cookbook/error-handling' },
              { text: 'Result Monad', link: '/cookbook/result-monad' },
              { text: 'Streaming', link: '/cookbook/streaming' },
              { text: 'Cancellation', link: '/cookbook/cancellation' },
              { text: 'Auth Middleware', link: '/cookbook/auth-middleware' },
              { text: 'Prompts', link: '/cookbook/prompts' },
              { text: 'Runtime Guards', link: '/cookbook/runtime-guards' },
              { text: 'Self-Healing Context', link: '/cookbook/self-healing-context' },
              { text: 'Transactional Workflows', link: '/cookbook/transactional-workflows' },
              { text: 'TOON Encoding', link: '/cookbook/toon' },
            ]
          },
          {
            text: 'Governance',
            collapsed: true,
            items: [
              { text: 'Capability Lockfile', link: '/cookbook/capability-lockfile' },
              { text: 'Contract Diffing', link: '/cookbook/contract-diffing' },
              { text: 'Blast Radius', link: '/cookbook/blast-radius' },
              { text: 'Token Economics', link: '/cookbook/token-economics' },
              { text: 'Semantic Probe', link: '/cookbook/semantic-probe' },
              { text: 'Zero-Trust Attestation', link: '/cookbook/zero-trust-attestation' },
            ]
          },
          {
            text: 'Production',
            collapsed: true,
            items: [
              { text: 'Observability', link: '/cookbook/observability' },
              { text: 'Tracing', link: '/cookbook/tracing' },
              { text: 'Introspection', link: '/cookbook/introspection' },
              { text: 'State Sync', link: '/cookbook/state-sync' },
              { text: 'Resource Subscriptions', link: '/cookbook/resource-subscriptions' },
              { text: 'Testing', link: '/cookbook/testing' },
            ]
          },
        ]
      },

      // ── API Reference (auto-generated by TypeDoc) ─────
      {
        text: 'API Reference',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/api/' },
          ...typedocSidebar,
        ]
      },

      // ── Blog ──────────────────────────────────────────
      {
        text: 'Blog',
        collapsed: true,
        items: [
          { text: 'All Posts', link: '/blog/' },
          { text: 'Introducing Vurb.ts', link: '/blog/posts/introducing-vurb-ts' },
          { text: 'Anatomy of an AI Platform Breach', link: '/blog/posts/anatomy-of-an-ai-platform-breach' },
          { text: 'MVA Pattern Deep Dive', link: '/blog/posts/mva-pattern-deep-dive' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vinkius-labs/vurb.ts' }
    ]
  }
})
