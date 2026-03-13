# JudgeChain

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

- [What Is a JudgeChain](#overview)
- [Strategies](#strategies)
- [Configuration](#configuration)
- [Timeouts](#timeouts)
- [Fail-Open vs Fail-Closed](#fail-behavior)
- [Response Parsing](#parsing)
- [Telemetry](#telemetry)
- [API Reference](#api)

The JudgeChain is the foundational evaluation primitive shared by both the [Prompt Firewall](/security/prompt-firewall) and the [Input Firewall](/security/input-firewall). It sends a prompt to one or more LLM adapters and returns a structured verdict.


## What Is a JudgeChain {#overview}

A JudgeChain wraps one or more `SemanticProbeAdapter` instances (the same adapter interface used by [Semantic Probing](/governance/semantic-probe)) and orchestrates their evaluation:

```typescript
import { createJudgeChain } from '@vurb/core';

const chain = createJudgeChain({
    adapters: [
        { name: 'gpt-4o-mini', evaluate: (p) => openai.chat(p) },
        { name: 'claude-haiku', evaluate: (p) => claude.message(p) },
    ],
    strategy: 'fallback',
    timeoutMs: 3000,
});

const result = await chain.evaluate('Is this content safe?');
// result.passed — boolean
// result.results — per-adapter details
// result.fallbackTriggered — true if all adapters failed
```

**Zero hidden dependencies** — the adapter is a plain function you provide. No SDK, no API key in the framework, no vendor lock-in.


## Strategies {#strategies}

### Fallback (Default)

Try adapters sequentially. The first adapter that returns a parseable response wins — its verdict becomes the chain verdict. If it fails (timeout, error, unparseable), the next adapter is tried.

```typescript
const chain = createJudgeChain({
    adapters: [primaryJudge, fallbackJudge],
    strategy: 'fallback', // default
});
```

**Best for:** Cost efficiency. The primary model handles 99% of evaluations. The fallback only fires on rare failures.

### Consensus

ALL adapters are called in parallel. Every adapter must return `passed: true` for the chain to pass. Any explicit rejection blocks the content regardless of other verdicts.

```typescript
const chain = createJudgeChain({
    adapters: [gptJudge, claudeJudge, geminiJudge],
    strategy: 'consensus',
});
```

**Best for:** Maximum security. Critical paths where the cost of a false positive (allowing injection) far exceeds the cost of multiple LLM calls.

### Strategy Comparison

| Aspect | Fallback | Consensus |
|--------|----------|-----------|
| Execution | Sequential | Parallel |
| Latency | First success | Slowest adapter |
| Cost | 1 call (typical) | N calls (always) |
| Security | Good | Maximum |
| Failure mode | Next in line | Depends on `failOpen` |


## Configuration {#configuration}

```typescript
interface JudgeChainConfig {
    /** One or more LLM adapters */
    readonly adapters: readonly SemanticProbeAdapter[];

    /** 'fallback' (default) or 'consensus' */
    readonly strategy?: JudgeStrategy;

    /** Timeout per adapter in milliseconds (default: 5000) */
    readonly timeoutMs?: number;

    /** Behavior when ALL adapters fail (default: false = fail-closed) */
    readonly failOpen?: boolean;
}
```

### SemanticProbeAdapter Interface

```typescript
interface SemanticProbeAdapter {
    /** Human-readable name for logging/telemetry */
    readonly name: string;

    /** Send a prompt, return the raw text response */
    evaluate(prompt: string): Promise<string>;
}
```

Any function that takes a string and returns a string works. Wrap your LLM client in 3 lines:

```typescript
const gptMini: SemanticProbeAdapter = {
    name: 'gpt-4o-mini',
    evaluate: async (prompt) => {
        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0].message.content ?? '';
    },
};
```


## Timeouts {#timeouts}

Each adapter call is guarded by `Promise.race` with a per-adapter timeout. If the adapter doesn't respond within `timeoutMs`, the call is treated as an error:

```typescript
const chain = createJudgeChain({
    adapters: [slowJudge],
    timeoutMs: 2000,  // 2 seconds per adapter
});
```

- **Fallback strategy:** Timeout on adapter A → try adapter B
- **Consensus strategy:** Timeout on any adapter → treated as error → `failOpen` decides

Timeouts are properly cleaned up — no timer leaks, no `unhandledRejection` events.


## Fail-Open vs Fail-Closed {#fail-behavior}

When **all** adapters fail (timeout, error, unparseable response), the `failOpen` flag determines the verdict:

```typescript
// Fail-closed (default) — BLOCKS content when judges are unavailable
createJudgeChain({ adapters: [...], failOpen: false });

// Fail-open — PASSES content when judges are unavailable (use with caution)
createJudgeChain({ adapters: [...], failOpen: true });
```

::: warning
`failOpen: true` means an attacker who can take down your judge endpoint gets unrestricted access. Only use fail-open for non-critical, low-risk evaluations.
:::


## Response Parsing {#parsing}

The JudgeChain expects the adapter to return JSON with a `safe` boolean field:

```json
{ "safe": true }
```

Multiple field names are supported for flexibility:

| Field | Priority |
|-------|----------|
| `safe` | First |
| `passed` | Second |
| `allowed` | Third |

If the response is not valid JSON, the chain falls back to text matching (`"safe": true` / `"safe": false` in the lowercased string). If nothing matches, the response is treated as unparseable — equivalent to an adapter error.


## Telemetry {#telemetry}

The JudgeChain itself does not emit telemetry. Telemetry is emitted by the higher-level consumers:

- [PromptFirewall](/security/prompt-firewall) emits `security.firewall` events (type: `prompt`)
- [InputFirewall](/security/input-firewall) emits `security.firewall` events (type: `input`)

The `JudgeChainResult` object is available on every `FirewallVerdict` for custom telemetry:

```typescript
const verdict = await evaluateRules(rules, firewallConfig);
console.log(verdict.chainResult.results);     // per-adapter details
console.log(verdict.chainResult.totalDurationMs); // total evaluation time
```


## API Reference {#api}

### `createJudgeChain(config)`

Creates a compiled JudgeChain. Call `.evaluate(prompt)` to run.

### `JudgeChainResult`

```typescript
interface JudgeChainResult {
    readonly passed: boolean;
    readonly results: readonly JudgeResult[];
    readonly totalDurationMs: number;
    readonly fallbackTriggered: boolean;
}
```

### `JudgeResult`

```typescript
interface JudgeResult {
    readonly adapterName: string;
    readonly passed: boolean;
    readonly rawResponse: string;
    readonly durationMs: number;
}
```
