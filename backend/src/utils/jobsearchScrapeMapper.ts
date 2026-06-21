/**
 * Scrape result mapper utility for the Job Scraper feature.
 *
 * Maps raw SerpAPI Google Jobs results to the IListingIngestInput schema
 * used by the existing Listing_Service ingestion pipeline.
 *
 * Named exports only. No `any`. Explicit return types.
 */

import type { IListingIngestInput, WorkMode } from '../types/jobsearch.types.js';

/**
 * Raw job result shape returned by SerpAPI Google Jobs endpoint.
 */
export interface ISerpApiJobResult {
  title: string;
  company_name: string;
  location?: string;
  description?: string;
  detected_extensions?: {
    posted_at?: string;
  };
  apply_options?: Array<{ link: string }>;
  share_link?: string;
}

/** Maximum description length before truncation. */
const MAX_DESCRIPTION_LENGTH = 5000;

/**
 * Maps a SerpAPI job result to the existing IListingIngestInput schema.
 *
 * - Detects workMode from location text
 * - Parses datePosted from detected_extensions.posted_at
 * - Truncates description to 5000 chars
 * - Defaults missing location to "Not specified"
 * - sourceUrl: first apply_options[].link, fallback to share_link
 */
export function mapSerpResultToListing(result: ISerpApiJobResult): IListingIngestInput {
  const location = result.location || 'Not specified';
  const description = result.description
    ? result.description.slice(0, MAX_DESCRIPTION_LENGTH)
    : '';

  const sourceUrl =
    result.apply_options?.[0]?.link || result.share_link || '';

  return {
    title: result.title,
    company: result.company_name,
    location,
    workMode: detectWorkMode(location),
    description,
    sourceUrl,
    datePosted: parseDatePosted(result.detected_extensions?.posted_at),
  };
}

/**
 * Determines work mode from location text.
 *
 * - Contains "remote" (case-insensitive) → Remote
 * - Does not contain "remote" but contains "hybrid" (case-insensitive) → Hybrid
 * - Otherwise → Onsite
 */
export function detectWorkMode(location: string): WorkMode {
  const lower = location.toLowerCase();

  if (lower.includes('remote')) {
    return 'Remote';
  }
  if (lower.includes('hybrid')) {
    return 'Hybrid';
  }
  return 'Onsite';
}

/**
 * Supported relative time units and their millisecond equivalents.
 */
const TIME_UNITS: Record<string, number> = {
  second: 1000,
  seconds: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Regex pattern for relative time expressions like "3 days ago", "1 hour ago".
 */
const RELATIVE_TIME_REGEX = /^(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago$/i;

/**
 * Parses a relative time expression (e.g., "3 days ago") or absolute date
 * into an ISO 8601 timestamp. Returns current UTC time if unparseable or undefined.
 */
export function parseDatePosted(postedAt: string | undefined): string {
  if (!postedAt || postedAt.trim() === '') {
    return new Date().toISOString();
  }

  const trimmed = postedAt.trim();

  // Try relative time parsing first
  const relativeMatch = RELATIVE_TIME_REGEX.exec(trimmed);
  if (relativeMatch && relativeMatch[1] && relativeMatch[2]) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const msOffset: number | undefined = TIME_UNITS[unit];

    if (msOffset !== undefined) {
      const now = Date.now();
      const past = new Date(now - amount * msOffset);
      return past.toISOString();
    }
  }

  // Try absolute date parsing
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  // Fallback to current UTC
  return new Date().toISOString();
}
