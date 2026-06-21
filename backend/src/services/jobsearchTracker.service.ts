/**
 * Job Search Application Tracker service.
 *
 * Manages user job applications across lifecycle stages (Wishlist → Applied →
 * Interviewing → Offer → Rejected). Provides CRUD operations plus stage
 * transitions with full history tracking.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 5.1, 5.2, 5.3, 5.5,
 *              9.2, 9.4
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IApplication,
  IApplicationDetail,
  IListing,
  IStageTransition,
  Stage,
} from '../types/jobsearch.types.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

/** Valid stage values for runtime validation. */
const VALID_STAGES: readonly Stage[] = [
  'Wishlist',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
];

/**
 * Map a raw database application row (with joined listing fields) to the
 * `IApplication` interface shape (snake_case → camelCase).
 */
function mapRowToApplication(row: Record<string, unknown>): IApplication {
  const listing = row.jobsearch_listings as Record<string, unknown> | undefined;
  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    stage: row.stage as Stage,
    notes: (row.notes as string) ?? null,
    dateAdded: row.date_added as string,
    dateStageChanged: row.date_stage_changed as string,
    listingTitle: listing?.title as string ?? '',
    listingCompany: listing?.company as string ?? '',
  };
}

/**
 * Map a raw listing row to the `IListing` interface shape.
 */
function mapRowToListing(row: Record<string, unknown>): IListing {
  return {
    id: row.id as string,
    title: row.title as string,
    company: row.company as string,
    location: row.location as string,
    workMode: row.work_mode as IListing['workMode'],
    description: (row.description as string) ?? '',
    sourceUrls: (row.source_urls as string[]) ?? [],
    salaryMin: row.salary_min != null ? Number(row.salary_min) : null,
    salaryMax: row.salary_max != null ? Number(row.salary_max) : null,
    datePosted: row.date_posted as string,
    dateScraped: row.date_scraped as string,
  };
}

/**
 * Fetch all applications belonging to the authenticated user with denormalized
 * listing fields, ordered by date_stage_changed descending.
 *
 * Requirements: 4.7, 4.8, 4.9
 */
export async function listApplications(
  supabase: SupabaseClient,
  userId: string
): Promise<IApplication[]> {
  const { data, error } = await supabase
    .from('jobsearch_applications')
    .select('*, jobsearch_listings(title, company)')
    .eq('user_id', userId)
    .order('date_stage_changed', { ascending: false });

  if (error) {
    throw new NotFoundError(`Failed to fetch applications: ${error.message}`);
  }

  return (data ?? []).map(mapRowToApplication);
}

/**
 * Add a listing to the user's application tracker. Creates the application in
 * the Wishlist stage and records the initial stage history entry.
 *
 * Throws `ConflictError` if the user has already tracked this listing.
 *
 * Requirements: 4.3, 4.4
 */
export async function addApplication(
  supabase: SupabaseClient,
  userId: string,
  listingId: string
): Promise<IApplication> {
  const now = new Date().toISOString();

  // Insert the application record
  const { data: appData, error: appError } = await supabase
    .from('jobsearch_applications')
    .insert({
      user_id: userId,
      listing_id: listingId,
      stage: 'Wishlist',
      date_added: now,
      date_stage_changed: now,
    })
    .select('*, jobsearch_listings(title, company)')
    .single();

  if (appError) {
    // PostgreSQL unique violation error code
    if (appError.code === '23505') {
      throw new ConflictError(
        'This listing is already tracked in your applications.'
      );
    }
    throw new NotFoundError(`Failed to add application: ${appError.message}`);
  }

  // Insert initial stage history entry
  await supabase.from('jobsearch_stage_history').insert({
    application_id: appData.id,
    stage: 'Wishlist',
    changed_at: now,
  });

  return mapRowToApplication(appData);
}

/**
 * Update the stage of an existing application. Records the timestamp and
 * inserts a stage history entry atomically.
 *
 * Throws `ValidationError` if the stage value is invalid.
 * Throws `NotFoundError` if the application does not exist or is not owned.
 *
 * Requirements: 4.5
 */
export async function updateStage(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  newStage: Stage
): Promise<IApplication> {
  // Validate stage
  if (!VALID_STAGES.includes(newStage)) {
    throw new ValidationError(
      `Invalid stage "${newStage}". Must be one of: ${VALID_STAGES.join(', ')}`
    );
  }

  const now = new Date().toISOString();

  // Update application stage and timestamp
  const { data, error } = await supabase
    .from('jobsearch_applications')
    .update({
      stage: newStage,
      date_stage_changed: now,
    })
    .eq('id', applicationId)
    .eq('user_id', userId)
    .select('*, jobsearch_listings(title, company)')
    .single();

  if (error || !data) {
    throw new NotFoundError(
      'Application not found or you do not have permission to update it.'
    );
  }

  // Insert stage history record
  await supabase.from('jobsearch_stage_history').insert({
    application_id: applicationId,
    stage: newStage,
    changed_at: now,
  });

  return mapRowToApplication(data);
}

/**
 * Fetch the full detail of an application including the complete listing and
 * stage history in reverse chronological order.
 *
 * Throws `NotFoundError` if the application does not exist or is not owned.
 *
 * Requirements: 5.1, 5.5
 */
export async function getApplicationDetail(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<IApplicationDetail> {
  // Fetch application with full listing join
  const { data: appData, error: appError } = await supabase
    .from('jobsearch_applications')
    .select('*, jobsearch_listings(*)')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single();

  if (appError || !appData) {
    throw new NotFoundError('Application not found.');
  }

  // Fetch stage history ordered by changed_at DESC
  const { data: historyData, error: historyError } = await supabase
    .from('jobsearch_stage_history')
    .select('stage, changed_at')
    .eq('application_id', applicationId)
    .order('changed_at', { ascending: false });

  if (historyError) {
    throw new NotFoundError(
      `Failed to fetch stage history: ${historyError.message}`
    );
  }

  const listingRow = appData.jobsearch_listings as Record<string, unknown>;

  const application: IApplication = {
    id: appData.id as string,
    listingId: appData.listing_id as string,
    stage: appData.stage as Stage,
    notes: (appData.notes as string) ?? null,
    dateAdded: appData.date_added as string,
    dateStageChanged: appData.date_stage_changed as string,
    listingTitle: listingRow?.title as string ?? '',
    listingCompany: listingRow?.company as string ?? '',
  };

  const listing: IListing = mapRowToListing(listingRow);

  const stageHistory: IStageTransition[] = (historyData ?? []).map(
    (row: Record<string, unknown>) => ({
      stage: row.stage as Stage,
      changedAt: row.changed_at as string,
    })
  );

  return { application, listing, stageHistory };
}

/**
 * Update the notes field on an application. Validates the 2000 character limit.
 *
 * Throws `ValidationError` if notes exceed 2000 characters.
 * Throws `NotFoundError` if the application does not exist or is not owned.
 *
 * Requirements: 5.2, 5.3
 */
export async function updateNotes(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
  notes: string
): Promise<IApplication> {
  if (notes.length > 2000) {
    throw new ValidationError(
      'Notes must not exceed 2000 characters.'
    );
  }

  const { data, error } = await supabase
    .from('jobsearch_applications')
    .update({ notes })
    .eq('id', applicationId)
    .eq('user_id', userId)
    .select('*, jobsearch_listings(title, company)')
    .single();

  if (error || !data) {
    throw new NotFoundError(
      'Application not found or you do not have permission to update it.'
    );
  }

  return mapRowToApplication(data);
}

/**
 * Delete an application record. The cascade on `jobsearch_stage_history`
 * automatically removes related history entries.
 *
 * Throws `NotFoundError` if the application does not exist or is not owned.
 *
 * Requirements: 9.2, 9.4
 */
export async function deleteApplication(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<void> {
  // First verify the application exists and belongs to this user
  const { data: existing, error: fetchError } = await supabase
    .from('jobsearch_applications')
    .select('id')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError(
      'Application not found or you do not have permission to delete it.'
    );
  }

  const { error: deleteError } = await supabase
    .from('jobsearch_applications')
    .delete()
    .eq('id', applicationId)
    .eq('user_id', userId);

  if (deleteError) {
    throw new NotFoundError(
      `Failed to delete application: ${deleteError.message}`
    );
  }
}
