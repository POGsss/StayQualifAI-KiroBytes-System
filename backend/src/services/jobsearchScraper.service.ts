/**
 * Job Search Scraper Service.
 *
 * Orchestrates the full scrape pipeline: cooldown check → concurrency lock →
 * resume fetch → keyword extraction → SerpAPI calls → result mapping →
 * listing ingestion → summary.
 *
 * In-memory cooldown (60 min) and concurrency lock (one scrape per user).
 * Caps SerpAPI calls at 3. Returns partial results on partial failures.
 * Aborts if total time exceeds 30 seconds.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 *
 * Requirements: 1.1, 1.5, 1.7, 2.4, 2.5, 2.6, 2.7, 2.8, 3.6, 3.7, 3.8,
 *              4.7, 4.8, 5.1, 5.3, 5.4, 5.5, 7.1, 7.3
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { IStructuredResume } from '../types/resume.types.js';
import type { IListingIngestInput } from '../types/jobsearch.types.js';
import { extractSmartQueries } from '../utils/jobsearchSmartExtractor.js';
import { searchGoogleJobs, SerpApiRateLimitError, type ISerpApiSearchResult } from '../utils/jobsearchSerpApiClient.js';
import { mapSerpResultToListing } from '../utils/jobsearchScrapeMapper.js';
import { ingestListing } from './jobsearchListing.service.js';
import {
  ConflictError,
  InternalError,
  ValidationError,
  AppError,
  AiProviderError,
} from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * Summary of a completed scrape operation.
 */
export interface IScrapeSummary {
  totalResults: number;
  newListings: number;
  duplicatesMerged: number;
  skipped: number;
  warnings?: string[];
}

/**
 * Error thrown when a user is within the 60-minute cooldown period.
 * The controller catches this to return an HTTP 429 response with cooldown info.
 */
export class CooldownError extends AppError {
  public readonly type = 'RateLimitError';
  public readonly httpStatus = 429;
  public readonly cooldownExpiresAt: string;
  public readonly remainingMinutes: number;

  public constructor(cooldownExpiresAt: string, remainingMinutes: number) {
    super(
      `Please wait before searching again. Cooldown expires in ${String(remainingMinutes)} minutes.`
    );
    this.cooldownExpiresAt = cooldownExpiresAt;
    this.remainingMinutes = remainingMinutes;
  }
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** userId → last successful scrape timestamp (ms). */
const lastScrapeTimestamps: Map<string, number> = new Map();

/** Cooldown window: 60 minutes in milliseconds. */
const COOLDOWN_MS = 60 * 60 * 1000;

/** Set of userIds with an active scrape in progress. */
const activeScrapes: Set<string> = new Set();

/** Maximum number of SerpAPI calls per scrape invocation. */
const MAX_SERP_CALLS = 3;

/** Maximum total pipeline duration in milliseconds (90 seconds). */
const MAX_PIPELINE_DURATION_MS = 90_000;

// ---------------------------------------------------------------------------
// SerpAPI result cache (4-hour TTL)
// ---------------------------------------------------------------------------

interface ICachedResult {
  result: ISerpApiSearchResult;
  timestamp: number;
}

/** Cache key: "query|location" → cached SerpAPI result with timestamp. */
const resultCache: Map<string, ICachedResult> = new Map();

/** Cache TTL: 4 hours in milliseconds. */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/** Build a cache key from query and location. */
function cacheKey(query: string, location: string | undefined): string {
  return `${query.toLowerCase()}|${(location ?? '').toLowerCase()}`;
}

/** Get a cached result if it exists and hasn't expired. */
function getCached(query: string, location: string | undefined): ISerpApiSearchResult | null {
  const key = cacheKey(query, location);
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resultCache.delete(key);
    return null;
  }
  return entry.result;
}

/** Store a successful result in the cache. */
function setCache(query: string, location: string | undefined, result: ISerpApiSearchResult): void {
  if (result.success) {
    resultCache.set(cacheKey(query, location), { result, timestamp: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

/**
 * Resets in-memory cooldown and concurrency state.
 * Exposed for unit/integration tests only.
 */
export function _resetScraperState(): void {
  lastScrapeTimestamps.clear();
  activeScrapes.clear();
  resultCache.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client with service_role privileges for listing ingestion.
 * The jobsearch_listings table RLS only allows service_role to INSERT/UPDATE.
 */
function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new InternalError('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
// ---------------------------------------------------------------------------

/**
 * Fetches the user's most recent active resume version from the DB.
 * Returns the IStructuredResume content, or throws ValidationError if none exists.
 */
async function fetchActiveResume(
  supabase: SupabaseClient,
  userId: string
): Promise<IStructuredResume> {
  const { data, error } = await supabase
    .from('resume_versions')
    .select('content')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new ValidationError(
      'No active resume found. Please upload a resume before searching for jobs.'
    );
  }

  return data.content as IStructuredResume;
}

/**
 * Fetches the set of existing listing IDs from the database.
 * Used to distinguish new inserts from merges during ingestion.
 */
async function fetchExistingListingIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('jobsearch_listings')
    .select('id');

  if (error) {
    // Non-critical: if we can't pre-fetch, we'll count everything as new
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add((row as { id: string }).id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full scrape pipeline for a user.
 *
 * 1. Check concurrency lock → 409 if active
 * 2. Check cooldown → throw CooldownError if within 60 minutes
 * 3. Validate SERPAPI_API_KEY
 * 4. Fetch user's active resume version
 * 5. Extract search queries from resume
 * 6. Take top 3 queries (cap SerpAPI calls)
 * 7. Call searchGoogleJobs sequentially; stop on 429, skip other failures
 * 8. Map results via mapSerpResultToListing
 * 9. Ingest each via ingestListing, skip individual failures
 * 10. Return IScrapeSummary with counts and warnings
 * 11. Abort if total time exceeds 30 seconds, return partial results
 */
export async function runScrape(
  supabase: SupabaseClient,
  userId: string,
  location?: string
): Promise<IScrapeSummary> {
  // Step 1: Concurrency check
  if (activeScrapes.has(userId)) {
    throw new ConflictError(
      'A scrape operation is already in progress. Please wait for it to complete.'
    );
  }

  // Step 2: Cooldown check
  const lastScrape = lastScrapeTimestamps.get(userId);
  if (lastScrape !== undefined) {
    const elapsed = Date.now() - lastScrape;
    if (elapsed < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - elapsed;
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      const cooldownExpiresAt = new Date(lastScrape + COOLDOWN_MS).toISOString();
      throw new CooldownError(cooldownExpiresAt, remainingMinutes);
    }
  }

  // Step 3: Validate SERPAPI_API_KEY
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new InternalError(
      'SerpAPI integration is not configured. The SERPAPI_API_KEY environment variable is missing.'
    );
  }

  console.log(`[Scraper] Using SERPAPI_API_KEY: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)} (length: ${String(apiKey.length)})`);

  // Acquire concurrency lock
  activeScrapes.add(userId);

  try {
    const pipelineStart = Date.now();
    const warnings: string[] = [];

    // Step 4: Fetch active resume
    const resume = await fetchActiveResume(supabase, userId);

    // Step 5: Extract search queries (smart AI-based extraction)
    console.log('[Scraper] Extracting search queries via Gemini...');
    const allQueries = await extractSmartQueries(resume);
    console.log(`[Scraper] Extracted ${String(allQueries.length)} queries: ${allQueries.map(q => q.text).join(', ')}`);

    // Step 6: Cap at MAX_SERP_CALLS
    const queries = allQueries.slice(0, MAX_SERP_CALLS);

    // Step 7: Call SerpAPI in PARALLEL (with cache)
    const allMappedListings: IListingIngestInput[] = [];
    let rateLimited = false;

    // Check cache first, only send uncached queries to SerpAPI
    const uncachedQueries: typeof queries = [];
    for (const query of queries) {
      const cached = getCached(query.text, location);
      if (cached) {
        console.log(`[Scraper] Cache hit for "${query.text}" (${String(cached.jobs.length)} jobs)`);
        for (const job of cached.jobs) {
          allMappedListings.push(mapSerpResultToListing(job));
        }
      } else {
        uncachedQueries.push(query);
      }
    }

    // Fire all uncached queries in parallel
    if (uncachedQueries.length > 0) {
      console.log(`[Scraper] Querying SerpAPI in parallel: ${uncachedQueries.map(q => `"${q.text}"`).join(', ')}`);

      const results = await Promise.allSettled(
        uncachedQueries.map((query) => searchGoogleJobs(query.text, apiKey, location))
      );

      for (let i = 0; i < results.length; i++) {
        const settled = results[i]!;
        const query = uncachedQueries[i]!;

        if (settled.status === 'rejected') {
          const err = settled.reason;
          if (err instanceof SerpApiRateLimitError) {
            warnings.push('SerpAPI rate limit exceeded (HTTP 429). Monthly quota exhausted.');
            rateLimited = true;
          } else {
            const msg = err instanceof Error ? err.message : 'unknown error';
            warnings.push(`Query "${query.text}" failed: ${msg}`);
          }
          continue;
        }

        const result = settled.value;
        if (!result.success) {
          console.log(`[Scraper] Query "${query.text}" failed: ${result.error ?? 'unknown'}`);
          warnings.push(`Query "${query.text}" failed: ${result.error ?? 'unknown error'}`);
          continue;
        }

        console.log(`[Scraper] Query "${query.text}" returned ${String(result.jobs.length)} jobs`);
        setCache(query.text, location, result);

        for (const job of result.jobs) {
          allMappedListings.push(mapSerpResultToListing(job));
        }
      }
    }

    // If no results at all from any query, throw
    if (allMappedListings.length === 0 && !rateLimited) {
      throw new AiProviderError(
        'No job results could be retrieved from the search provider. All queries failed.'
      );
    }

    // If rate limited with zero results
    if (allMappedListings.length === 0 && rateLimited) {
      throw new AiProviderError(
        'SerpAPI rate limit exceeded. Monthly search quota exhausted.'
      );
    }

    const totalResults = allMappedListings.length;

    // Step 9: Ingest listings
    // Use service-role client for ingestion (RLS only allows service_role to write listings)
    const serviceClient = createServiceClient();
    const existingIds = await fetchExistingListingIds(serviceClient);

    let newListings = 0;
    let duplicatesMerged = 0;
    let skipped = 0;

    for (const mappedListing of allMappedListings) {
      // Check timeout before each ingestion
      if (Date.now() - pipelineStart >= MAX_PIPELINE_DURATION_MS) {
        warnings.push('Pipeline timeout reached (30s). Some listings were not ingested.');
        skipped += allMappedListings.length - (newListings + duplicatesMerged + skipped);
        break;
      }

      try {
        const ingested = await ingestListing(serviceClient, mappedListing);

        if (existingIds.has(ingested.id)) {
          duplicatesMerged++;
        } else {
          newListings++;
          // Add to the set so subsequent duplicates within this batch are tracked
          existingIds.add(ingested.id);
        }
      } catch (err: unknown) {
        skipped++;
        const msg = err instanceof Error ? err.message : 'unknown error';
        console.error(`[Scraper] Ingestion failed for "${mappedListing.title}":`, msg);
        warnings.push(`Listing ingestion skipped: ${msg}`);
      }
    }

    console.log(`[Scraper] Ingestion complete: ${String(newListings)} new, ${String(duplicatesMerged)} merged, ${String(skipped)} skipped`);

    // Record successful scrape timestamp for cooldown
    lastScrapeTimestamps.set(userId, Date.now());

    // Step 10: Build and return summary
    const summary: IScrapeSummary = {
      totalResults,
      newListings,
      duplicatesMerged,
      skipped,
    };

    if (warnings.length > 0) {
      summary.warnings = warnings;
    }

    return summary;
  } finally {
    // Always release concurrency lock
    activeScrapes.delete(userId);
  }
}
