# MVA Convention

::: info Prerequisites
Install Vurb.ts before following this guide: `npm install @vurb/core @modelcontextprotocol/sdk zod` — or scaffold a project with [`vurb create`](/quickstart-lightspeed).
:::

The MVA Convention maps each architectural layer — Model, View, Agent — to a file-system layout. Two generators produce this layout automatically: the OpenAPI generator creates three directories, the Prisma generator creates a flat structure.

## OpenAPI Generator Layout {#openapi-layout}

```text
src/
├── models/               ← M — defineModel() declarations
│   ├── PetModel.ts
│   └── StoreModel.ts
├── views/                ← V — Presenters
│   ├── pet.presenter.ts
│   └── store.presenter.ts
├── agents/               ← A — Tool definitions
│   ├── pet.tool.ts
│   └── store.tool.ts
├── index.ts              ← ToolRegistry + registerAll()
└── server.ts             ← attachToServer() bootstrap
```

Each layer imports only from the layer above: `agents/` → `views/` → `models/` → `@vurb/core`. One file per domain entity, named `{Entity}Model.ts`. The barrel and server file are both generated — you don't hand-write them.

Prompts are not generated. `autoDiscover()` only finds tool builders. See [Routing](/routing) for discovery details.

## Prisma Generator Layout {#prisma-layout}

```text
src/tools/database/
├── userPresenter.ts      ← V — Presenter + embedded Zod schema
├── userTools.ts          ← A — Tool definitions
├── postPresenter.ts
├── postTools.ts
└── index.ts              ← Barrel re-exports (no registry)
```

No separate `models/` directory — the `defineModel()` definition lives inside each `{model}Presenter.ts`. Files use camelCase with `Presenter.ts` or `Tools.ts` suffixes. The barrel emits re-exports only; you wire the `ToolRegistry` yourself.

## Model Layer {#model}

Models are defined with `defineModel()` — a single closure that declares field types, labels, defaults, fillable profiles, hidden fields, and guarded fields. The compiled Zod schema is available via `.schema` for Presenter validation.

```typescript
// models/PetModel.ts
import { defineModel } from '@vurb/core';

export const PetModel = defineModel('Pet', m => {
  m.casts({
    id:     m.id(),
    name:   m.string('Pet name'),
    status: m.enum('Adoption status', ['available', 'pending', 'sold'])
              .default('available'),
  });

  m.hidden(['internal_flags']);
  m.guarded(['id']);

  m.fillable({
    create: ['name', 'status'],
    update: ['name', 'status'],
    filter: ['status'],
  });
});

export const PetSchema = PetModel.schema;
export type Pet = typeof PetModel.infer;
```

The compiled schema rejects undeclared fields at parse time — a database row with `internal_flags` fails validation instead of leaking. `m.hidden()` fields are excluded from output, and `m.guarded()` fields can never be mass-assigned.

In the OpenAPI layout, Models live in `models/{Entity}Model.ts`. In the Prisma layout, the Model is embedded at the top of each Presenter file.

## View Layer {#view}

Presenters pair a Model's schema with perception logic — rules, UI blocks, affordances. One Presenter per entity, shared across every tool and prompt.

```typescript
// views/pet.presenter.ts — OpenAPI generator
import { createPresenter, ui } from '@vurb/core';
import { PetSchema } from '../models/PetModel.js';

export const PetPresenter = createPresenter('Pet')
  .schema(PetSchema)
  .rules(['Only show available pets unless explicitly requested.'])
  .ui((pet) => [
    ui.markdown(`**${pet.name}** — ${pet.status}`),
  ]);
```

The Prisma generator uses the fluent builder instead:

```typescript
// userPresenter.ts — Prisma generator
import { createPresenter } from '@vurb/core';
import { UserSchema } from './UserModel.js';

export const UserPresenter = createPresenter('User')
  .schema(UserSchema)
  .rules(['Data originates from the database via Prisma ORM.']);
```

Presenters never query databases or call APIs. They receive already-fetched data and shape perception.

## Agent Layer {#agent}

Tools import their Presenter, declare input, and attach a handler. The handler returns raw data; the Presenter handles the rest.

```typescript
// agents/pet.tool.ts
import { initVurb } from '@vurb/core';
import { PetModel } from '../models/PetModel.js';
import { PetPresenter } from '../views/pet.presenter.js';

const f = initVurb<ApiContext>();

export const getPet = f.query('pet.get_by_id')
  .describe('Get a pet by ID')
  .withNumber('petId', 'Pet ID')
  .returns(PetPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.pets.findUnique({ where: { id: input.petId } });
  });

export const createPet = f.action('pet.create')
  .describe('Add a new pet to the store')
  .fromModel(PetModel, 'create')   // ← derives input params from Model
  .returns(PetPresenter)
  .handle(async (input, ctx) => {
    return ctx.db.pets.create({ data: input });
  });
```

In the Prisma layout, imports are flat — `./userPresenter.js` instead of `../views/`.

## Dependency Flow {#deps}

```text
models/  →  views/  →  agents/  →  index.ts  →  server.ts
                                       ↓
                                    tests/
```

Models import nothing. Views import Models. Agents import Views. Tests import the registry barrel. No layer imports from a layer below it. The Prisma flat layout follows the same direction — `Tools.ts` imports from `Presenter.ts`, never the reverse.

## Test Structure {#tests}

Recommended convention for `@vurb/testing`. Neither generator creates test files.

```text
tests/
├── firewall/       ← Field whitelist (no data leaks)
├── guards/         ← Middleware & OOM guard tests
├── rules/          ← System rules verification
├── blocks/         ← UI blocks & truncation tests
└── setup.ts        ← Shared VurbTester instance
```

Use `.firewall.test.ts`, `.guard.test.ts`, `.rules.test.ts`, and `.blocks.test.ts` suffixes to match each concern.

## File Naming Reference {#naming}

**OpenAPI Generator:** `models/{Entity}Model.ts` → `views/{tag}.presenter.ts` → `agents/{tag}.tool.ts`

**Prisma Generator:** `{model}Presenter.ts` + `{model}Tools.ts` (flat, camelCase)

**Tests:** `tests/firewall/*.firewall.test.ts`, `tests/guards/*.guard.test.ts`, `tests/rules/*.rules.test.ts`, `tests/blocks/*.blocks.test.ts`
