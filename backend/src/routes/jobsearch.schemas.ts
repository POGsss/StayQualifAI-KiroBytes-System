/**
 * Zod request schemas for the Job Search module routes.
 *
 * These schemas validate request bodies, params, and query strings before
 * reaching any controller/service logic. Malformed requests are rejected with
 * a structured ValidationError (Requirements 1.5, 2.7, 5.3).
 *
 * Named exports only. No `any`.
 */
import { z } from 'zod';

import type { Stage, WorkMode } from '../types/jobsearch.types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A UUID string (for route params and body references). */
const uuidParam = z.string().uuid();

/** Work mode enum values. */
const workModeEnum: z.ZodType<WorkMode> = z.enum(['Remote', 'Hybrid', 'Onsite']);

/** Application stage enum values. */
const stageEnum: z.ZodType<Stage> = z.enum([
  'Wishlist',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
]);

/**
 * Optional filter string: 1–100 characters, non-whitespace-only after trim.
 * Used for location, keyword, and company query filters (Requirement 2.7).
 */
const optionalFilterString = z
  .string()
  .trim()
  .min(1, 'Filter value must be at least 1 character')
  .max(100, 'Filter value must not exceed 100 characters')
  .optional();

// ---------------------------------------------------------------------------
// 1. Listing query params (GET /listings)
// ---------------------------------------------------------------------------

/** Query parameters for paginated, filtered listing retrieval. */
export const listingQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size must not exceed 100')
    .default(20),
  workMode: workModeEnum.optional(),
  location: optionalFilterString,
  keyword: optionalFilterString,
  company: optionalFilterString,
});

// ---------------------------------------------------------------------------
// 2. Listing ingest body (POST /listings)
// ---------------------------------------------------------------------------

/** Body schema for ingesting a new job listing. */
export const listingIngestBodySchema = z.object({
  title: z.string().trim().min(1).max(255),
  company: z.string().trim().min(1).max(255),
  location: z.string().trim().min(1).max(255),
  workMode: workModeEnum,
  description: z.string().max(5000),
  sourceUrl: z.string().url(),
  salaryMin: z.number().min(0).max(999_999_999).optional(),
  salaryMax: z.number().min(0).max(999_999_999).optional(),
  datePosted: z.string().datetime({ message: 'datePosted must be a valid ISO date string' }),
});

// ---------------------------------------------------------------------------
// 3. Add application body (POST /applications)
// ---------------------------------------------------------------------------

/** Body schema for adding a listing to the application tracker. */
export const addApplicationBodySchema = z.object({
  listingId: uuidParam,
});

// ---------------------------------------------------------------------------
// 4. Stage update body (PATCH /applications/:id/stage)
// ---------------------------------------------------------------------------

/** Body schema for updating an application's stage. */
export const stageUpdateBodySchema = z.object({
  stage: stageEnum,
});

// ---------------------------------------------------------------------------
// 5. Notes update body (PATCH /applications/:id/notes)
// ---------------------------------------------------------------------------

/** Body schema for updating application notes (Requirement 5.3). */
export const notesUpdateBodySchema = z.object({
  notes: z.string().max(2000, 'Notes must not exceed 2000 characters'),
});

// ---------------------------------------------------------------------------
// 6. Application ID params (shared for :id routes)
// ---------------------------------------------------------------------------

/** Route params schema for endpoints that take an application `:id`. */
export const applicationIdParamsSchema = z.object({
  id: uuidParam,
});

// ---------------------------------------------------------------------------
// 7. Cover letter body (POST /ai/cover-letter)
// ---------------------------------------------------------------------------

/** Body schema for AI cover letter generation. */
export const coverLetterBodySchema = z.object({
  applicationId: uuidParam,
});

// ---------------------------------------------------------------------------
// 8. LinkedIn outreach body (POST /ai/linkedin-outreach)
// ---------------------------------------------------------------------------

/** Body schema for AI LinkedIn outreach message generation. */
export const linkedInOutreachBodySchema = z.object({
  applicationId: uuidParam,
  recipientName: z.string().optional(),
  recipientRole: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 9. Follow-up email body (POST /ai/follow-up-email)
// ---------------------------------------------------------------------------

/** Body schema for AI follow-up email generation. */
export const followUpEmailBodySchema = z.object({
  applicationId: uuidParam,
});
