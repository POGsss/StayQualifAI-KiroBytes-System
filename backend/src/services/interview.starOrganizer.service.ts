/**
 * STAR_Organizer (Requirements 7.x–11.x).
 *
 * CRUD persistence for `STAR_Story` scratchpad entries backed by the
 * `interview_star_stories` table. Every read maps the stored row back into an
 * {@link IStarStory} through {@link deserializeStarStory} so the five STAR text
 * fields (`title`, `situation`, `task`, `action`, `result`) round-trip
 * character-for-character (Requirements 11.1, 11.2).
 *
 * Ownership & isolation
 * ---------------------
 * Every query is RLS-scoped to the calling user via the per-request Supabase
 * client and additionally carries an explicit `user_id` filter as defence in
 * depth. RLS no-rows outcomes (absent or unowned rows) surface as
 * {@link NotFoundError} rather than leaking the existence of other users' data
 * (Requirements 8.3, 9.5, 10.3). This module imports NO Resume (Module 1) code.
 *
 * Duplicate titles
 * ----------------
 * A `STAR_Story` title is unique per user (exact character match). This is
 * enforced both at the application level (a pre-insert / pre-update lookup) and
 * by the database `unique (user_id, title)` index. A PostgreSQL unique
 * violation (SQLSTATE `23505`) is mapped to {@link ConflictError} as a backstop
 * for the race between the lookup and the write (Requirements 7.5).
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type {
  ICreateStarInput,
  IStarStory,
  IUpdateStarInput,
} from '../types/interview.types.js';
import { ConflictError, InternalError, NotFoundError } from '../utils/errors.js';
import {
  deserializeStarStory,
  type StoredStarStory,
} from '../utils/interview.starSerializer.js';

/** Table holding the per-user `STAR_Story` scratchpad entries. */
const STORIES_TABLE = 'interview_star_stories';

/**
 * Columns selected for a stored story. These map exactly onto
 * {@link StoredStarStory}; the `user_id` ownership column is intentionally
 * omitted so {@link deserializeStarStory}'s strict schema accepts the row.
 */
const STORY_COLUMNS = 'id, title, situation, task, action, result, created_at';

/** PostgreSQL SQLSTATE raised on a unique-constraint violation. */
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Create a new `STAR_Story` for the user (Requirements 7.1, 7.5, 11.1).
 *
 * Performs an application-level duplicate-title check (an exact `user_id` +
 * `title` lookup) before inserting, and relies on the `unique (user_id, title)`
 * index as a backstop: a PostgreSQL unique violation (`23505`) is mapped to
 * {@link ConflictError} (Requirement 7.5). The inserted row is returned through
 * {@link deserializeStarStory} so the stored content round-trips verbatim.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @param input    The five STAR text fields to persist.
 * @returns The persisted story as an {@link IStarStory}.
 * @throws {ConflictError} when a story with the same title already exists.
 * @throws {InternalError} when persistence fails for a system reason.
 */
export async function createStory(
  supabase: SupabaseClient,
  userId: string,
  input: ICreateStarInput
): Promise<IStarStory> {
  await assertTitleAvailable(supabase, userId, input.title, null);

  const { data, error } = await supabase
    .from(STORIES_TABLE)
    .insert({
      user_id: userId,
      title: input.title,
      situation: input.situation,
      task: input.task,
      action: input.action,
      result: input.result,
    })
    .select(STORY_COLUMNS)
    .returns<StoredStarStory[]>();

  if (error !== null) {
    throw mapWriteError(error, 'Failed to create the STAR story.');
  }

  const row: StoredStarStory | undefined = data !== null ? data[0] : undefined;
  if (row === undefined) {
    throw new InternalError('The STAR story was not returned after creation.');
  }

  return deserializeStarStory(row);
}

/**
 * List the user's `STAR_Stories` ordered by `created_at` descending
 * (Requirement 8.1). Returns an empty array when the user has none.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @returns The user's stories, newest first (possibly empty).
 * @throws {InternalError} when the lookup fails for a system reason.
 */
export async function listStories(
  supabase: SupabaseClient,
  userId: string
): Promise<IStarStory[]> {
  const { data, error } = await supabase
    .from(STORIES_TABLE)
    .select(STORY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<StoredStarStory[]>();

  if (error !== null) {
    throw new InternalError('Failed to list the STAR stories.', error.message);
  }

  return (data ?? []).map(deserializeStarStory);
}

/**
 * Fetch a single `STAR_Story` by id, RLS-scoped to the owning user
 * (Requirement 8.3). An absent or unowned row surfaces as {@link NotFoundError}.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @param id       The story id.
 * @returns The story as an {@link IStarStory}.
 * @throws {NotFoundError} when no matching row exists for the user.
 * @throws {InternalError} when the lookup fails for a system reason.
 */
export async function getStory(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<IStarStory> {
  const { data, error } = await supabase
    .from(STORIES_TABLE)
    .select(STORY_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<StoredStarStory>();

  if (error !== null) {
    throw new InternalError('Failed to load the STAR story.', error.message);
  }
  if (data === null) {
    throw new NotFoundError('The requested STAR story was not found.');
  }

  return deserializeStarStory(data);
}

/**
 * Update a `STAR_Story`, mutating only the supplied fields and preserving the
 * rest (Requirement 9.1). A no-rows outcome surfaces as {@link NotFoundError}
 * (Requirement 9.5). When a new `title` is supplied it is checked against the
 * user's OTHER stories; a collision maps to {@link ConflictError} (both via the
 * application-level lookup and the `23505` backstop).
 *
 * When no fields are supplied the current story is returned unchanged.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @param id       The story id.
 * @param input    The subset of STAR fields to update.
 * @returns The updated story as an {@link IStarStory}.
 * @throws {NotFoundError} when no matching row exists for the user.
 * @throws {ConflictError} when the supplied title collides with another story.
 * @throws {InternalError} when the update fails for a system reason.
 */
export async function updateStory(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: IUpdateStarInput
): Promise<IStarStory> {
  const patch: Partial<Omit<StoredStarStory, 'id' | 'created_at'>> =
    buildUpdatePatch(input);

  // Nothing to change: confirm the row exists (and is owned) and return it.
  if (Object.keys(patch).length === 0) {
    return getStory(supabase, userId, id);
  }

  // Application-level duplicate-title check against the user's OTHER stories.
  if (patch.title !== undefined) {
    await assertTitleAvailable(supabase, userId, patch.title, id);
  }

  const { data, error } = await supabase
    .from(STORIES_TABLE)
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(STORY_COLUMNS)
    .returns<StoredStarStory[]>();

  if (error !== null) {
    throw mapWriteError(error, 'Failed to update the STAR story.');
  }

  const row: StoredStarStory | undefined = data !== null ? data[0] : undefined;
  if (row === undefined) {
    // No row matched the id + user_id filter under RLS (Requirement 9.5).
    throw new NotFoundError('The requested STAR story was not found.');
  }

  return deserializeStarStory(row);
}

/**
 * Delete a `STAR_Story` by id, RLS-scoped to the owning user (Requirements
 * 10.1, 10.3). A no-rows outcome surfaces as {@link NotFoundError}; on success
 * the function returns `void` and a subsequent {@link getStory} yields
 * not-found.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @param id       The story id.
 * @throws {NotFoundError} when no matching row exists for the user.
 * @throws {InternalError} when the delete fails for a system reason.
 */
export async function deleteStory(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  // Select the deleted rows so a no-rows outcome can be distinguished from a
  // successful delete (Requirement 10.3).
  const { data, error } = await supabase
    .from(STORIES_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .returns<Array<{ id: string }>>();

  if (error !== null) {
    throw new InternalError('Failed to delete the STAR story.', error.message);
  }
  if (data === null || data.length === 0) {
    throw new NotFoundError('The requested STAR story was not found.');
  }
}

/**
 * Assert that `title` is not already used by the user, excluding the story
 * `excludeId` (used by update so a story keeping its own title is not treated
 * as a self-collision). Throws {@link ConflictError} on an exact-match
 * collision (Requirement 7.5).
 */
async function assertTitleAvailable(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  excludeId: string | null
): Promise<void> {
  let query = supabase
    .from(STORIES_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('title', title);

  if (excludeId !== null) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.returns<Array<{ id: string }>>();

  if (error !== null) {
    throw new InternalError(
      'Failed to verify STAR story title availability.',
      error.message
    );
  }
  if (data !== null && data.length > 0) {
    throw new ConflictError('A STAR story with this title already exists.');
  }
}

/**
 * Build the update payload from the supplied input, including ONLY the fields
 * that were provided so unset fields are preserved (Requirement 9.1).
 */
function buildUpdatePatch(
  input: IUpdateStarInput
): Partial<Omit<StoredStarStory, 'id' | 'created_at'>> {
  const patch: Partial<Omit<StoredStarStory, 'id' | 'created_at'>> = {};

  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.situation !== undefined) {
    patch.situation = input.situation;
  }
  if (input.task !== undefined) {
    patch.task = input.task;
  }
  if (input.action !== undefined) {
    patch.action = input.action;
  }
  if (input.result !== undefined) {
    patch.result = input.result;
  }

  return patch;
}

/**
 * Map a write {@link PostgrestError} to the appropriate typed error: a unique
 * violation (`23505`) on the `(user_id, title)` index becomes a
 * {@link ConflictError} (Requirement 7.5); anything else is an
 * {@link InternalError}.
 */
function mapWriteError(error: PostgrestError, message: string): Error {
  if (error.code === UNIQUE_VIOLATION_CODE) {
    return new ConflictError('A STAR story with this title already exists.');
  }
  return new InternalError(message, error.message);
}
