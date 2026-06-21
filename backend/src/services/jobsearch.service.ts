/**
 * Job Search service facade (Requirements 1–9).
 *
 * A thin orchestration layer that the controller calls. It exposes a single,
 * cohesive surface for the Job Search module and delegates every operation to
 * the focused sub-services that own the business logic:
 *
 *   - Listing_Service   → {@link getListings}, {@link ingestListing}
 *   - Tracker_Service   → {@link listApplications}, {@link addApplication},
 *                         {@link updateStage}, {@link getApplicationDetail},
 *                         {@link updateNotes}, {@link deleteApplication}
 *   - AI_Writer_Service → {@link generateCoverLetter},
 *                         {@link generateLinkedInOutreach},
 *                         {@link generateFollowUpEmail}
 *
 * This module contains NO business logic of its own — it only re-orders and
 * forwards arguments. Typed errors thrown by the sub-services
 * (`ValidationError`, `NotFoundError`, `ConflictError`, `AiProviderError`,
 * `InternalError`) propagate unchanged to the centralized error middleware.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IApplication,
  IApplicationDetail,
  IListing,
  IListingFilters,
  IListingIngestInput,
  Stage,
} from '../types/jobsearch.types.js';

import {
  getListings as getListingsImpl,
  ingestListing as ingestListingImpl,
} from './jobsearchListing.service.js';
import type { IPaginationParams, IPaginatedResult } from './jobsearchListing.service.js';

import {
  listApplications as listApplicationsImpl,
  addApplication as addApplicationImpl,
  updateStage as updateStageImpl,
  getApplicationDetail as getApplicationDetailImpl,
  updateNotes as updateNotesImpl,
  deleteApplication as deleteApplicationImpl,
} from './jobsearchTracker.service.js';

import {
  generateCoverLetter as generateCoverLetterImpl,
  generateLinkedInOutreach as generateLinkedInOutreachImpl,
  generateFollowUpEmail as generateFollowUpEmailImpl,
} from './jobsearchAiWriter.service.js';

import {
  runScrape as runScrapeImpl,
  type IScrapeSummary,
} from './jobsearchScraper.service.js';

// Re-export input/result types so the controller can depend on the facade as
// the single import point for the Job Search module.
export type { IPaginationParams, IPaginatedResult } from './jobsearchListing.service.js';
export type { IScrapeSummary } from './jobsearchScraper.service.js';

// ---------------------------------------------------------------------------
// Listing operations (Requirements 1, 2, 3)
// ---------------------------------------------------------------------------

/**
 * Retrieve a paginated, filtered list of job listings.
 * Delegates to `jobsearchListing.service`.
 */
export async function getListings(
  supabase: SupabaseClient,
  filters: IListingFilters,
  pagination: IPaginationParams
): Promise<IPaginatedResult<IListing>> {
  return getListingsImpl(supabase, filters, pagination);
}

/**
 * Ingest a new job listing with deduplication logic.
 * Delegates to `jobsearchListing.service`.
 */
export async function ingestListing(
  supabase: SupabaseClient,
  input: IListingIngestInput
): Promise<IListing> {
  return ingestListingImpl(supabase, input);
}

// ---------------------------------------------------------------------------
// Tracker operations (Requirements 4, 5, 9)
// ---------------------------------------------------------------------------

/**
 * Fetch all applications belonging to the authenticated user.
 * Delegates to `jobsearchTracker.service`.
 */
export async function listApplications(
  supabase: SupabaseClient,
  userId: string
): Promise<IApplication[]> {
  return listApplicationsImpl(supabase, userId);
}

/**
 * Add a listing to the user's application tracker.
 * Delegates to `jobsearchTracker.service`.
 */
export async function addApplication(
  supabase: SupabaseClient,
  userId: string,
  listingId: string
): Promise<IApplication> {
  return addApplicationImpl(supabase, userId, listingId);
}

/**
 * Update the stage of an existing application.
 * Delegates to `jobsearchTracker.service`.
 */
export async function updateStage(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  newStage: Stage
): Promise<IApplication> {
  return updateStageImpl(supabase, userId, applicationId, newStage);
}

/**
 * Fetch the full detail of an application including listing and stage history.
 * Delegates to `jobsearchTracker.service`.
 */
export async function getApplicationDetail(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<IApplicationDetail> {
  return getApplicationDetailImpl(supabase, userId, applicationId);
}

/**
 * Update the notes field on an application.
 * Delegates to `jobsearchTracker.service`.
 */
export async function updateNotes(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  notes: string
): Promise<IApplication> {
  return updateNotesImpl(supabase, userId, applicationId, notes);
}

/**
 * Delete an application record.
 * Delegates to `jobsearchTracker.service`.
 */
export async function deleteApplication(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<void> {
  return deleteApplicationImpl(supabase, userId, applicationId);
}

// ---------------------------------------------------------------------------
// AI Writer operations (Requirements 6, 7, 8)
// ---------------------------------------------------------------------------

/**
 * Generate a cover letter for a job application.
 * Delegates to `jobsearchAiWriter.service`.
 */
export async function generateCoverLetter(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<string> {
  return generateCoverLetterImpl(supabase, userId, applicationId);
}

/**
 * Generate a LinkedIn outreach message for a job application.
 * Delegates to `jobsearchAiWriter.service`.
 */
export async function generateLinkedInOutreach(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  recipientName?: string,
  recipientRole?: string
): Promise<string> {
  return generateLinkedInOutreachImpl(
    supabase,
    userId,
    applicationId,
    recipientName,
    recipientRole
  );
}

/**
 * Generate a follow-up email for a job application.
 * Delegates to `jobsearchAiWriter.service`.
 */
export async function generateFollowUpEmail(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<string> {
  return generateFollowUpEmailImpl(supabase, userId, applicationId);
}

// ---------------------------------------------------------------------------
// Scraper operations (Requirements 1, 2, 3, 4, 5, 7)
// ---------------------------------------------------------------------------

/**
 * Run a job scrape: extract keywords from the user's active resume, query
 * SerpAPI, and ingest discovered listings.
 * Delegates to `jobsearchScraper.service`.
 */
export async function runScrape(
  supabase: SupabaseClient,
  userId: string,
  location?: string
): Promise<IScrapeSummary> {
  return runScrapeImpl(supabase, userId, location);
}

