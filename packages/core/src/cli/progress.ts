/**
 * CLI progress reporting — animated spinner, step tracking.
 *
 * Drives Composer/Yarn-style step output with a live spinner
 * that cycles while a step is running, so the user always sees
 * movement and knows the CLI hasn't frozen.
 *
 * @module
 */

// ─── Types ───────────────────────────────────────────────────────

/** @internal */
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

/** @internal */
export interface ProgressStep {
    readonly id: string;
    readonly label: string;
    readonly status: StepStatus;
    readonly detail?: string;
    readonly durationMs?: number;
}

/** @internal */
export type ProgressReporter = (step: ProgressStep) => void;

// ─── Spinner ─────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const SPINNER_INTERVAL_MS = 80;

// ─── Default Reporter ────────────────────────────────────────────

/** @internal exported for testing */
export function createDefaultReporter(): ProgressReporter {
    let spinnerTimer: ReturnType<typeof setInterval> | undefined;
    let frameIndex = 0;
    let currentLine = '';

    function clearLine(): void {
        if (currentLine) {
            process.stderr.write(`\r\x1b[2K`);
            currentLine = '';
        }
    }

    function startSpinner(label: string): void {
        stopSpinner();
        frameIndex = 0;
        const render = (): void => {
            const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
            currentLine = `  ${frame} ${label}...`;
            process.stderr.write(`\r\x1b[2K${currentLine}`);
            frameIndex++;
        };
        render();
        spinnerTimer = setInterval(render, SPINNER_INTERVAL_MS);
        // Don't let the spinner timer prevent process exit (important in tests)
        if (typeof spinnerTimer === 'object' && spinnerTimer !== null && 'unref' in spinnerTimer) {
            spinnerTimer.unref();
        }
    }

    function stopSpinner(): void {
        if (spinnerTimer) {
            clearInterval(spinnerTimer);
            spinnerTimer = undefined;
        }
        clearLine();
    }

    return (step: ProgressStep): void => {
        switch (step.status) {
            case 'running':
                startSpinner(step.label);
                break;
            case 'done':
                stopSpinner();
                process.stderr.write(`  \x1b[32m✓\x1b[0m ${step.label}\n`);
                break;
            case 'failed': {
                stopSpinner();
                const detail = step.detail ? ` — ${step.detail}` : '';
                process.stderr.write(`  \x1b[31m✗\x1b[0m ${step.label}${detail}\n`);
                break;
            }
        }
    };
}

// ─── Tracker ─────────────────────────────────────────────────────

/** @internal exported for testing */
export class ProgressTracker {
    private readonly reporter: ProgressReporter;
    private startTimes = new Map<string, number>();

    constructor(reporter?: ProgressReporter) {
        this.reporter = reporter ?? createDefaultReporter();
    }

    start(id: string, label: string): void {
        this.startTimes.set(id, Date.now());
        this.reporter({ id, label, status: 'running' });
    }

    done(id: string, label: string, detail?: string): void {
        const durationMs = this.elapsed(id);
        this.reporter({
            id, label, status: 'done',
            ...(detail !== undefined ? { detail } : {}),
            ...(durationMs !== undefined ? { durationMs } : {}),
        });
    }

    fail(id: string, label: string, detail?: string): void {
        const durationMs = this.elapsed(id);
        this.reporter({
            id, label, status: 'failed',
            ...(detail !== undefined ? { detail } : {}),
            ...(durationMs !== undefined ? { durationMs } : {}),
        });
    }

    private elapsed(id: string): number | undefined {
        const start = this.startTimes.get(id);
        if (start === undefined) return undefined;
        this.startTimes.delete(id);
        return Date.now() - start;
    }
}
