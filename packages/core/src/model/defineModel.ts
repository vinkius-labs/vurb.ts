/**
 * defineModel — Eloquent-inspired Model Definition for Vurb.ts
 *
 * Synthesizes the best DX patterns from 10 globally acclaimed frameworks:
 *   • Laravel:  $casts, $fillable, $hidden, $guarded, timestamps()
 *   • Django:   choices (enum), verbose_name (label-first)
 *   • Rails:    attr_accessible (whitelist) + attr_protected (blacklist)
 *   • Prisma:   @default() values
 *   • Pydantic: Field(alias=, examples=, description=)
 *   • Drizzle:  column-as-function type helpers
 *   • Convex:   defineTable() factory
 *   • Spring:   @JsonIgnore → hidden
 *   • NestJS:   DTOs per operation → fillable profiles
 *   • Mongoose: schema options in closure
 *
 * @example
 * ```typescript
 * import { defineModel } from '@vurb/core';
 *
 * export const TaskModel = defineModel('Task', m => {
 *   m.casts({
 *     title:       m.string('Task title'),
 *     description: m.text('Description in markdown'),
 *     status:      m.enum('Status', ['open', 'done']).default('open'),
 *     due_date:    m.date('Due date'),
 *     is_bug:      m.boolean('Bug flag').default(false),
 *   });
 *
 *   m.timestamps();
 *   m.hidden(['internal_id']);
 *   m.guarded(['uuid', 'created_at', 'updated_at']);
 *
 *   m.fillable({
 *     create: ['title', 'description', 'due_date', 'is_bug'],
 *     update: ['title', 'description', 'due_date', 'is_bug'],
 *     filter: ['title', 'status', 'is_bug'],
 *   });
 * });
 * ```
 *
 * @module
 */

import { z, type ZodType, type ZodObject, type ZodRawShape } from 'zod';

// ── FieldDef (internal descriptor) ──────────────────────

/** Internal field type discriminator */
type FieldType =
    | 'string' | 'text' | 'number' | 'boolean'
    | 'date' | 'timestamp' | 'uuid' | 'id'
    | 'enum' | 'object' | 'list';

/** A field definition descriptor — chainable for .default(), .alias(), .examples() */
export class FieldDef {
    /** @internal */ readonly _type: FieldType;
    /** @internal */ readonly _label: string | undefined;
    /** @internal */ readonly _enumValues: readonly [string, ...string[]] | undefined;
    /** @internal */ readonly _shape: Record<string, FieldDef> | undefined;
    /** @internal */ _defaultValue?: unknown;
    /** @internal */ _alias?: string;
    /** @internal */ _examples?: unknown[];

    constructor(
        type: FieldType,
        label?: string,
        options?: {
            enumValues?: readonly [string, ...string[]];
            shape?: Record<string, FieldDef>;
        },
    ) {
        this._type = type;
        this._label = label;
        this._enumValues = options?.enumValues;
        this._shape = options?.shape;
    }

    /** Set a default value (Prisma-inspired `@default()`) */
    default(value: unknown): this {
        this._defaultValue = value;
        return this;
    }

    /** Set an alias name (Pydantic-inspired `Field(alias=)`) */
    alias(name: string): this {
        this._alias = name;
        return this;
    }

    /** Set example values (Pydantic-inspired `Field(examples=[])`) */
    examples(values: unknown[]): this {
        this._examples = values;
        return this;
    }
}

// ── Compile FieldDef → Zod ──────────────────────────────

function compileField(def: FieldDef): ZodType {
    let schema: ZodType;

    switch (def._type) {
        case 'string':
        case 'text':
            schema = z.string();
            break;
        case 'number':
            schema = z.number();
            break;
        case 'boolean':
            schema = z.boolean();
            break;
        case 'date':
            schema = z.string();
            break;
        case 'timestamp':
            schema = z.string();
            break;
        case 'uuid':
            schema = z.string();
            break;
        case 'id':
            // IDs are always required — return early with describe if present
            schema = z.number();
            if (def._label) schema = schema.describe(def._label);
            return schema;
        case 'enum':
            schema = z.enum(def._enumValues as [string, ...string[]]);
            break;
        case 'object': {
            const shape: ZodRawShape = {};
            if (def._shape) {
                for (const [key, childDef] of Object.entries(def._shape)) {
                    shape[key] = compileField(childDef);
                }
            }
            schema = z.object(shape);
            break;
        }
        case 'list': {
            const itemShape: ZodRawShape = {};
            if (def._shape) {
                for (const [key, childDef] of Object.entries(def._shape)) {
                    itemShape[key] = compileField(childDef);
                }
            }
            schema = z.array(z.object(itemShape));
            break;
        }
    }

    // Add description (label) — Drizzle + Django verbose_name
    if (def._label) {
        // Add format hint for date fields — automatically hint YYYY-MM-DD
        const label = def._type === 'date'
            ? `${def._label} (YYYY-MM-DD)`
            : def._label;
        schema = schema.describe(label);
    }

    // Everything except `id` is optional + nullable by default
    // (API responses may omit fields)
    if (def._type === 'boolean' || def._type === 'list') {
        schema = (schema as ReturnType<typeof z.boolean>).optional();
    } else {
        schema = (schema as ReturnType<typeof z.string>).optional().nullable();
    }

    return schema;
}

/**
 * Compile a FieldDef into a Zod schema for input context.
 *
 * Unlike `compileField()` (which defaults everything to optional for output schemas),
 * this function produces schemas suitable for tool input parameters:
 * - For **create**: string/text fields become required `z.string()`, number fields become optional
 * - For **update/filter** (`forceOptional = true`): all fields become optional
 *
 * @param def - Field definition to compile
 * @param forceOptional - If true, all fields become optional (update/filter semantics)
 * @returns Zod schema for input validation
 */
export function compileFieldForInput(def: FieldDef, forceOptional: boolean): ZodType {
    let schema: ZodType;

    switch (def._type) {
        case 'string':
        case 'text':
        case 'uuid':
        case 'date':
        case 'timestamp':
            schema = z.string();
            break;
        case 'number':
            schema = z.number();
            break;
        case 'boolean':
            schema = z.boolean();
            break;
        case 'id':
            schema = z.number();
            break;
        case 'enum':
            schema = z.enum(def._enumValues as [string, ...string[]]);
            break;
        case 'object': {
            const shape: ZodRawShape = {};
            if (def._shape) {
                for (const [key, childDef] of Object.entries(def._shape)) {
                    shape[key] = compileFieldForInput(childDef, false);
                }
            }
            schema = z.object(shape);
            break;
        }
        case 'list': {
            const itemShape: ZodRawShape = {};
            if (def._shape) {
                for (const [key, childDef] of Object.entries(def._shape)) {
                    itemShape[key] = compileFieldForInput(childDef, false);
                }
            }
            schema = z.array(z.object(itemShape));
            break;
        }
    }

    // Add description (label)
    if (def._label) {
        const label = def._type === 'date'
            ? `${def._label} (YYYY-MM-DD)`
            : def._label;
        schema = schema.describe(label);
    }

    // Apply optionality: forceOptional makes everything optional
    if (forceOptional) {
        schema = (schema as ReturnType<typeof z.string>).optional();
    }

    return schema;
}

// ── Model Interface ─────────────────────────────────────

/** The compiled Model object returned by `defineModel()` */
export interface Model {
    /** Model name (e.g. 'Task') */
    readonly name: string;
    /** Compiled Zod schema — compatible with Presenter.schema() */
    readonly schema: ZodObject<ZodRawShape>;
    /** Field definitions map */
    readonly fields: Record<string, FieldDef>;
    /** Hidden fields — never shown in output (Spring @JsonIgnore) */
    readonly hidden: string[];
    /** Guarded fields — never fillable (Rails attr_protected) */
    readonly guarded: string[];
    /** Input profiles per operation (Laravel $fillable) */
    readonly input: Record<string, string[]>;
    /** Default values (Prisma @default) */
    readonly defaults: Record<string, unknown>;
    /**
     * Apply field aliases — renames agent-facing keys to API-facing keys.
     * Pydantic-inspired `model_dump(by_alias=True)`.
     * Strips undefined values. Non-aliased keys pass through unchanged.
     *
     * @example
     * ```typescript
     * // Model: content → .alias('description')
     * ProposalModel.toApi({ title: 'X', content: 'Y' })
     * // → { title: 'X', description: 'Y' }
     * ```
     */
    readonly toApi: (data: Record<string, unknown>) => Record<string, unknown>;
    /** Type helper — `typeof model.infer` gives you the TS type */
    readonly infer: z.infer<ZodObject<ZodRawShape>>;
}

// ── ModelBuilder (the `m` argument) ─────────────────────

/**
 * Builder class that exposes type functions and configuration methods.
 * Passed as `m` in the `defineModel()` closure.
 */
export class ModelBuilder {
    /** @internal */ _fields: Record<string, FieldDef> = {};
    /** @internal */ _hidden: string[] = [];
    /** @internal */ _guarded: string[] = [];
    /** @internal */ _fillableProfiles: Record<string, string[]> = {};

    // ── Type Functions (Drizzle-style) ──────────────────

    /** String field — general purpose text */
    string(label?: string): FieldDef {
        return new FieldDef('string', label);
    }

    /** Text field — semantic: markdown, multiline, long content */
    text(label?: string): FieldDef {
        return new FieldDef('text', label);
    }

    /** Numeric field */
    number(label?: string): FieldDef {
        return new FieldDef('number', label);
    }

    /** Boolean field */
    boolean(label?: string): FieldDef {
        return new FieldDef('boolean', label);
    }

    /** Date field — automatically hints YYYY-MM-DD format */
    date(label?: string): FieldDef {
        return new FieldDef('date', label);
    }

    /** Timestamp field — ISO datetime */
    timestamp(label?: string): FieldDef {
        return new FieldDef('timestamp', label);
    }

    /** UUID field — string with UUID semantics */
    uuid(label?: string): FieldDef {
        return new FieldDef('uuid', label);
    }

    /** ID field — always required, numeric */
    id(label?: string): FieldDef {
        return new FieldDef('id', label);
    }

    /** Enum field — Django-style choices, tells AI valid values */
    enum(label: string, values: readonly [string, ...string[]]): FieldDef {
        return new FieldDef('enum', label, { enumValues: values });
    }

    /** Nested object field */
    object(label: string, shape: Record<string, FieldDef>): FieldDef {
        return new FieldDef('object', label, { shape });
    }

    /** Array of objects field */
    list(label: string, shape: Record<string, FieldDef>): FieldDef {
        return new FieldDef('list', label, { shape });
    }

    // ── Configuration Methods (Laravel-style) ───────────

    /** Define field types and labels — like Laravel's `$casts` */
    casts(fields: Record<string, FieldDef>): void {
        this._fields = { ...this._fields, ...fields };
    }

    /** Add created_at + updated_at timestamp fields — like Laravel's `timestamps()` */
    timestamps(): void {
        this._fields['created_at'] = new FieldDef('timestamp', 'Creation timestamp');
        this._fields['updated_at'] = new FieldDef('timestamp', 'Last update timestamp');
    }

    /** Fields hidden from output — like Spring's `@JsonIgnore` or Laravel's `$hidden` */
    hidden(fields: string[]): void {
        this._hidden = fields;
    }

    /** Fields that can NEVER be input — like Rails' `attr_protected` or Laravel's `$guarded` */
    guarded(fields: string[]): void {
        this._guarded = fields;
    }

    /** Define input profiles per operation — like Laravel's `$fillable` + NestJS DTOs */
    fillable(profiles: Record<string, string[]>): void {
        this._fillableProfiles = profiles;
    }

    // ── Compile ─────────────────────────────────────────

    /** @internal Compile all fields into a Zod schema */
    _compile(): { schema: ZodObject<ZodRawShape>; defaults: Record<string, unknown> } {
        const shape: ZodRawShape = {};
        const defaults: Record<string, unknown> = {};

        for (const [name, def] of Object.entries(this._fields)) {
            shape[name] = compileField(def);
            if (def._defaultValue !== undefined) {
                defaults[name] = def._defaultValue;
            }
        }

        return { schema: z.object(shape), defaults };
    }
}

// ── Factory ─────────────────────────────────────────────

/**
 * Define a Model — one file, one entity, one source of truth.
 *
 * @param name - Model name (e.g. 'Task', 'Sprint', 'Project')
 * @param configure - Closure function that receives a `ModelBuilder` (`m`)
 * @returns Compiled `Model` with `.schema`, `.fields`, `.input`, `.hidden`, `.guarded`
 */
export function defineModel(
    name: string,
    configure: (m: ModelBuilder) => void,
): Model {
    const builder = new ModelBuilder();
    configure(builder);

    const { schema, defaults } = builder._compile();

    // Pre-compute alias map at definition time (not per-call)
    const aliasMap = new Map<string, string>();
    for (const [fieldName, fieldDef] of Object.entries(builder._fields)) {
        if (fieldDef._alias) {
            aliasMap.set(fieldName, fieldDef._alias);
        }
    }

    const toApi = (data: Record<string, unknown>): Record<string, unknown> => {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
            if (v !== undefined) {
                result[aliasMap.get(k) ?? k] = v;
            }
        }
        return result;
    };

    return Object.freeze({
        name,
        schema,
        fields: Object.freeze(builder._fields),
        hidden: Object.freeze(builder._hidden) as string[],
        guarded: Object.freeze(builder._guarded) as string[],
        input: Object.freeze(builder._fillableProfiles),
        defaults: Object.freeze(defaults),
        toApi,
        infer: undefined as unknown as z.infer<ZodObject<ZodRawShape>>,
    });
}
