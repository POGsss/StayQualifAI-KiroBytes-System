/**
 * Job Search controller (Requirements 1–9).
 *
 * The orchestration layer between the route/middleware stack and the Job Search
 * service facade. Each handler:
 *   - reads the already-validated `body`/`params`/`query` from the request
 *     (validation runs in middleware, before these handlers),
 *   - narrows the auth-middleware-provided `req.user` / `req.supabase` (threading
 *     the RLS-scoped client and `userId` into facade calls that touch the DB),
 *   - invokes the facade, and
 *   - shapes the result into the standard `{ data, error, meta }` envelope
 *     (`IApiResponse`) with `data` populated and `error` null on success.
 *
 * Failures are never shaped here: every handler is wrapped so any thrown typed
 * error is forwarded via `next(err)` to the centralized error middleware, which
 * produces the failure envelope (`data: null` + typed `error`) and maps the
 * HTTP status. Controllers hold NO direct Supabase or Gemini access — they only
 * pass `req.supabase` through to the facade (Route → Controller → Service flow).
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

import type { IApiResponse } from '../types/resume.types.js';
import type {
  IApplication,
  IApplicationDetail,
  IAiWriterResponse,
  IListing,
  IListingFilters,
  IListingIngestInput,
  Stage,
  WorkMode,
} from '../types/jobsearch.types.js';
import { AuthError } from '../utils/errors.js';
import {
  getListings as getListingsSvc,
  ingestListing as ingestListingSvc,
  listApplications as listApplicationsSvc,
  addApplication as addApplicationSvc,
  updateStage as updateStageSvc,
  getApplicationDetail as getApplicationDetailSvc,
  updateNotes as updateNotesSvc,
  deleteApplication as deleteApplicationSvc,
  generateCoverLetter as generateCoverLetterSvc,
  generateLinkedInOutreach as generateLinkedInOutreachSvc,
  generateFollowUpEmail as generateFollowUpEmailSvc,
  type IPaginationParams,
  type IPaginatedResult,
} from '../services/jobsearch.service.js';

// ---------------------------------------------------------------------------
// Envelope + narrowing helpers.
// ---------------------------------------------------------------------------

/**
 * Resolve the request id surfaced in `meta`. Honors an upstream `x-request-id`
 * header when present; otherwise generates a UUID.
 */
function resolveRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && header.length > 0 && header[0] !== undefined) {
    return header[0];
  }
  return randomUUID();
}

/**
 * Build a success envelope: `data` populated, `error` null, and `meta` carrying
 * a `requestId` and ISO `timestamp`.
 */
function successEnvelope<T>(req: Request, data: T): IApiResponse<T> {
  return {
    data,
    error: null,
    meta: {
      requestId: resolveRequestId(req),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Narrow the authenticated user id from `req.user`. A missing user is an
 * unexpected misconfiguration surfaced as a typed {@link AuthError}.
 */
function requireUserId(req: Request): string {
  const user = req.user;
  if (user === undefined) {
    throw new AuthError('Authenticated user is required for this operation.');
  }
  return user.id;
}

/**
 * Narrow the per-request, RLS-scoped Supabase client from `req.supabase`. A
 * missing client is an unexpected misconfiguration surfaced as a typed
 * {@link AuthError}.
 */
function requireSupabase(req: Request): SupabaseClient {
  const supabase = req.supabase;
  if (supabase === undefined) {
    throw new AuthError('Authenticated Supabase client is required for this operation.');
  }
  return supabase;
}

/**
 * Wrap an async handler so any rejection is forwarded to the centralized error
 * middleware via `next(err)`. Keeps each handler free of repetitive try/catch
 * boilerplate.
 */
function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Handlers — Listings (Requirements 1, 2, 3)
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/jobsearch/listings` — retrieve a paginated, filtered list of
 * job listings (Requirements 1, 2).
 */
export const getListings: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);

  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;

  const filters: IListingFilters = {};
  if (typeof req.query.workMode === 'string' && req.query.workMode.length > 0) {
    filters.workMode = req.query.workMode as WorkMode;
  }
  if (typeof req.query.location === 'string' && req.query.location.length > 0) {
    filters.location = req.query.location;
  }
  if (typeof req.query.keyword === 'string' && req.query.keyword.length > 0) {
    filters.keyword = req.query.keyword;
  }
  if (typeof req.query.company === 'string' && req.query.company.length > 0) {
    filters.company = req.query.company;
  }

  const pagination: IPaginationParams = { page, pageSize };
  const result: IPaginatedResult<IListing> = await getListingsSvc(supabase, filters, pagination);

  const envelope = successEnvelope(req, result.items);
  envelope.meta = {
    ...envelope.meta,
    ...result.meta,
  };

  res.status(200).json(envelope);
});

/**
 * `POST /api/v1/jobsearch/listings` — ingest a new listing with deduplication
 * (Requirement 3).
 */
export const ingestListing: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const input = req.body as IListingIngestInput;

  const result: IListing = await ingestListingSvc(supabase, input);
  res.status(201).json(successEnvelope(req, result));
});

// ---------------------------------------------------------------------------
// Handlers — Application Tracker (Requirements 4, 5, 9)
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/jobsearch/applications` — list all applications for the
 * authenticated user (Requirement 4).
 */
export const listApplications: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);

  const result: IApplication[] = await listApplicationsSvc(supabase, userId);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /api/v1/jobsearch/applications` — add a listing to the user's
 * application tracker (Requirement 4).
 */
export const addApplication: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const { listingId } = req.body as { listingId: string };

  const result: IApplication = await addApplicationSvc(supabase, userId, listingId);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `PATCH /api/v1/jobsearch/applications/:id/stage` — move an application to a
 * new stage (Requirement 4).
 */
export const updateStageHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;
  const { stage } = req.body as { stage: Stage };

  const result: IApplication = await updateStageSvc(supabase, userId, id, stage);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `GET /api/v1/jobsearch/applications/:id` — get full application detail
 * including listing and stage history (Requirement 5).
 */
export const getApplicationDetailHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  const result: IApplicationDetail = await getApplicationDetailSvc(supabase, userId, id);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `PATCH /api/v1/jobsearch/applications/:id/notes` — update the notes field on
 * an application (Requirement 5).
 */
export const updateNotesHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;
  const { notes } = req.body as { notes: string };

  const result: IApplication = await updateNotesSvc(supabase, userId, id, notes);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `DELETE /api/v1/jobsearch/applications/:id` — delete an application record
 * (Requirement 9).
 */
export const deleteApplicationHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  await deleteApplicationSvc(supabase, userId, id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Handlers — AI Writer (Requirements 6, 7, 8)
// ---------------------------------------------------------------------------

/**
 * `POST /api/v1/jobsearch/ai/cover-letter` — generate a cover letter for a job
 * application (Requirement 6).
 */
export const generateCoverLetterHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const { applicationId } = req.body as { applicationId: string };

  const result: string = await generateCoverLetterSvc(supabase, userId, applicationId);
  const response: IAiWriterResponse = { generatedText: result };
  res.status(200).json(successEnvelope(req, response));
});

/**
 * `POST /api/v1/jobsearch/ai/linkedin-outreach` — generate a LinkedIn outreach
 * message for a job application (Requirement 7).
 */
export const generateLinkedInOutreachHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const { applicationId, recipientName, recipientRole } = req.body as {
    applicationId: string;
    recipientName?: string;
    recipientRole?: string;
  };

  const result: string = await generateLinkedInOutreachSvc(
    supabase,
    userId,
    applicationId,
    recipientName,
    recipientRole
  );
  const response: IAiWriterResponse = { generatedText: result };
  res.status(200).json(successEnvelope(req, response));
});

/**
 * `POST /api/v1/jobsearch/ai/follow-up-email` — generate a follow-up email for
 * a job application (Requirement 8).
 */
export const generateFollowUpEmailHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const { applicationId } = req.body as { applicationId: string };

  const result: string = await generateFollowUpEmailSvc(supabase, userId, applicationId);
  const response: IAiWriterResponse = { generatedText: result };
  res.status(200).json(successEnvelope(req, response));
});
