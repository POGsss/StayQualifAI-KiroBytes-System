/**
 * SerpAPI Google Jobs HTTP client.
 *
 * Provides a single-query search function with:
 * - 10-second timeout via AbortController
 * - HTTP 429 → throws SerpApiRateLimitError (caller must stop processing)
 * - Other HTTP errors / timeouts → returns failure result (caller continues)
 *
 * Named exports only. No `any`. Explicit return types.
 */

import { ISerpApiJobResult } from './jobsearchScrapeMapper.js';
import { AppError } from './errors.js';

/**
 * Aggregated search result for a single query.
 */
export interface ISerpApiSearchResult {
  query: string;
  jobs: ISerpApiJobResult[];
  success: boolean;
  error?: string;
}

/**
 * Thrown when SerpAPI responds with HTTP 429 (rate limit exceeded).
 * The scraper service catches this to stop processing remaining queries.
 */
export class SerpApiRateLimitError extends AppError {
  public readonly type = 'SerpApiRateLimitError';
  public readonly httpStatus = 429;

  public constructor(message?: string) {
    super(message ?? 'SerpAPI rate limit exceeded (HTTP 429). Monthly search quota exhausted.');
  }
}

/** Timeout duration for each SerpAPI request (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/** SerpAPI Google Jobs endpoint base URL. */
const SERPAPI_BASE_URL = 'https://serpapi.com/search';

/**
 * Raw response shape from SerpAPI Google Jobs endpoint.
 */
interface ISerpApiRawResponse {
  jobs_results?: ISerpApiJobResult[];
  error?: string;
}

/**
 * Searches SerpAPI Google Jobs for a single query.
 *
 * - Sends an HTTP GET with `engine=google_jobs`, the query, API key, and optional location.
 * - Applies a 10-second request timeout using AbortController.
 * - On HTTP 429: throws {@link SerpApiRateLimitError} so the caller stops all remaining queries.
 * - On other HTTP errors or timeout: returns `{ query, jobs: [], success: false, error: message }`.
 * - On success: returns `{ query, jobs: [...], success: true }`.
 */
export async function searchGoogleJobs(
  query: string,
  apiKey: string,
  location?: string
): Promise<ISerpApiSearchResult> {
  const url = new URL(SERPAPI_BASE_URL);
  url.searchParams.set('engine', 'google_jobs');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);

  if (location) {
    url.searchParams.set('location', location);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    console.log(`[SerpAPI] GET ${url.toString().replace(apiKey, apiKey.slice(0, 8) + '...')}`);
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new SerpApiRateLimitError();
    }

    if (!response.ok) {
      return {
        query,
        jobs: [],
        success: false,
        error: `SerpAPI returned HTTP ${String(response.status)}: ${response.statusText}`,
      };
    }

    const data: ISerpApiRawResponse = await response.json() as ISerpApiRawResponse;
    const jobs: ISerpApiJobResult[] = data.jobs_results ?? [];

    return {
      query,
      jobs,
      success: true,
    };
  } catch (error: unknown) {
    // Re-throw rate limit errors — the caller must handle them
    if (error instanceof SerpApiRateLimitError) {
      throw error;
    }

    // Handle abort (timeout) and other network errors
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `SerpAPI request timed out after ${String(REQUEST_TIMEOUT_MS / 1000)} seconds`
        : error instanceof Error
          ? `SerpAPI request failed: ${error.message}${error.cause ? ` (cause: ${String(error.cause)})` : ''}`
          : 'SerpAPI request failed: unknown error';

    console.error('[SerpAPI] Fetch error details:', error);

    return {
      query,
      jobs: [],
      success: false,
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
