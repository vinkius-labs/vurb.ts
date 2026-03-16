/**
 * EDGE-COMPATIBLE SERVER — Vinkius Edge Deployment
 *
 * This example shows how to structure a server.ts for `vurb deploy`.
 * Key difference: NO autoDiscover() — all tools registered explicitly.
 *
 * V8 Isolate constraints:
 *   ✅ Explicit imports + registry.register()
 *   ✅ All @vurb/core APIs (defineModel, definePresenter, initVurb, etc.)
 *   ✅ Zod schemas, middleware, prompts
 *   ❌ autoDiscover() (uses fs.readdir — unavailable in isolates)
 *   ❌ SandboxEngine (uses child_process + fs)
 *   ❌ Inspector / @vurb/inspector (uses Node.js IPC)
 *   ❌ Direct filesystem access (fs, path at runtime)
 *   ❌ Native addons (isolated-vm, etc.)
 */

import {
    initVurb,
    defineModel,
    definePresenter,
    definePrompt,
    PromptMessage,
    PromptRegistry,
    startServer,
    ui,
} from '@vurb/core';

// ═══════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════
interface AppContext {
    tenantId: string;
    role: 'admin' | 'member' | 'guest';
}

const f = initVurb<AppContext>();

// ═══════════════════════════════════════════════════════════════
// MODEL
// ═══════════════════════════════════════════════════════════════
const NoteModel = defineModel('Note', m => {
    m.casts({
        id:      m.uuid(),
        title:   m.string('Note title'),
        content: m.text('Note body in markdown'),
        pinned:  m.boolean('Whether the note is pinned'),
    });
    m.timestamps();
    m.fillable({
        create: ['title', 'content'],
        update: ['title', 'content', 'pinned'],
    });
});

// ═══════════════════════════════════════════════════════════════
// PRESENTER
// ═══════════════════════════════════════════════════════════════
const NotePresenter = definePresenter({
    name: 'Note',
    schema: NoteModel,
    ui: (note) => [
        ui.markdown(`📝 **${note.title}** ${note.pinned ? '📌' : ''}`),
    ],
    agentLimit: { max: 50 },
    suggestActions: (note) => note.pinned
        ? [{ tool: 'note.unpin', reason: 'Unpin this note', args: { id: note.id } }]
        : [{ tool: 'note.pin', reason: 'Pin this note', args: { id: note.id } }],
});

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
const requireAuth = f.middleware(async (ctx) => {
    if (ctx.role === 'guest') throw new Error('Authentication required');
    return { role: ctx.role };
});

// ═══════════════════════════════════════════════════════════════
// TOOLS — Explicit imports (edge-compatible)
// ═══════════════════════════════════════════════════════════════
// In a real project, these would be in separate files under agents/
// and imported explicitly: import { listNotes } from './agents/notes.js';

const note = f.router('note').describe('Note management').use(requireAuth);

const listNotes = note.query('list')
    .describe('List all notes')
    .withOptionalBoolean('pinned', 'Filter by pinned status')
    .returns(NotePresenter)
    .handle(async (input, ctx) => {
        // In edge, data comes from ctx.client API calls — no direct DB
        return [
            { id: 'n-1', title: 'Welcome', content: 'First note', pinned: true, created_at: '2024-01-01', updated_at: '2024-01-01' },
        ];
    });

const createNote = note.mutation('create')
    .describe('Create a new note')
    .invalidates('note.*')
    .fromModel(NoteModel, 'create')
    .handle(async (input, ctx) => {
        return { id: 'n-new', ...input, pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    });

const pinNote = note.action('pin')
    .describe('Pin a note')
    .invalidates('note.*')
    .withString('id', 'Note UUID')
    .handle(async (input) => ({ pinned: true, id: input.id }));

const unpinNote = note.action('unpin')
    .describe('Unpin a note')
    .invalidates('note.*')
    .withString('id', 'Note UUID')
    .handle(async (input) => ({ pinned: false, id: input.id }));

// ═══════════════════════════════════════════════════════════════
// PROMPT
// ═══════════════════════════════════════════════════════════════
const SummarizePrompt = definePrompt<AppContext>('summarize_notes', {
    title: 'Summarize Notes',
    description: 'Generate a summary of all notes',
    args: {} as const,
    handler: async () => ({
        messages: [
            PromptMessage.system('You are a note summarization assistant.'),
            PromptMessage.user('Summarize all notes, highlighting pinned items first.'),
        ],
    }),
});

// ═══════════════════════════════════════════════════════════════
// REGISTRY — Explicit registration (NO autoDiscover)
// ═══════════════════════════════════════════════════════════════
const registry = f.registry();
const prompts = new PromptRegistry<AppContext>();

// ⚠️ EDGE DEPLOYMENT: register each tool explicitly
// autoDiscover() uses fs.readdir which is unavailable in V8 isolates
registry.register(listNotes);
registry.register(createNote);
registry.register(pinNote);
registry.register(unpinNote);

prompts.register(SummarizePrompt);

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════
await startServer({
    name: 'notes-edge',
    version: '1.0.0',
    registry,
    prompts,
    contextFactory: () => ({
        tenantId: 'default',
        role: 'admin' as const,
    }),
});
