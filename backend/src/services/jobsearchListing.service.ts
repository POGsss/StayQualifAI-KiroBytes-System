/**
 * Job Search Listing Service (Requirements 1.2, 1.3, 1.5, 2.1–2.7, 3.1, 3.2, 3.6).
 *
 * Provides paginated, filterable listing retrieval and listing ingestion with
 * deduplication. All database access goes through the Supabase client passed
 * into each function.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IListing,
  IListingFilters,
  IListingIngestInput,
  IPaginationMeta,
  WorkMode,
} from '../types/jobsearch.types.js';
import {
  mergeDuplicateListings,
  normalizeForComparison,
} from '../utils/jobsearchDedup.js';
import { InternalError, ValidationError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface IPaginationParams {
  page: number; // >= 1
  pageSize: number; // 1..100, default 20
}

export interface IPaginatedResult<T> {
  items: T[];
  meta: IPaginationMeta;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_WORK_MODES: ReadonlySet<string> = new Set<string>([
  'Remote',
  'Hybrid',
  'Onsite',
]);

const MAX_FILTER_LENGTH = 100;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates pagination parameters. Throws ValidationError if invalid.
 */
function validatePagination(pagination: IPaginationParams): void {
  if (!Number.isInteger(pagination.page) || pagination.page < 1) {
    throw new ValidationError(
      `Invalid page number: must be an integer >= 1, received ${String(pagination.page)}`
    );
  }
  if (
    !Number.isInteger(pagination.pageSize) ||
    pagination.pageSize < MIN_PAGE_SIZE ||
    pagination.pageSize > MAX_PAGE_SIZE
  ) {
    throw new ValidationError(
      `Invalid page size: must be an integer between ${String(MIN_PAGE_SIZE)} and ${String(MAX_PAGE_SIZE)}, received ${String(pagination.pageSize)}`
    );
  }
}

/**
 * Validates a single filter value. Throws ValidationError if invalid.
 */
function validateFilterValue(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError(
      `Invalid ${name} filter: value must not be empty or contain only whitespace`
    );
  }
  if (value.length > MAX_FILTER_LENGTH) {
    throw new ValidationError(
      `Invalid ${name} filter: value must not exceed ${String(MAX_FILTER_LENGTH)} characters`
    );
  }
}

/**
 * Validates all provided filter values.
 */
function validateFilters(filters: IListingFilters): void {
  if (filters.workMode !== undefined) {
    if (!VALID_WORK_MODES.has(filters.workMode)) {
      throw new ValidationError(
        `Invalid workMode filter: must be one of Remote, Hybrid, Onsite`
      );
    }
  }
  if (filters.location !== undefined) {
    validateFilterValue('location', filters.location);
  }
  if (filters.keyword !== undefined) {
    validateFilterValue('keyword', filters.keyword);
  }
  if (filters.company !== undefined) {
    validateFilterValue('company', filters.company);
  }
}

/**
 * Validates listing ingest input fields.
 */
function validateIngestInput(input: IListingIngestInput): void {
  if (!input.title || input.title.trim().length === 0 || input.title.length > 255) {
    throw new ValidationError(
      'Invalid title: must be between 1 and 255 characters'
    );
  }
  if (!input.company || input.company.trim().length === 0 || input.company.length > 255) {
    throw new ValidationError(
      'Invalid company: must be between 1 and 255 characters'
    );
  }
  if (!input.location || input.location.trim().length === 0 || input.location.length > 255) {
    throw new ValidationError(
      'Invalid location: must be between 1 and 255 characters'
    );
  }
  if (input.description.length > 5000) {
    throw new ValidationError(
      'Invalid description: must not exceed 5000 characters'
    );
  }
  if (!VALID_WORK_MODES.has(input.workMode)) {
    throw new ValidationError(
      'Invalid workMode: must be one of Remote, Hybrid, Onsite'
    );
  }
  if (input.salaryMin !== undefined) {
    if (input.salaryMin < 0 || input.salaryMin > 999_999_999) {
      throw new ValidationError(
        'Invalid salaryMin: must be between 0 and 999999999'
      );
    }
  }
  if (input.salaryMax !== undefined) {
    if (input.salaryMax < 0 || input.salaryMax > 999_999_999) {
      throw new ValidationError(
        'Invalid salaryMax: must be between 0 and 999999999'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// DB row → domain mapping
// ---------------------------------------------------------------------------

interface IListingRow {
  id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  description: string;
  source_urls: string[];
  salary_min: number | null;
  salary_max: number | null;
  date_posted: string;
  date_scraped: string;
}

function mapRowToListing(row: IListingRow): IListing {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    workMode: row.work_mode as WorkMode,
    description: row.description,
    sourceUrls: row.source_urls,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    datePosted: row.date_posted,
    dateScraped: row.date_scraped,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieves a paginated, filtered list of job listings.
 *
 * Requirements: 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
export async function getListings(
  supabase: SupabaseClient,
  filters: IListingFilters,
  pagination: IPaginationParams
): Promise<IPaginatedResult<IListing>> {
  validatePagination(pagination);
  validateFilters(filters);

  const { page, pageSize } = pagination;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build the base query with count
  let query = supabase
    .from('jobsearch_listings')
    .select(
      'id, title, company, location, work_mode, description, source_urls, salary_min, salary_max, date_posted, date_scraped',
      { count: 'exact' }
    );

  // Apply filters (conjunctive — AND)
  if (filters.workMode !== undefined) {
    query = query.eq('work_mode', filters.workMode);
  }
  if (filters.location !== undefined) {
    query = query.ilike('location', `%${filters.location}%`);
  }
  if (filters.company !== undefined) {
    query = query.ilike('company', `%${filters.company}%`);
  }
  if (filters.keyword !== undefined) {
    // Keyword searches both title AND description (OR)
    query = query.or(
      `title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%`
    );
  }

  // Sort and paginate
  query = query
    .order('date_posted', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new InternalError(`Failed to retrieve listings: ${error.message}`);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const items = (data as IListingRow[] | null ?? []).map(mapRowToListing);

  return {
    items,
    meta: {
      totalCount,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

/**
 * Ingests a single job listing with deduplication logic.
 *
 * If a duplicate is detected (matching normalized company + title + location),
 * the existing record is merged/updated. Otherwise, a new record is inserted.
 *
 * Requirements: 3.1, 3.2, 3.6
 */
export async function ingestListing(
  supabase: SupabaseClient,
  input: IListingIngestInput
): Promise<IListing> {
  validateIngestInput(input);

  // Query for potential duplicates using normalized values
  const normalizedCompany = normalizeForComparison(input.company);
  const normalizedTitle = normalizeForComparison(input.title);
  const normalizedLocation = normalizeForComparison(input.location);

  const { data: candidates, error: dedupError } = await supabase
    .from('jobsearch_listings')
    .select(
      'id, title, company, location, work_mode, description, source_urls, salary_min, salary_max, date_posted, date_scraped'
    );

  if (dedupError) {
    throw new InternalError(
      `Deduplication check failed: ${dedupError.message}`
    );
  }

  // Find a duplicate among candidates using normalized comparison
  const existingRow = (candidates as IListingRow[] | null ?? []).find(
    (row) =>
      normalizeForComparison(row.company) === normalizedCompany &&
      normalizeForComparison(row.title) === normalizedTitle &&
      normalizeForComparison(row.location) === normalizedLocation
  );

  if (existingRow) {
    // Merge with existing listing
    const existingListing = mapRowToListing(existingRow);
    const merged = mergeDuplicateListings(existingListing, input);

    const { data: updated, error: updateError } = await supabase
      .from('jobsearch_listings')
      .update({
        description: merged.description,
        source_urls: merged.sourceUrls,
        salary_min: merged.salaryMin,
        salary_max: merged.salaryMax,
        date_posted: merged.datePosted,
        date_scraped: merged.dateScraped,
      })
      .eq('id', existingRow.id)
      .select(
        'id, title, company, location, work_mode, description, source_urls, salary_min, salary_max, date_posted, date_scraped'
      )
      .single();

    if (updateError) {
      throw new InternalError(
        `Failed to update duplicate listing: ${updateError.message}`
      );
    }

    return mapRowToListing(updated as IListingRow);
  }

  // No duplicate — insert new listing
  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('jobsearch_listings')
    .insert({
      title: input.title,
      company: input.company,
      location: input.location,
      work_mode: input.workMode,
      description: input.description,
      source_urls: [input.sourceUrl],
      salary_min: input.salaryMin ?? null,
      salary_max: input.salaryMax ?? null,
      date_posted: input.datePosted,
      date_scraped: now,
    })
    .select(
      'id, title, company, location, work_mode, description, source_urls, salary_min, salary_max, date_posted, date_scraped'
    )
    .single();

  if (insertError) {
    throw new InternalError(
      `Failed to insert listing: ${insertError.message}`
    );
  }

  return mapRowToListing(inserted as IListingRow);
}
