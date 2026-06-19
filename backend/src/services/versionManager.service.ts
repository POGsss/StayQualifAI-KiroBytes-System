/**
 * Version_Manager (Requirements 5.3, 5.4, 8.x, 9.x, 10.x).
 *
 * Owns the lifecycle of `Resume_Version` snapshots: clone, rename, list, save,
 * and activate. Every operation runs through the per-request, RLS-scoped
 * Supabase client (`req.supabase`) so Row Level Security is the source of truth
 * for ownership: a query for a row owned by another user (or a non-existent
 * row) simply returns no rows, which we map to a {@link NotFoundError}
 * (Requirements 8.3, 9.3, 10.4, 11.3) — never leaking the existence of other
 * users' data.
 *
 * Storage shape: `resume_versions.content` holds the serialized
 * `IStructuredResume` (see {@link serializeResume}/{@link deserializeResume}).
 * DB rows use `snake_case`; return values are mapped to the camelCase
 * `IResumeVersion`.
 *
 * Single active invariant (Requirement 10.3): the database enforces at most one
 * active row per user via the partial unique index
 * `resume_versions_one_active_per_user`. {@link setActiveVersion} deactivates
 * the user's other active rows *before* activating the target so the unique
 * index is never violated mid-operation, and the most-recently-activated
 * version wins (Requirement 10.2).
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { IResumeVersion, IStructuredResume } from '../types/resume.types.js';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors.js';
import { deserializeResume, serializeResume } from '../utils/resumeSerializer.js';

/** The table backing all `Resume_Version` operations. */
const TABLE = 'resume_versions';

/** Columns selected/returned for every version operation. */
const COLUMNS = 'id, user_id, name, is_active, content, source_version_id, created_at, updated_at';

/**
 * The raw `resume_versions` row shape as returned by Supabase (`snake_case`).
 * `content` is `unknown` because it is stored `jsonb`; it is validated and
 * narrowed by {@link deserializeResume} when mapped to a domain object.
 */
interface ResumeVersionRow {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  content: unknown;
  source_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Input accepted by {@link saveVersion} when persisting a new version. */
export interface SaveVersionInput {
  name: string;
  content: IStructuredResume;
  sourceVersionId?: string;
}

/**
 * Clone an existing `Resume_Version` (Requirements 8.1, 8.2, 8.3).
 *
 * Creates a new version whose content is equivalent to the source, with a
 * distinct identifier and `source_version_id` pointing at the source. The
 * source row is left untouched. The clone is created inactive so it never
 * collides with the single-active invariant. A source that does not exist or
 * is not owned by the caller surfaces as {@link NotFoundError} (Requirement
 * 8.3).
 */
export async function cloneVersion(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<IResumeVersion> {
  const source = await fetchRowById(supabase, sourceId);
  if (source === null) {
    throw new NotFoundError(`Resume version "${sourceId}" was not found.`);
  }

  // Re-use the source's stored content verbatim — Postgres stores a copy, so
  // the clone's content is equivalent while the source remains independent.
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name: source.name,
      is_active: false,
      content: source.content,
      source_version_id: source.id,
    })
    .select(COLUMNS)
    .maybeSingle<ResumeVersionRow>();

  return mapInsertResult(data, error);
}

/**
 * Rename a `Resume_Version`, preserving its content (Requirements 9.1, 9.3).
 *
 * A missing or whitespace-only name is rejected with {@link ValidationError}
 * as a defensive guard (the route validation layer also enforces this for
 * Requirement 9.2, and the database carries a non-empty check constraint).
 * A version that does not exist or is not owned by the caller surfaces as
 * {@link NotFoundError} (Requirement 9.3).
 */
export async function renameVersion(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  name: string
): Promise<IResumeVersion> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('A non-empty name is required to rename a resume version.', {
      field: 'name',
    });
  }

  // RLS scopes the update to the caller; the explicit `user_id` filter is a
  // defensive belt-and-braces guard.
  const { data, error } = await supabase
    .from(TABLE)
    .update({ name: trimmed })
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle<ResumeVersionRow>();

  if (error !== null) {
    throw new InternalError('Failed to rename resume version.', error.message);
  }
  if (data === null) {
    throw new NotFoundError(`Resume version "${id}" was not found.`);
  }
  return mapRow(data);
}

/**
 * List all `Resume_Versions` owned by the caller (Requirement 10.1).
 *
 * RLS scopes the query to the caller, so the result contains only the user's
 * own versions. Ordered most-recently-updated first.
 */
export async function listVersions(
  supabase: SupabaseClient,
  userId: string
): Promise<IResumeVersion[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .returns<ResumeVersionRow[]>();

  if (error !== null) {
    throw new InternalError('Failed to list resume versions.', error.message);
  }
  return (data ?? []).map(mapRow);
}

/**
 * Persist a `Resume_Version` (Requirements 5.3, 5.4).
 *
 * Required-section policy (Requirement 5.4): a save is rejected with a
 * {@link ValidationError} naming the offending section when either
 *   - `contact` is incomplete (a non-empty `name` and `email` are required), or
 *   - `experience` is empty (at least one experience entry with non-empty
 *     content is required).
 * These are the minimum sections an ATS-parseable resume must carry to be
 * meaningful; all other sections are optional.
 */
export async function saveVersion(
  supabase: SupabaseClient,
  userId: string,
  input: SaveVersionInput
): Promise<IResumeVersion> {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError('A non-empty name is required to save a resume version.', {
      field: 'name',
    });
  }

  assertRequiredSections(input.content);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      name: trimmedName,
      is_active: false,
      content: serializeResume(input.content),
      ...(input.sourceVersionId !== undefined
        ? { source_version_id: input.sourceVersionId }
        : {}),
    })
    .select(COLUMNS)
    .maybeSingle<ResumeVersionRow>();

  return mapInsertResult(data, error);
}

/**
 * Set a `Resume_Version` active for the caller (Requirements 10.2, 10.3, 10.4).
 *
 * Enforces the single-active invariant in an index-safe order: verify the
 * target is owned by the caller, deactivate any other currently-active
 * version, then activate the target. Because deactivation happens before
 * activation, the partial unique index is never momentarily violated, and the
 * target (the most recently activated) becomes the sole active version. A
 * target that does not exist or is not owned by the caller surfaces as
 * {@link NotFoundError} (Requirement 10.4).
 */
export async function setActiveVersion(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<IResumeVersion> {
  // Verify ownership/existence first so we never deactivate the user's current
  // active version on behalf of a request targeting a non-existent row.
  const target = await fetchRowById(supabase, id);
  if (target === null) {
    throw new NotFoundError(`Resume version "${id}" was not found.`);
  }

  // Deactivate any other active version(s) first to keep the partial unique
  // index satisfied before we activate the target.
  const { error: deactivateError } = await supabase
    .from(TABLE)
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .neq('id', id);

  if (deactivateError !== null) {
    throw new InternalError('Failed to deactivate previous active version.', deactivateError.message);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_active: true })
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle<ResumeVersionRow>();

  if (error !== null) {
    throw new InternalError('Failed to activate resume version.', error.message);
  }
  if (data === null) {
    // Lost between the existence check and the update (e.g. concurrent delete).
    throw new NotFoundError(`Resume version "${id}" was not found.`);
  }
  return mapRow(data);
}

/**
 * Fetch a single version row by id, RLS-scoped to the caller. Returns `null`
 * when no row is visible (absent or not owned), which callers translate to a
 * {@link NotFoundError}.
 */
async function fetchRowById(
  supabase: SupabaseClient,
  id: string
): Promise<ResumeVersionRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle<ResumeVersionRow>();

  if (error !== null) {
    throw new InternalError('Failed to load resume version.', error.message);
  }
  return data;
}

/**
 * Validate the required-section policy for {@link saveVersion}. Throws a
 * {@link ValidationError} naming the first offending section (Requirement 5.4).
 */
function assertRequiredSections(content: IStructuredResume): void {
  if (content.contact.name.trim().length === 0) {
    throw new ValidationError('Required section "contact" is incomplete: a name is required.', {
      section: 'contact',
      field: 'name',
    });
  }
  if (content.contact.email.trim().length === 0) {
    throw new ValidationError('Required section "contact" is incomplete: an email is required.', {
      section: 'contact',
      field: 'email',
    });
  }

  const hasExperience = content.experience.some((section) =>
    section.items.some((item) => item.trim().length > 0)
  );
  if (!hasExperience) {
    throw new ValidationError('Required section "experience" must not be empty.', {
      section: 'experience',
    });
  }
}

/**
 * Map a shared insert result: a non-null error or a null row both indicate the
 * write did not return a row, which is an unexpected internal failure for a
 * caller-scoped insert (RLS `with check` would otherwise reject before here).
 */
function mapInsertResult(
  data: ResumeVersionRow | null,
  error: PostgrestError | null
): IResumeVersion {
  if (error !== null) {
    throw new InternalError('Failed to persist resume version.', error.message);
  }
  if (data === null) {
    throw new InternalError('Resume version was not returned after persistence.');
  }
  return mapRow(data);
}

/**
 * Map a raw `resume_versions` row (`snake_case`, `jsonb` content) to the
 * camelCase {@link IResumeVersion} domain object, deserializing the stored
 * content back into an `IStructuredResume`.
 */
function mapRow(row: ResumeVersionRow): IResumeVersion {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    isActive: row.is_active,
    content: deserializeResume(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
