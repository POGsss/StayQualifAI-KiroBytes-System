/**
 * Course & Certificate Finder service (Upskilling module).
 *
 * Aggregates Course_Recommendations from one or more `Learning_Platform_API`
 * source adapters and manages a user's bookmarked Saved_Courses.
 *
 * `searchCourses` fans out to every adapter concurrently, each guarded by an
 * independent 10-second `AbortController` timeout. Sources that error, are
 * unavailable, or time out are excluded; the surviving sources' normalized
 * recommendations are filtered (optional cost), deduplicated by normalized URL,
 * ordered deterministically, and capped at 50. Only when EVERY source fails
 * does the service raise a typed `AiProviderError` (Requirements 5.7, 5.8).
 *
 * Persistence follows the established Supabase pattern (snake_case ↔ camelCase
 * mapping, RLS as the source of truth for ownership). A duplicate normalized
 * URL surfaces as a `ConflictError` via the `(user_id, normalized_url)` unique
 * constraint; ownership/absence failures surface as `NotFoundError`.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 6.1, 6.3, 6.4, 6.5,
 *              6.6, 7.5
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CostClassification,
  ICourseRecommendation,
  ILearningPlatformAdapter,
  ISavedCourse,
  ISearchCoursesInput,
} from '../types/upskilling.types.js';
import {
  dedupeByNormalizedUrl,
  normalizeUrl,
  orderRecommendations,
} from '../utils/upskillingCourseDedup.js';
import { AiProviderError, ConflictError, NotFoundError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-source response timeout (Requirements 5.7, 5.8). */
const PER_SOURCE_TIMEOUT_MS = 10_000;

/** Maximum number of recommendations returned from a search (Requirement 5.1). */
const MAX_RESULTS = 50;

// ---------------------------------------------------------------------------
// Recommendation normalization helpers
// ---------------------------------------------------------------------------

/** Field bounds enforced on every produced Course_Recommendation (Req 5.2). */
const TITLE_MAX = 200;
const PROVIDER_MAX = 100;

/** Read a string-ish property off an untyped catalog item. */
function readString(item: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/** Read a number-ish property off an untyped catalog item. */
function readNumber(item: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

/** True when the string is an absolute HTTPS URL. */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Derive a Free/Paid cost classification from a variety of raw catalog shapes
 * (explicit "Free"/"Paid", boolean `isFree`, or a numeric `price`).
 */
function deriveCost(item: Record<string, unknown>): CostClassification | null {
  const explicit = readString(item, ['cost', 'price_type', 'priceType']);
  if (explicit !== null) {
    const lowered = explicit.toLowerCase();
    if (lowered === 'free') {
      return 'Free';
    }
    if (lowered === 'paid') {
      return 'Paid';
    }
  }

  const isFree = item['isFree'] ?? item['is_free'] ?? item['free'];
  if (typeof isFree === 'boolean') {
    return isFree ? 'Free' : 'Paid';
  }

  const price = readNumber(item, ['price', 'amount', 'cost']);
  if (price !== null) {
    return price <= 0 ? 'Free' : 'Paid';
  }

  return null;
}

/**
 * Normalize a single raw catalog item into a valid `ICourseRecommendation`,
 * or `null` when it cannot satisfy the field bounds (Requirement 5.2). Invalid
 * items are dropped so the aggregated output always satisfies its invariants.
 */
function toValidRecommendation(raw: unknown): ICourseRecommendation | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const item = raw as Record<string, unknown>;

  const title = readString(item, ['title', 'name', 'courseTitle', 'course_title']);
  const provider = readString(item, ['provider', 'publisher', 'platform', 'source']);
  const url = readString(item, ['url', 'link', 'href', 'courseUrl', 'course_url']);
  const cost = deriveCost(item);

  if (title === null || provider === null || url === null || cost === null) {
    return null;
  }
  if (title.length < 1 || title.length > TITLE_MAX) {
    return null;
  }
  if (provider.length < 1 || provider.length > PROVIDER_MAX) {
    return null;
  }
  if (!isHttpsUrl(url)) {
    return null;
  }

  const rating = readNumber(item, ['rating', 'stars', 'score']);
  const recommendation: ICourseRecommendation = {
    title,
    provider,
    url,
    cost,
  };
  if (rating !== null) {
    recommendation.rating = rating;
  }
  return recommendation;
}

// ---------------------------------------------------------------------------
// Learning platform adapters
// ---------------------------------------------------------------------------

/**
 * Configuration for an HTTP-backed Learning_Platform_API adapter. The endpoint
 * is supplied via environment configuration so the adapter has no hardcoded
 * source; `extractItems` pulls the catalog array out of a source-specific
 * response envelope before per-item normalization.
 */
interface IHttpAdapterConfig {
  readonly sourceName: string;
  readonly endpoint: string;
  readonly extractItems: (payload: unknown) => unknown[];
  /** Injectable fetch implementation (defaults to global `fetch`) for tests. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Generic adapter that queries a configurable HTTP catalog endpoint, honors the
 * provided `AbortSignal`, and normalizes the response into
 * `ICourseRecommendation`s. Concrete sources are created by supplying a
 * `sourceName`, `endpoint`, and response extractor. This isolates each external
 * catalog behind a uniform, mockable interface.
 */
export class HttpLearningPlatformAdapter implements ILearningPlatformAdapter {
  public readonly sourceName: string;

  private readonly endpoint: string;
  private readonly extractItems: (payload: unknown) => unknown[];
  private readonly fetchImpl: typeof fetch;

  public constructor(config: IHttpAdapterConfig) {
    this.sourceName = config.sourceName;
    this.endpoint = config.endpoint;
    this.extractItems = config.extractItems;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async search(
    query: string,
    signal: AbortSignal
  ): Promise<ICourseRecommendation[]> {
    if (this.endpoint.trim().length === 0) {
      // No source configured — treat as an unavailable source.
      throw new Error(`${this.sourceName} is not configured`);
    }

    const separator = this.endpoint.includes('?') ? '&' : '?';
    const requestUrl = `${this.endpoint}${separator}q=${encodeURIComponent(query)}`;

    const response = await this.fetchImpl(requestUrl, {
      signal,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `${this.sourceName} responded with status ${String(response.status)}`
      );
    }

    const payload: unknown = await response.json();
    const items = this.extractItems(payload);

    const recommendations: ICourseRecommendation[] = [];
    for (const item of items) {
      const normalized = toValidRecommendation(item);
      if (normalized !== null) {
        recommendations.push(normalized);
      }
    }
    return recommendations;
  }
}

/** Extract an array from either a bare array payload or `{ <key>: [...] }`. */
function arrayUnder(key: string): (payload: unknown) => unknown[] {
  return (payload: unknown): unknown[] => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  };
}

/**
 * Build the default set of Learning_Platform_API adapters from environment
 * configuration. At least two distinct sources are provided so aggregation,
 * dedup, and partial-failure behavior are exercised. Endpoints are read from
 * the environment (no hardcoded source), keeping real catalog URLs/keys out of
 * source control.
 */
export function getDefaultAdapters(): ILearningPlatformAdapter[] {
  const catalogA = process.env['UPSKILLING_CATALOG_A_URL'] ?? '';
  const catalogB = process.env['UPSKILLING_CATALOG_B_URL'] ?? '';

  return [
    new HttpLearningPlatformAdapter({
      sourceName: 'catalog-a',
      endpoint: catalogA,
      extractItems: arrayUnder('courses'),
    }),
    new HttpLearningPlatformAdapter({
      sourceName: 'catalog-b',
      endpoint: catalogB,
      extractItems: arrayUnder('results'),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Source aggregation
// ---------------------------------------------------------------------------

/**
 * Query a single adapter under an independent 10-second `AbortController`
 * timeout. Resolves with the source's recommendations, or `null` when the
 * source errors, is unavailable, or exceeds its timeout (so the caller can
 * exclude it). Never throws.
 */
async function querySource(
  adapter: ILearningPlatformAdapter,
  query: string
): Promise<ICourseRecommendation[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, PER_SOURCE_TIMEOUT_MS);

  try {
    return await adapter.search(query, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Service: search
// ---------------------------------------------------------------------------

/**
 * Search across the Learning_Platform_API sources for course/certificate
 * recommendations matching the query.
 *
 * Fans out to every adapter concurrently (each with a per-source 10s timeout),
 * normalizes results, applies the optional cost filter, deduplicates by
 * normalized URL, orders deterministically (Free before Paid, then title
 * CI-ascending), and caps the result at 50. Failed/timed-out sources are
 * excluded. If EVERY queried source fails, raises `AiProviderError` indicating
 * recommendations are temporarily unavailable.
 *
 * The `adapters` parameter defaults to the environment-configured sources and
 * is injectable for testing.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9
 */
export async function searchCourses(
  input: ISearchCoursesInput,
  adapters: ILearningPlatformAdapter[] = getDefaultAdapters()
): Promise<ICourseRecommendation[]> {
  const query = input.query.trim();

  // No sources configured at all → temporarily unavailable.
  if (adapters.length === 0) {
    throw new AiProviderError(
      'Course recommendations are temporarily unavailable. Please retry shortly.'
    );
  }

  const settled = await Promise.all(
    adapters.map(async (adapter) => querySource(adapter, query))
  );

  // Every source failed (all returned null) → temporarily unavailable (5.8).
  const succeeded = settled.filter(
    (result): result is ICourseRecommendation[] => result !== null
  );
  if (succeeded.length === 0) {
    throw new AiProviderError(
      'Course recommendations are temporarily unavailable. Please retry shortly.'
    );
  }

  // Aggregate surviving sources (5.7).
  let aggregated: ICourseRecommendation[] = succeeded.flat();

  // Optional cost filter (5.3).
  if (input.cost !== undefined) {
    const wanted = input.cost;
    aggregated = aggregated.filter((rec) => rec.cost === wanted);
  }

  // Dedup by normalized URL (5.4), deterministic order (5.9), cap at 50 (5.1).
  const deduped = dedupeByNormalizedUrl(aggregated);
  const ordered = orderRecommendations(deduped);
  return ordered.slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Service: saved-course persistence
// ---------------------------------------------------------------------------

/** Input accepted when bookmarking a course (the persistable fields). */
export type ISaveCourseInput = Omit<ISavedCourse, 'id' | 'createdAt'>;

/** Map a raw `upskilling_saved_courses` row to the `ISavedCourse` shape. */
function mapRowToSavedCourse(row: Record<string, unknown>): ISavedCourse {
  return {
    id: row['id'] as string,
    title: row['title'] as string,
    provider: row['provider'] as string,
    url: row['url'] as string,
    cost: row['cost'] as CostClassification,
    createdAt: row['created_at'] as string,
  };
}

/**
 * Persist a Course_Recommendation as a Saved_Course owned by the requesting
 * user. The normalized URL is computed for the uniqueness constraint; a
 * duplicate normalized URL for the same user surfaces as a `ConflictError`
 * (PostgreSQL unique violation 23505 on `(user_id, normalized_url)`), leaving
 * the existing record untouched.
 *
 * Requirements: 6.1, 6.4, 7.5
 */
export async function saveCourse(
  supabase: SupabaseClient,
  userId: string,
  input: ISaveCourseInput
): Promise<ISavedCourse> {
  const { data, error } = await supabase
    .from('upskilling_saved_courses')
    .insert({
      user_id: userId,
      title: input.title,
      provider: input.provider,
      url: input.url,
      normalized_url: normalizeUrl(input.url),
      cost: input.cost,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('This course is already saved.');
    }
    throw new NotFoundError(`Failed to save course: ${error.message}`);
  }

  return mapRowToSavedCourse(data as Record<string, unknown>);
}

/**
 * Return the requesting user's Saved_Courses, ordered by `created_at`
 * descending and then by `url` ascending for records sharing a timestamp.
 *
 * Requirements: 6.3, 7.5
 */
export async function listSavedCourses(
  supabase: SupabaseClient,
  userId: string
): Promise<ISavedCourse[]> {
  const { data, error } = await supabase
    .from('upskilling_saved_courses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('url', { ascending: true });

  if (error) {
    throw new NotFoundError(`Failed to fetch saved courses: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRowToSavedCourse(row as Record<string, unknown>));
}

/**
 * Delete an owned Saved_Course. Under RLS, attempting to delete a record that
 * does not exist or is not owned by the caller affects zero rows, which is
 * mapped to `NotFoundError` (never revealing another user's data).
 *
 * Requirements: 6.5, 6.6, 7.5
 */
export async function deleteSavedCourse(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from('upskilling_saved_courses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    throw new NotFoundError(`Failed to delete saved course: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    throw new NotFoundError('Saved course not found.');
  }
}
