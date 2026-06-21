/**
 * Deduplication utilities for the Job Search module.
 *
 * Provides normalization, duplicate detection, and merge logic for
 * job listings ingested from multiple scraped sources.
 *
 * Named exports only. No `any`.
 */
import type { IListing, IListingIngestInput } from '../types/jobsearch.types.js';

/**
 * Normalizes a string for comparison purposes:
 * - Converts to lowercase
 * - Trims leading and trailing whitespace
 * - Collapses consecutive internal whitespace to a single space
 *
 * Requirements: 3.3, 3.4, 3.5
 */
export function normalizeForComparison(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Determines whether two listings are duplicates by comparing their
 * normalized company, title, and location fields.
 *
 * Two listings are considered duplicates if all three normalized fields match.
 *
 * Requirements: 3.1, 3.3, 3.4, 3.5
 */
export function isListingDuplicate(
  existing: Pick<IListing, 'company' | 'title' | 'location'>,
  incoming: Pick<IListing, 'company' | 'title' | 'location'>
): boolean {
  return (
    normalizeForComparison(existing.company) === normalizeForComparison(incoming.company) &&
    normalizeForComparison(existing.title) === normalizeForComparison(incoming.title) &&
    normalizeForComparison(existing.location) === normalizeForComparison(incoming.location)
  );
}

/**
 * Merges an incoming duplicate listing into an existing one according to
 * the deduplication merge rules:
 * - Retain the earliest `datePosted` from both records
 * - Append the incoming `sourceUrl` to the existing `sourceUrls` array (avoid duplicates)
 * - Use the most recently scraped description and salary values (incoming is assumed
 *   to be scraped "now", so compare existing.dateScraped against current time)
 * - The merged result retains the existing listing's `id` and updates `dateScraped` to now
 *
 * Requirements: 3.2
 */
export function mergeDuplicateListings(
  existing: IListing,
  incoming: IListingIngestInput
): IListing {
  const now = new Date().toISOString();

  // Retain the earliest datePosted
  const existingDate = new Date(existing.datePosted).getTime();
  const incomingDate = new Date(incoming.datePosted).getTime();
  const earliestDatePosted =
    existingDate <= incomingDate ? existing.datePosted : incoming.datePosted;

  // Append sourceUrl, avoiding duplicates
  const updatedSourceUrls = existing.sourceUrls.includes(incoming.sourceUrl)
    ? [...existing.sourceUrls]
    : [...existing.sourceUrls, incoming.sourceUrl];

  // The incoming record is being scraped "now", so it is always more recent
  // than the existing record's dateScraped. Use incoming's description and salary.
  const description = incoming.description;
  const salaryMin = incoming.salaryMin ?? null;
  const salaryMax = incoming.salaryMax ?? null;

  return {
    id: existing.id,
    title: existing.title,
    company: existing.company,
    location: existing.location,
    workMode: existing.workMode,
    description,
    sourceUrls: updatedSourceUrls,
    salaryMin,
    salaryMax,
    datePosted: earliestDatePosted,
    dateScraped: now,
  };
}
