/**
 * Vurb Instance — Context Initialization
 *
 * Define your context type ONCE. Every f.query(), f.mutation(),
 * f.presenter(), f.prompt(), and f.middleware() call inherits
 * AppContext — zero generic repetition anywhere in the codebase.
 */
import { initVurb } from '@vurb/core';
import type { AppContext } from './context.js';

export const f = initVurb<AppContext>();
