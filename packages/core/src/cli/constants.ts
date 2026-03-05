/**
 * CLI constants — version, help text, ANSI styling.
 * @module
 */
import { LOCKFILE_NAME } from '../introspection/CapabilityLockfile.js';

// ─── ANSI Styling (zero dependencies) ────────────────────────────

/** @internal exported for testing */
export const ansi = {
    cyan:   (s: string): string => `\x1b[36m${s}\x1b[0m`,
    green:  (s: string): string => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string): string => `\x1b[33m${s}\x1b[0m`,
    dim:    (s: string): string => `\x1b[2m${s}\x1b[0m`,
    bold:   (s: string): string => `\x1b[1m${s}\x1b[0m`,
    red:    (s: string): string => `\x1b[31m${s}\x1b[0m`,
    reset: '\x1b[0m',
} as const;

// ─── Version ─────────────────────────────────────────────────────

/** @internal exported for testing */
export const MCP_FUSION_VERSION = '1.1.0';

/** Default API endpoint — Vinkius Cloud production */
export const VINKIUS_CLOUD_URL = 'https://cloud.vinkius.com';

// ─── Validation Constants ────────────────────────────────────────

export const VALID_TRANSPORTS = ['stdio', 'sse'] as const;
export const VALID_VECTORS = ['vanilla', 'prisma', 'n8n', 'openapi', 'oauth'] as const;

// ─── Help Text ───────────────────────────────────────────────────

/** @internal exported for testing */
export const HELP = `
fusion — MCP Fusion CLI

USAGE
  fusion create <name>                Scaffold a new MCP Fusion server
  fusion dev --server <entry>         Start HMR dev server with auto-reload
  fusion lock                         Generate or update ${LOCKFILE_NAME}
  fusion lock --check                 Verify lockfile is up to date (CI gate)
  fusion deploy                       Bundle, compress & deploy to Edge
  fusion remote                       Show current remote configuration
  fusion inspect                      Launch the real-time TUI dashboard
  fusion insp --demo                  Launch TUI with built-in simulator

CREATE OPTIONS
  --transport <stdio|sse>  Transport layer (default: stdio)
  --vector <type>          Ingestion vector: vanilla, prisma, n8n, openapi, oauth
  --testing                Include test suite (default: true)
  --no-testing             Skip test suite
  --yes, -y                Skip prompts, use defaults

DEV OPTIONS
  --server, -s <path>      Path to server entrypoint (default: auto-detect)
  --dir, -d <path>         Directory to watch for changes (default: auto-detect from server)

DEPLOY OPTIONS
  --server, -s <path>      Path to server entrypoint (default: auto-detect)
  --token <token>          Override FUSION_DEPLOY_TOKEN (connection token)

REMOTE OPTIONS
  fusion remote <url>          Override API endpoint (default: Vinkius Cloud)
  fusion remote --server-id <id>  Set target server UUID

INSPECTOR OPTIONS
  --demo, -d               Launch with built-in simulator (no server needed)
  --out, -o <mode>         Output: tui (default), stderr (headless ECS/K8s)
  --pid, -p <pid>          Connect to a specific server PID
  --path <path>            Custom IPC socket/pipe path

LOCK OPTIONS
  --server, -s <path>      Path to server entrypoint
  --name, -n <name>        Server name for lockfile header
  --cwd <dir>              Project root directory

GLOBAL
  --help, -h               Show this help message

EXAMPLES
  fusion create my-server
  fusion create my-server -y
  fusion create my-server --vector prisma --transport sse
  fusion dev --server ./src/server.ts
  fusion dev --server ./src/server.ts --dir ./src/tools
  fusion lock --server ./src/server.ts
  fusion deploy
  fusion remote --server-id abc-123-def
  fusion remote http://localhost:8080 --server-id abc-123-def
  fusion inspect --demo
  fusion insp --pid 12345
`.trim();
