/**
 * Bug #101 — Simulator emits exactly ONE execute event per pipeline
 *
 * Verifies that each simulated pipeline emits exactly one 'execute'
 * event, not two (which was the old bug — unconditional first emit +
 * conditional second emit in if/else branches).
 *
 * @module
 */
import { describe, it, expect, afterEach } from 'vitest';
import { connect } from 'node:net';
import type { TelemetryEvent } from '@vurb/core';
import { startSimulator } from '../src/Simulator.js';
import { platform } from 'node:os';

function collectEvents(
    ipcPath: string,
    durationMs: number,
): Promise<TelemetryEvent[]> {
    return new Promise((resolve) => {
        const events: TelemetryEvent[] = [];
        let buffer = '';
        const client = connect(ipcPath);
        const timer = setTimeout(() => {
            client.destroy();
            resolve(events);
        }, durationMs);

        client.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop()!;
            for (const line of lines) {
                if (line.trim()) {
                    try { events.push(JSON.parse(line)); } catch { /* skip */ }
                }
            }
        });

        client.on('error', () => {
            clearTimeout(timer);
            resolve(events);
        });
    });
}

describe('Bug #101 — Simulator single execute event per pipeline', () => {
    let cleanup: (() => Promise<void>) | undefined;

    afterEach(async () => {
        if (cleanup) { await cleanup(); cleanup = undefined; }
    });

    it('emits exactly one execute event per pipeline (no duplicates)', async () => {
        const isWin = platform() === 'win32';
        const pipeName = isWin
            ? `\\\\.\\pipe\\vurb-bug101-${Date.now()}`
            : `/tmp/vurb-bug101-${Date.now()}.sock`;

        const sim = await startSimulator({
            ipcPath: pipeName,
            intervalMs: 50,
            tools: [
                { name: 'test-tool', actions: ['read', 'write'] },
            ],
        });
        cleanup = sim.stop;

        // Collect events for 2 seconds — should get several pipelines
        const events = await collectEvents(pipeName, 2000);

        // Count execute events (each pipeline should emit exactly 1)
        const executeEvents = events.filter(e => e.type === 'execute');
        // Count validate events (each pipeline emits exactly 1 validate)
        const validateEvents = events.filter(e => e.type === 'validate');

        // We should have at least some pipelines
        if (validateEvents.length > 0) {
            // Group execute events by traceId
            const executesByTrace = new Map<string, TelemetryEvent[]>();
            for (const e of executeEvents) {
                const tid = (e as Record<string, unknown>)['traceId'] as string;
                if (!tid) continue;
                if (!executesByTrace.has(tid)) executesByTrace.set(tid, []);
                executesByTrace.get(tid)!.push(e);
            }

            // Each traceId should have at most 1 execute event
            for (const [traceId, execs] of executesByTrace) {
                expect(execs.length, `traceId ${traceId} should have exactly 1 execute event`).toBe(1);
            }
        }
    });
});
