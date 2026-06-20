/**
 * Property-based tests for the STAR_Organizer (interview spec task 9.2).
 *
 * Property 9: Duplicate STAR titles per user yield a conflict.
 *
 * For a user who already owns a STAR_Story with a given title, a second
 * `createStory` with the SAME exact title (other STAR fields may differ) is
 * rejected with a {@link ConflictError} and no second story is persisted —
 * the user's store still contains exactly one story (Requirement 7.5).
 *
 * The test drives the real {@link createStory} implementation against a
 * chainable in-memory Supabase stub that faithfully reproduces the two query
 * chains the service uses:
 *   - duplicate-title lookup:
 *       from(t).select('id').eq('user_id', u).eq('title', title).returns()
 *   - insert:
 *       from(t).insert(row).select(STORY_COLUMNS).returns()
 * The stub also simulates the `unique (user_id, title)` index by returning a
 * PostgreSQL `23505` error if a duplicate ever slips past the app-level check.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createStory } from '../src/services/interview.starOrganizer.service.js';
import type { ICreateStarInput } from '../src/types/interview.types.js';
import { ConflictError } from '../src/utils/errors.js';

/** A persisted STAR_Story row in the in-memory store (mirrors the DB shape). */
interface StoredRow {
  id: string;
  user_id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  created_at: string;
}

/** In-memory per-user store of persisted STAR_Story rows. */
interface FakeStore {
  rows: StoredRow[];
  seq: number;
}

/** SQLSTATE PostgreSQL raises on a unique-constraint violation. */
const UNIQUE_VIOLATION_CODE = '23505';

function makeUniqueViolation(): PostgrestError {
  return {
    code: UNIQUE_VIOLATION_CODE,
    message: 'duplicate key value violates unique constraint',
    details: 'Key (user_id, title) already exists.',
    hint: '',
    name: 'PostgrestError',
  } as unknown as PostgrestError;
}

/**
 * A chainable query builder that simulates the subset of the Supabase/PostgREST
 * fluent API exercised by {@link createStory}: `select`, `insert`, `eq`, and
 * the terminal `returns()`.
 */
class FakeQuery {
  private mode: 'select' | 'insert' = 'select';
  private readonly filters: Array<{ col: keyof StoredRow; val: unknown }> = [];
  private pendingInsert: StoredRow | null = null;
  private selectedColumns: string[] | null = null;

  public constructor(private readonly store: FakeStore) {}

  public select(columns: string): this {
    // Mirror PostgREST column projection: only the listed columns are returned
    // (notably `user_id` is omitted from STORY_COLUMNS).
    this.selectedColumns = columns.split(',').map((c) => c.trim());
    return this;
  }

  public insert(values: {
    user_id: string;
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
  }): this {
    this.mode = 'insert';
    this.store.seq += 1;
    this.pendingInsert = {
      id: `story-${String(this.store.seq)}`,
      user_id: values.user_id,
      title: values.title,
      situation: values.situation,
      task: values.task,
      action: values.action,
      result: values.result,
      created_at: new Date(Date.now() + this.store.seq).toISOString(),
    };
    return this;
  }

  public eq(column: keyof StoredRow, value: unknown): this {
    this.filters.push({ col: column, val: value });
    return this;
  }

  public neq(column: keyof StoredRow, value: unknown): this {
    // Not exercised by createStory, but provided for parity with the service.
    this.filters.push({ col: column, val: { __neq: value } });
    return this;
  }

  public async returns<T>(): Promise<{
    data: T | null;
    error: PostgrestError | null;
  }> {
    if (this.mode === 'insert') {
      const row = this.pendingInsert;
      if (row === null) {
        return { data: null, error: makeUniqueViolation() };
      }
      // Simulate the unique (user_id, title) index as a backstop.
      const duplicate = this.store.rows.some(
        (r) => r.user_id === row.user_id && r.title === row.title
      );
      if (duplicate) {
        return { data: null, error: makeUniqueViolation() };
      }
      this.store.rows.push(row);
      return { data: [this.project(row)] as unknown as T, error: null };
    }

    const matched = this.store.rows.filter((r) =>
      this.filters.every((f) => r[f.col] === f.val)
    );
    return {
      data: matched.map((r) => this.project(r)) as unknown as T,
      error: null,
    };
  }

  /**
   * Project a stored row down to the selected columns, mirroring PostgREST.
   * When no explicit selection was made, the full row is returned.
   */
  private project(row: StoredRow): Partial<StoredRow> {
    if (this.selectedColumns === null) {
      return row;
    }
    const out: Partial<StoredRow> = {};
    for (const col of this.selectedColumns) {
      if (col in row) {
        const key = col as keyof StoredRow;
        out[key] = row[key];
      }
    }
    return out;
  }
}

/** Build a Supabase client stub backed by an in-memory store. */
function makeSupabaseStub(store: FakeStore): SupabaseClient {
  return {
    from(_table: string): FakeQuery {
      return new FakeQuery(store);
    },
  } as unknown as SupabaseClient;
}

function freshStore(): FakeStore {
  return { rows: [], seq: 0 };
}

// Arbitrary unicode title (1..200 chars) and STAR fields (1..2000 chars).
const arbTitle = fc.fullUnicodeString({ minLength: 1, maxLength: 200 });
const arbField = fc.fullUnicodeString({ minLength: 1, maxLength: 2000 });

const arbStarFields = fc.record({
  situation: arbField,
  task: arbField,
  action: arbField,
  result: arbField,
});

describe('STAR_Organizer property tests', () => {
  // Feature: interview, Property 9: Duplicate STAR titles per user yield a conflict
  it('Property 9: a duplicate title is rejected with a conflict and no second story persists', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTitle,
        arbStarFields,
        arbStarFields,
        async (title, firstFields, secondFields) => {
          const store = freshStore();
          const supabase = makeSupabaseStub(store);
          const userId = 'user-1';

          const firstInput: ICreateStarInput = { title, ...firstFields };
          const created = await createStory(supabase, userId, firstInput);

          // The first create succeeds and persists exactly one story.
          expect(created.title).toBe(title);
          expect(store.rows).toHaveLength(1);

          // A second create with the SAME exact title (other fields may differ)
          // is rejected with a ConflictError.
          const secondInput: ICreateStarInput = { title, ...secondFields };
          await expect(
            createStory(supabase, userId, secondInput)
          ).rejects.toBeInstanceOf(ConflictError);

          // No second story persisted: the store still holds exactly one.
          expect(store.rows).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
