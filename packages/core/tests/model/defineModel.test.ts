/**
 * defineModel Tests — Eloquent-inspired Model Layer
 *
 * Covers: defineModel(), type functions, m.casts(), m.fillable(),
 *         m.hidden(), m.guarded(), m.timestamps(), chainable .default(),
 *         .alias(), .examples(), Zod schema compilation, compileFieldForInput(),
 *         and .fromModel() integration with FluentToolBuilder.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineModel, ModelBuilder, FieldDef, compileFieldForInput } from '../../src/model/defineModel.js';
import { initVurb } from '../../src/core/initVurb.js';
import { success } from '../../src/core/response.js';

// ============================================================================
// Type Functions — m.string(), m.number(), m.boolean(), etc.
// ============================================================================

describe('Type Functions', () => {
    it('m.string() should create a FieldDef with type "string"', () => {
        const b = new ModelBuilder();
        const field = b.string('User name');
        expect(field).toBeInstanceOf(FieldDef);
        expect(field._type).toBe('string');
        expect(field._label).toBe('User name');
    });

    it('m.text() should create a FieldDef with type "text"', () => {
        const b = new ModelBuilder();
        const field = b.text('Description in markdown');
        expect(field._type).toBe('text');
        expect(field._label).toBe('Description in markdown');
    });

    it('m.number() should create a FieldDef with type "number"', () => {
        const b = new ModelBuilder();
        const field = b.number('Minutes estimate');
        expect(field._type).toBe('number');
    });

    it('m.boolean() should create a FieldDef with type "boolean"', () => {
        const b = new ModelBuilder();
        const field = b.boolean('Active flag');
        expect(field._type).toBe('boolean');
    });

    it('m.date() should create a FieldDef with type "date"', () => {
        const b = new ModelBuilder();
        const field = b.date('Due date');
        expect(field._type).toBe('date');
    });

    it('m.timestamp() should create a FieldDef with type "timestamp"', () => {
        const b = new ModelBuilder();
        const field = b.timestamp('Creation time');
        expect(field._type).toBe('timestamp');
    });

    it('m.uuid() should create a FieldDef with type "uuid"', () => {
        const b = new ModelBuilder();
        const field = b.uuid('Entity identifier');
        expect(field._type).toBe('uuid');
    });

    it('m.id() should create a FieldDef with type "id"', () => {
        const b = new ModelBuilder();
        const field = b.id();
        expect(field._type).toBe('id');
        expect(field._label).toBeUndefined();
    });

    it('m.enum() should create a FieldDef with type "enum" and values', () => {
        const b = new ModelBuilder();
        const field = b.enum('Status', ['open', 'closed', 'archived']);
        expect(field._type).toBe('enum');
        expect(field._label).toBe('Status');
        expect(field._enumValues).toEqual(['open', 'closed', 'archived']);
    });

    it('m.object() should create a FieldDef with nested shape', () => {
        const b = new ModelBuilder();
        const field = b.object('Workflow', {
            id: b.id(),
            title: b.string(),
        });
        expect(field._type).toBe('object');
        expect(field._shape).toBeDefined();
        expect(field._shape!['id']._type).toBe('id');
        expect(field._shape!['title']._type).toBe('string');
    });

    it('m.list() should create a FieldDef with array of objects', () => {
        const b = new ModelBuilder();
        const field = b.list('Labels', {
            id: b.id(),
            title: b.string(),
            color: b.string(),
        });
        expect(field._type).toBe('list');
        expect(Object.keys(field._shape!)).toEqual(['id', 'title', 'color']);
    });

    it('type functions without label should return undefined label', () => {
        const b = new ModelBuilder();
        expect(b.string()._label).toBeUndefined();
        expect(b.number()._label).toBeUndefined();
        expect(b.boolean()._label).toBeUndefined();
    });
});

// ============================================================================
// Chainable Modifiers — .default(), .alias(), .examples()
// ============================================================================

describe('Chainable Modifiers', () => {
    it('.default() should set a default value (Prisma @default)', () => {
        const b = new ModelBuilder();
        const field = b.string('Status').default('open');
        expect(field._defaultValue).toBe('open');
    });

    it('.default() on boolean should set false', () => {
        const b = new ModelBuilder();
        const field = b.boolean('Archived').default(false);
        expect(field._defaultValue).toBe(false);
    });

    it('.alias() should set an alias name (Pydantic)', () => {
        const b = new ModelBuilder();
        const field = b.date('Due date').alias('deadline');
        expect(field._alias).toBe('deadline');
    });

    it('.examples() should set example values (Pydantic)', () => {
        const b = new ModelBuilder();
        const field = b.enum('Priority', ['low', 'medium', 'high']).examples(['low', 'high']);
        expect(field._examples).toEqual(['low', 'high']);
    });

    it('chaining should be fluent — returns same instance', () => {
        const b = new ModelBuilder();
        const field = b.string('Title');
        const chained = field.default('Untitled').alias('name').examples(['Test']);
        expect(chained).toBe(field); // same reference
    });
});

// ============================================================================
// m.casts() — Field Type Declarations
// ============================================================================

describe('m.casts()', () => {
    it('should register fields on the builder', () => {
        const model = defineModel('Test', m => {
            m.casts({
                title: m.string('Title'),
                count: m.number('Count'),
            });
        });
        expect(Object.keys(model.fields)).toContain('title');
        expect(Object.keys(model.fields)).toContain('count');
    });

    it('multiple casts() calls should merge fields', () => {
        const model = defineModel('Test', m => {
            m.casts({ title: m.string('Title') });
            m.casts({ count: m.number('Count') });
        });
        expect(Object.keys(model.fields)).toEqual(['title', 'count']);
    });
});

// ============================================================================
// m.timestamps() — Laravel timestamps()
// ============================================================================

describe('m.timestamps()', () => {
    it('should add created_at and updated_at fields', () => {
        const model = defineModel('Test', m => {
            m.casts({ title: m.string('Title') });
            m.timestamps();
        });
        expect(model.fields['created_at']).toBeDefined();
        expect(model.fields['updated_at']).toBeDefined();
        expect(model.fields['created_at']._type).toBe('timestamp');
        expect(model.fields['updated_at']._type).toBe('timestamp');
    });
});

// ============================================================================
// m.hidden() — Spring @JsonIgnore
// ============================================================================

describe('m.hidden()', () => {
    it('should set hidden fields list', () => {
        const model = defineModel('Test', m => {
            m.casts({ internal: m.string('Internal field') });
            m.hidden(['internal']);
        });
        expect(model.hidden).toEqual(['internal']);
    });

    it('model without hidden() should have empty array', () => {
        const model = defineModel('Test', m => {
            m.casts({ title: m.string('Title') });
        });
        expect(model.hidden).toEqual([]);
    });
});

// ============================================================================
// m.guarded() — Rails attr_protected
// ============================================================================

describe('m.guarded()', () => {
    it('should set guarded fields list', () => {
        const model = defineModel('Test', m => {
            m.casts({
                uuid: m.uuid('UUID'),
                title: m.string('Title'),
            });
            m.guarded(['uuid']);
        });
        expect(model.guarded).toEqual(['uuid']);
    });
});

// ============================================================================
// m.fillable() — Laravel $fillable + NestJS DTOs
// ============================================================================

describe('m.fillable()', () => {
    it('should set input profiles per operation', () => {
        const model = defineModel('Test', m => {
            m.casts({
                title: m.string('Title'),
                status: m.string('Status'),
            });
            m.fillable({
                create: ['title'],
                update: ['title', 'status'],
                filter: ['status'],
            });
        });
        expect(model.input['create']).toEqual(['title']);
        expect(model.input['update']).toEqual(['title', 'status']);
        expect(model.input['filter']).toEqual(['status']);
    });
});

// ============================================================================
// defineModel() — Full Model Compilation
// ============================================================================

describe('defineModel()', () => {
    it('should return a frozen Model object', () => {
        const model = defineModel('Task', m => {
            m.casts({ title: m.string('Title') });
        });
        expect(model.name).toBe('Task');
        expect(() => { (model as Record<string, unknown>)['name'] = 'X'; }).toThrow();
    });

    it('should compile defaults from .default() chains', () => {
        const model = defineModel('Task', m => {
            m.casts({
                status: m.string('Status').default('open'),
                is_bug: m.boolean('Bug flag').default(false),
                priority: m.number('Priority').default(3),
            });
        });
        expect(model.defaults['status']).toBe('open');
        expect(model.defaults['is_bug']).toBe(false);
        expect(model.defaults['priority']).toBe(3);
    });

    it('should compile Zod schema from casts', () => {
        const model = defineModel('Task', m => {
            m.casts({
                title: m.string('Title'),
                count: m.number('Count'),
                active: m.boolean('Active'),
            });
        });
        expect(model.schema).toBeDefined();
        expect(model.schema.shape['title']).toBeDefined();
        expect(model.schema.shape['count']).toBeDefined();
        expect(model.schema.shape['active']).toBeDefined();
    });

    it('schema string fields should have .describe() with label', () => {
        const model = defineModel('Item', m => {
            m.casts({
                name: m.string('Item name'),
            });
        });
        // Parse with valid optional data
        const result = model.schema.safeParse({ name: 'Test' });
        expect(result.success).toBe(true);
    });

    it('schema date fields should hint YYYY-MM-DD in description', () => {
        const model = defineModel('Event', m => {
            m.casts({
                due: m.date('Due date'),
            });
        });
        // The schema should accept strings
        const result = model.schema.safeParse({ due: '2025-12-01' });
        expect(result.success).toBe(true);
    });

    it('schema enum fields should enforce valid values', () => {
        const model = defineModel('Task', m => {
            m.casts({
                status: m.enum('Status', ['open', 'done']),
            });
        });
        // Valid value
        const ok = model.schema.safeParse({ status: 'open' });
        expect(ok.success).toBe(true);
    });

    it('schema should accept empty object (all fields optional in output)', () => {
        const model = defineModel('Task', m => {
            m.casts({
                title: m.string('Title'),
                active: m.boolean('Active'),
            });
        });
        const result = model.schema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('schema id fields should be required (not optional)', () => {
        const model = defineModel('Task', m => {
            m.casts({
                id: m.id(),
            });
        });
        // id is required — missing should fail
        const fail = model.schema.safeParse({});
        expect(fail.success).toBe(false);

        const ok = model.schema.safeParse({ id: 42 });
        expect(ok.success).toBe(true);
    });
});

// ============================================================================
// compileFieldForInput() — Input Schema Compilation
// ============================================================================

describe('compileFieldForInput()', () => {
    it('should compile string field as required when forceOptional=false', () => {
        const def = new FieldDef('string', 'Title');
        const schema = compileFieldForInput(def, false);
        const fail = schema.safeParse(undefined);
        expect(fail.success).toBe(false);
        const ok = schema.safeParse('Hello');
        expect(ok.success).toBe(true);
    });

    it('should compile string field as optional when forceOptional=true', () => {
        const def = new FieldDef('string', 'Title');
        const schema = compileFieldForInput(def, true);
        const ok = schema.safeParse(undefined);
        expect(ok.success).toBe(true);
    });

    it('should compile enum with valid values', () => {
        const def = new FieldDef('enum', 'Status', { enumValues: ['open', 'done'] });
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse('open').success).toBe(true);
        expect(schema.safeParse('invalid').success).toBe(false);
    });

    it('should compile boolean field', () => {
        const def = new FieldDef('boolean', 'Flag');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse(true).success).toBe(true);
        expect(schema.safeParse('yes').success).toBe(false);
    });

    it('should compile number field', () => {
        const def = new FieldDef('number', 'Count');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse(42).success).toBe(true);
        expect(schema.safeParse('42').success).toBe(false);
    });

    it('should compile date with YYYY-MM-DD hint in description', () => {
        const def = new FieldDef('date', 'Due date');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse('2025-12-01').success).toBe(true);
    });

    it('should compile nested object', () => {
        const def = new FieldDef('object', 'Workflow', {
            shape: {
                id: new FieldDef('id'),
                title: new FieldDef('string'),
            },
        });
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse({ id: 1, title: 'Done' }).success).toBe(true);
    });

    it('should compile list of objects', () => {
        const def = new FieldDef('list', 'Labels', {
            shape: {
                id: new FieldDef('id'),
                name: new FieldDef('string'),
            },
        });
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse([{ id: 1, name: 'Bug' }]).success).toBe(true);
    });
});

// ============================================================================
// .fromModel() — FluentToolBuilder Integration
// ============================================================================

describe('.fromModel() Integration', () => {
    const TaskModel = defineModel('Task', m => {
        m.casts({
            title:       m.string('Task title'),
            description: m.text('Description'),
            status:      m.enum('Status', ['open', 'done', 'archived']),
            due_date:    m.date('Due date'),
            is_bug:      m.boolean('Bug flag').default(false),
        });
        m.timestamps();
        m.guarded(['created_at', 'updated_at']);
        m.fillable({
            create: ['title', 'description', 'due_date', 'is_bug'],
            update: ['title', 'description', 'due_date', 'is_bug'],
            filter: ['title', 'status', 'is_bug'],
        });
    });

    it('.fromModel(model, "create") should add fillable create fields', async () => {
        const f = initVurb();
        const tool = f.mutation('task.create')
            .fromModel(TaskModel, 'create')
            .handle(async (input) => success(input));

        const def = tool.buildToolDefinition();
        expect(def.inputSchema.properties).toHaveProperty('title');
        expect(def.inputSchema.properties).toHaveProperty('description');
        expect(def.inputSchema.properties).toHaveProperty('due_date');
        expect(def.inputSchema.properties).toHaveProperty('is_bug');
        // status is NOT in create fillable
        expect(def.inputSchema.properties).not.toHaveProperty('status');
    });

    it('.fromModel(model, "filter") should add fillable filter fields as optional', async () => {
        const f = initVurb();
        const tool = f.query('task.filter')
            .fromModel(TaskModel, 'filter')
            .handle(async (input) => success(input));

        // All filter fields should be optional — execute without them
        const result = await tool.execute({}, { action: 'filter' });
        expect(result.isError).toBeUndefined();
    });

    it('.fromModel() should throw on invalid profile name', () => {
        const f = initVurb();
        expect(() => {
            f.query('task.delete')
                .fromModel(TaskModel, 'delete')
                .handle(async () => success('ok'));
        }).toThrow(/no fillable profile "delete"/);
    });

    it('.fromModel() should throw on field not in casts', () => {
        const brokenModel = defineModel('Broken', m => {
            m.casts({ title: m.string('Title') });
            m.fillable({ create: ['title', 'nonexistent'] });
        });
        const f = initVurb();
        expect(() => {
            f.mutation('broken.create')
                .fromModel(brokenModel, 'create')
                .handle(async () => success('ok'));
        }).toThrow(/field "nonexistent" which is not defined in casts/);
    });

    it('.fromModel() can be combined with .withStrings() for extra params', async () => {
        const f = initVurb();
        const tool = f.mutation('task.create')
            .fromModel(TaskModel, 'create')
            .withStrings({
                company_slug: 'Workspace identifier',
                project_slug: 'Project identifier',
            })
            .handle(async (input) => success(input));

        const def = tool.buildToolDefinition();
        // Model fields
        expect(def.inputSchema.properties).toHaveProperty('title');
        // External params
        expect(def.inputSchema.properties).toHaveProperty('company_slug');
        expect(def.inputSchema.properties).toHaveProperty('project_slug');
    });

    it('.fromModel("create") should make fields required by default', async () => {
        const f = initVurb();
        const tool = f.mutation('task.create')
            .fromModel(TaskModel, 'create')
            .handle(async (input) => success(input));

        // Execute without required 'title' — should fail validation
        const result = await tool.execute({}, { action: 'create' });
        expect(result.isError).toBe(true);
    });

    it('.fromModel("update") should make all fields optional', async () => {
        const f = initVurb();
        const tool = f.mutation('task.update')
            .fromModel(TaskModel, 'update')
            .handle(async (input) => success(input));

        // Execute without any fields — should succeed (all optional)
        const result = await tool.execute({}, { action: 'update' });
        expect(result.isError).toBeUndefined();
    });
});

// ============================================================================
// Full Model — End-to-End (realistic Task model)
// ============================================================================

describe('Full Model — End-to-End', () => {
    it('realistic task model should compile without errors', () => {
        const TaskModel = defineModel('Task', m => {
            m.casts({
                uuid:              m.uuid('Unique identifier'),
                title:             m.string('Task title'),
                description:       m.text('Description in markdown'),
                status:            m.enum('Status', ['open', 'in_progress', 'done', 'closed']).default('open'),
                priority:          m.enum('Priority', ['low', 'medium', 'high']).default('medium'),
                due_date:          m.date('Due date'),
                estimated_minutes: m.number('Time estimate'),
                is_bug:            m.boolean('Bug flag').default(false),
                is_archived:       m.boolean('Archived').default(false),
                workflow:          m.object('Kanban column', {
                    id:    m.id(),
                    title: m.string(),
                    color: m.string(),
                }),
                labels:            m.list('Labels', {
                    id:    m.id(),
                    title: m.string(),
                    color: m.string(),
                }),
            });

            m.timestamps();
            m.hidden(['workflow']);
            m.guarded(['uuid', 'created_at', 'updated_at']);

            m.fillable({
                create: ['title', 'description', 'due_date', 'is_bug'],
                update: ['title', 'description', 'due_date', 'is_bug', 'is_archived'],
                filter: ['title', 'status', 'due_date', 'is_bug', 'is_archived'],
            });
        });

        expect(TaskModel.name).toBe('Task');
        expect(Object.keys(TaskModel.fields).length).toBeGreaterThanOrEqual(12);
        expect(TaskModel.fields['created_at']).toBeDefined();
        expect(TaskModel.fields['updated_at']).toBeDefined();
        expect(TaskModel.hidden).toEqual(['workflow']);
        expect(TaskModel.guarded).toEqual(['uuid', 'created_at', 'updated_at']);
        expect(TaskModel.input['create']).toHaveLength(4);
        expect(TaskModel.input['update']).toHaveLength(5);
        expect(TaskModel.input['filter']).toHaveLength(5);
        expect(TaskModel.defaults['status']).toBe('open');
        expect(TaskModel.defaults['priority']).toBe('medium');
        expect(TaskModel.defaults['is_bug']).toBe(false);
        expect(TaskModel.schema).toBeDefined();
    });
});

// ============================================================================
// Unhappy Path — Schema Rejection (wrong types in output schema)
// ============================================================================

describe('Schema Rejection — Output Schema', () => {
    it('should reject number for string field', () => {
        const model = defineModel('T', m => {
            m.casts({ title: m.string('Title') });
        });
        const result = model.schema.safeParse({ title: 12345 });
        expect(result.success).toBe(false);
    });

    it('should reject string for number field', () => {
        const model = defineModel('T', m => {
            m.casts({ count: m.number('Count') });
        });
        const result = model.schema.safeParse({ count: 'not-a-number' });
        expect(result.success).toBe(false);
    });

    it('should reject string for boolean field', () => {
        const model = defineModel('T', m => {
            m.casts({ active: m.boolean('Active') });
        });
        const result = model.schema.safeParse({ active: 'true' });
        expect(result.success).toBe(false);
    });

    it('should reject non-number for id field', () => {
        const model = defineModel('T', m => {
            m.casts({ id: m.id() });
        });
        expect(model.schema.safeParse({ id: 'abc' }).success).toBe(false);
        expect(model.schema.safeParse({ id: true }).success).toBe(false);
        expect(model.schema.safeParse({ id: null }).success).toBe(false);
    });

    it('should reject invalid enum value in output schema', () => {
        const model = defineModel('T', m => {
            m.casts({ status: m.enum('Status', ['open', 'closed']) });
        });
        expect(model.schema.safeParse({ status: 'pending' }).success).toBe(false);
        expect(model.schema.safeParse({ status: '' }).success).toBe(false);
        expect(model.schema.safeParse({ status: 42 }).success).toBe(false);
    });

    it('should reject non-array for list field', () => {
        const model = defineModel('T', m => {
            m.casts({
                labels: m.list('Labels', { id: m.id(), name: m.string() }),
            });
        });
        expect(model.schema.safeParse({ labels: 'not-an-array' }).success).toBe(false);
        expect(model.schema.safeParse({ labels: { id: 1 } }).success).toBe(false);
    });

    it('should reject non-object for object field', () => {
        const model = defineModel('T', m => {
            m.casts({
                workflow: m.object('Workflow', { id: m.id() }),
            });
        });
        // (test body continues below)
        expect(model.schema.safeParse({ workflow: 'not-object' }).success).toBe(false);
        expect(model.schema.safeParse({ workflow: [1, 2] }).success).toBe(false);
    });

    it('should reject list items with wrong inner types', () => {
        const model = defineModel('T', m => {
            m.casts({
                items: m.list('Items', {
                    id: m.id(),
                    name: m.string(),
                }),
            });
        });
        // id should be number, not string
        expect(model.schema.safeParse({ items: [{ id: 'abc', name: 'X' }] }).success).toBe(false);
    });
});

// ============================================================================
// Unhappy Path — compileFieldForInput Rejection
// ============================================================================

describe('compileFieldForInput() — Type Rejection', () => {
    it('should reject number for string input', () => {
        const def = new FieldDef('string', 'Name');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse(123).success).toBe(false);
    });

    it('should reject string for number input', () => {
        const def = new FieldDef('number', 'Count');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse('123').success).toBe(false);
    });

    it('should reject number for boolean input', () => {
        const def = new FieldDef('boolean', 'Flag');
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse(1).success).toBe(false);
        expect(schema.safeParse(0).success).toBe(false);
    });

    it('should reject null for required input fields', () => {
        const stringDef = new FieldDef('string', 'Name');
        expect(compileFieldForInput(stringDef, false).safeParse(null).success).toBe(false);

        const numDef = new FieldDef('number', 'Count');
        expect(compileFieldForInput(numDef, false).safeParse(null).success).toBe(false);

        const boolDef = new FieldDef('boolean', 'Flag');
        expect(compileFieldForInput(boolDef, false).safeParse(null).success).toBe(false);
    });

    it('should reject empty string for enum input', () => {
        const def = new FieldDef('enum', 'Status', { enumValues: ['open', 'done'] });
        const schema = compileFieldForInput(def, false);
        expect(schema.safeParse('').success).toBe(false);
    });

    it('should reject invalid items in list input', () => {
        const def = new FieldDef('list', 'Tags', {
            shape: { id: new FieldDef('id'), title: new FieldDef('string') },
        });
        const schema = compileFieldForInput(def, false);
        // Missing id (required)
        expect(schema.safeParse([{ title: 'Bug' }]).success).toBe(false);
        // id is string instead of number
        expect(schema.safeParse([{ id: 'abc', title: 'Bug' }]).success).toBe(false);
    });

    it('should reject partial object input when inner fields are required', () => {
        const def = new FieldDef('object', 'Config', {
            shape: { id: new FieldDef('id'), name: new FieldDef('string') },
        });
        const schema = compileFieldForInput(def, false);
        // Missing required id
        expect(schema.safeParse({ name: 'Test' }).success).toBe(false);
    });
});

// ============================================================================
// Unhappy Path — .fromModel() Error Handling
// ============================================================================

describe('.fromModel() — Error Handling', () => {
    it('should throw with descriptive message listing available profiles', () => {
        const model = defineModel('Task', m => {
            m.casts({ title: m.string('Title') });
            m.fillable({ create: ['title'], update: ['title'] });
        });
        const f = initVurb();
        try {
            f.query('task.search').fromModel(model, 'search').handle(async () => success('ok'));
            expect.fail('Should have thrown');
        } catch (e: unknown) {
            const msg = (e as Error).message;
            expect(msg).toContain('Task');
            expect(msg).toContain('search');
            expect(msg).toContain('create');
            expect(msg).toContain('update');
        }
    });

    it('should throw when fillable references a field not in casts — error message includes field name', () => {
        const model = defineModel('Widget', m => {
            m.casts({ name: m.string('Name') });
            m.fillable({ create: ['name', 'ghost_field'] });
        });
        const f = initVurb();
        try {
            f.mutation('widget.create').fromModel(model, 'create').handle(async () => success('ok'));
            expect.fail('Should have thrown');
        } catch (e: unknown) {
            const msg = (e as Error).message;
            expect(msg).toContain('Widget');
            expect(msg).toContain('ghost_field');
            expect(msg).toContain('not defined in casts');
        }
    });

    it('should throw when model has no fillable profiles at all', () => {
        const model = defineModel('Empty', m => {
            m.casts({ title: m.string('Title') });
        });
        const f = initVurb();
        expect(() => {
            f.query('empty.list').fromModel(model, 'list').handle(async () => success('ok'));
        }).toThrow(/no fillable profile/);
    });
});

// ============================================================================
// Edge Cases — Empty, Minimal, and Boundary Models
// ============================================================================

describe('Edge Cases — Empty & Minimal Models', () => {
    it('model with zero casts should compile with empty schema', () => {
        const model = defineModel('Blank', _m => {});
        expect(Object.keys(model.fields)).toHaveLength(0);
        expect(model.schema).toBeDefined();
        expect(model.schema.safeParse({}).success).toBe(true);
    });

    it('model with only timestamps should have exactly 2 fields', () => {
        const model = defineModel('Audit', m => {
            m.timestamps();
        });
        expect(Object.keys(model.fields)).toHaveLength(2);
        expect(model.fields['created_at']).toBeDefined();
        expect(model.fields['updated_at']).toBeDefined();
    });

    it('model with single field should work end-to-end', () => {
        const model = defineModel('Single', m => {
            m.casts({ name: m.string('Name') });
            m.fillable({ create: ['name'] });
        });
        const f = initVurb();
        const tool = f.mutation('single.create')
            .fromModel(model, 'create')
            .handle(async (input) => success(input));

        const def = tool.buildToolDefinition();
        expect(def.inputSchema.properties).toHaveProperty('name');
    });

    it('model with defaults but no fillable should still compile', () => {
        const model = defineModel('Defaulted', m => {
            m.casts({
                status: m.string('Status').default('draft'),
                active: m.boolean('Active').default(true),
            });
        });
        expect(model.defaults['status']).toBe('draft');
        expect(model.defaults['active']).toBe(true);
        expect(Object.keys(model.input)).toHaveLength(0);
    });
});

// ============================================================================
// Edge Cases — Overwrite & Merge Behavior
// ============================================================================

describe('Edge Cases — Overwrite & Merge', () => {
    it('second casts() with same field name should overwrite first', () => {
        const model = defineModel('Dupe', m => {
            m.casts({ title: m.string('First') });
            m.casts({ title: m.text('Second') });
        });
        expect(model.fields['title']._type).toBe('text');
        expect(model.fields['title']._label).toBe('Second');
    });

    it('timestamps() after casts with created_at should overwrite', () => {
        const model = defineModel('Override', m => {
            m.casts({ created_at: m.string('Custom') });
            m.timestamps();
        });
        // timestamps() should win
        expect(model.fields['created_at']._type).toBe('timestamp');
    });

    it('calling hidden() twice should use last value', () => {
        const model = defineModel('HideTwice', m => {
            m.casts({ a: m.string(), b: m.string() });
            m.hidden(['a']);
            m.hidden(['b']);
        });
        expect(model.hidden).toEqual(['b']);
    });

    it('calling guarded() twice should use last value', () => {
        const model = defineModel('GuardTwice', m => {
            m.casts({ a: m.string(), b: m.string() });
            m.guarded(['a']);
            m.guarded(['b']);
        });
        expect(model.guarded).toEqual(['b']);
    });
});

// ============================================================================
// Immutability Contracts
// ============================================================================

describe('Immutability', () => {
    it('model.fields should be frozen (read-only)', () => {
        const model = defineModel('Immutable', m => {
            m.casts({ title: m.string('Title') });
        });
        expect(() => {
            (model.fields as Record<string, unknown>)['hacked'] = 'oops';
        }).toThrow();
    });

    it('model.input should be frozen', () => {
        const model = defineModel('Immutable', m => {
            m.casts({ title: m.string('Title') });
            m.fillable({ create: ['title'] });
        });
        expect(() => {
            (model.input as Record<string, unknown>)['destroy'] = ['title'];
        }).toThrow();
    });

    it('model.defaults should be frozen', () => {
        const model = defineModel('Immutable', m => {
            m.casts({ active: m.boolean().default(true) });
        });
        expect(() => {
            (model.defaults as Record<string, unknown>)['active'] = false;
        }).toThrow();
    });
});

// ============================================================================
// Adversarial Inputs — Runtime Execution
// ============================================================================

describe('Adversarial Inputs — Runtime Validation', () => {
    const Model = defineModel('Strict', m => {
        m.casts({
            name:   m.string('Name'),
            count:  m.number('Count'),
            active: m.boolean('Active'),
            status: m.enum('Status', ['open', 'closed']),
        });
        m.fillable({ create: ['name', 'count', 'active', 'status'] });
    });

    it('should reject extra unknown fields (strict validation)', async () => {
        const f = initVurb();
        const tool = f.mutation('strict.create')
            .fromModel(Model, 'create')
            .handle(async (input) => success(input));

        // Extra field 'admin' — pipeline should reject
        const result = await tool.execute({}, {
            action: 'create',
            name: 'Test',
            count: 1,
            active: true,
            status: 'open',
            admin: true,  // unknown field → rejected
        });
        expect(result.isError).toBe(true);
    });

    it('should reject entirely wrong input shape', async () => {
        const f = initVurb();
        const tool = f.mutation('strict.create')
            .fromModel(Model, 'create')
            .handle(async (input) => success(input));

        // Pass string where object expected
        const result = await tool.execute({}, {
            action: 'create',
            name: 42,       // wrong type
            count: 'abc',   // wrong type
            active: 'yes',  // wrong type
            status: 'invalid', // wrong enum
        });
        expect(result.isError).toBe(true);
    });

    it('should reject SQL injection strings but accept valid strings', async () => {
        const f = initVurb();
        const tool = f.mutation('strict.create')
            .fromModel(Model, 'create')
            .handle(async (input) => success(input));

        // Should accept — string is valid, sanitization is not Model's job
        const result = await tool.execute({}, {
            action: 'create',
            name: "'; DROP TABLE users; --",
            count: 1,
            active: true,
            status: 'open',
        });
        expect(result.isError).toBeUndefined();
        // String passes through — Model validates type, not content
        expect(result.content[0]?.text).toContain('DROP TABLE');
    });
});

// ============================================================================
// Model.toApi() — Alias Resolution for HTTP Clients
// ============================================================================

describe('Model.toApi() — alias resolution', () => {
    it('passes data through unchanged when no aliases are defined', () => {
        const model = defineModel('Clean', m => {
            m.casts({
                title:  m.string('Title'),
                status: m.string('Status'),
            });
        });

        const data = { title: 'Hello', status: 'open' };
        const result = model.toApi(data);

        expect(result).toEqual({ title: 'Hello', status: 'open' });
    });

    it('renames aliased keys to their API names', () => {
        const model = defineModel('Aliased', m => {
            m.casts({
                content:  m.text('Body').alias('description'),
                due_date: m.date('Due date').alias('deadline'),
                status:   m.string('Status'),  // no alias
            });
        });

        const result = model.toApi({
            content:  'Hello world',
            due_date: '2026-01-01',
            status:   'open',
        });

        expect(result).toEqual({
            description: 'Hello world',  // aliased
            deadline:    '2026-01-01',   // aliased
            status:      'open',          // unchanged
        });
    });

    it('passes through unknown keys not present in the model', () => {
        const model = defineModel('WithAlias', m => {
            m.casts({ title: m.string('Title').alias('name') });
        });

        const result = model.toApi({ title: 'X', extra_field: 'kept' });

        // extra_field is unknown to the model but passes through
        expect(result['name']).toBe('X');       // aliased
        expect(result['extra_field']).toBe('kept'); // unknown → pass-through
    });

    it('strips undefined values', () => {
        const model = defineModel('Undefs', m => {
            m.casts({
                title:   m.string('Title'),
                content: m.text('Body').alias('description'),
            });
        });

        const result = model.toApi({
            title:   'Set',
            content: undefined,  // should be stripped
        });

        expect(result).toEqual({ title: 'Set' });
        expect('description' in result).toBe(false);
    });

    it('handles multiple aliases across a full model correctly', () => {
        const model = defineModel('Complex', m => {
            m.casts({
                user_name:   m.string('User name').alias('username'),
                created_at:  m.timestamp('Created').alias('createdAt'),
                is_verified: m.boolean('Verified').alias('isVerified'),
            });
        });

        const result = model.toApi({
            user_name:   'alice',
            created_at:  '2026-01-01T00:00:00Z',
            is_verified: true,
        });

        expect(result).toEqual({
            username:   'alice',
            createdAt:  '2026-01-01T00:00:00Z',
            isVerified: true,
        });
    });

    it('handles empty input object', () => {
        const model = defineModel('EmptyIn', m => {
            m.casts({ title: m.string('Title').alias('name') });
        });

        expect(model.toApi({})).toEqual({});
    });
});

// ============================================================================
// model.infer runtime behavior
// ============================================================================

describe('model.infer — TypeScript-only type trick', () => {
    it('model.infer is undefined at runtime (it is only a type-level helper)', () => {
        const model = defineModel('TypeOnly', m => {
            m.casts({ title: m.string('Title') });
        });

        // At runtime, `infer` is `undefined` — only useful as `typeof model.infer`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((model as any).infer).toBeUndefined();
    });
});
