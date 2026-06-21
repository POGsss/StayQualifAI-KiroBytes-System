/**
 * Job Search module router.
 *
 * Wires the Job Search API catalog to its controller handlers, threading the
 * middleware stack in a fixed order per route:
 *
 *   auth → validation → controller handler
 *
 * Every route requires authentication: {@link requireAuth} runs first so
 * unauthenticated requests never reach validation or business logic. Validation
 * runs next (where applicable), rejecting malformed bodies, params, and query
 * strings before the controller.
 *
 * Mounted under `/api/v1/jobsearch` by the app factory, so the final paths are
 * `/api/v1/jobsearch/*`.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import express, { type Router } from 'express';

import {
  getListings,
  ingestListing,
  listApplications,
  addApplication,
  updateStageHandler,
  getApplicationDetailHandler,
  updateNotesHandler,
  deleteApplicationHandler,
  generateCoverLetterHandler,
  generateLinkedInOutreachHandler,
  generateFollowUpEmailHandler,
} from '../controllers/jobsearch.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import {
  listingQuerySchema,
  listingIngestBodySchema,
  addApplicationBodySchema,
  applicationIdParamsSchema,
  stageUpdateBodySchema,
  notesUpdateBodySchema,
  coverLetterBodySchema,
  linkedInOutreachBodySchema,
  followUpEmailBodySchema,
} from './jobsearch.schemas.js';

/**
 * Builds the Job Search router. All routes are authenticated; bodies/params/query
 * are validated by per-route Zod schemas before the controller runs.
 */
export function createJobSearchRouter(): Router {
  const router: Router = express.Router();

  // -------------------------------------------------------------------------
  // Listings (Requirements 1, 2, 3)
  // -------------------------------------------------------------------------

  // GET /listings — paginated, filtered listing feed.
  router.get('/listings', requireAuth, validate({ query: listingQuerySchema }), getListings);

  // POST /listings — ingest a new listing with deduplication.
  router.post(
    '/listings',
    requireAuth,
    validate({ body: listingIngestBodySchema }),
    ingestListing
  );

  // -------------------------------------------------------------------------
  // Application Tracker (Requirements 4, 5, 9)
  // -------------------------------------------------------------------------

  // GET /applications — list the caller's tracked applications.
  router.get('/applications', requireAuth, listApplications);

  // POST /applications — add a listing to the tracker.
  router.post(
    '/applications',
    requireAuth,
    validate({ body: addApplicationBodySchema }),
    addApplication
  );

  // PATCH /applications/:id/stage — move an application to a new stage.
  router.patch(
    '/applications/:id/stage',
    requireAuth,
    validate({ params: applicationIdParamsSchema, body: stageUpdateBodySchema }),
    updateStageHandler
  );

  // GET /applications/:id — full application detail with listing and history.
  router.get(
    '/applications/:id',
    requireAuth,
    validate({ params: applicationIdParamsSchema }),
    getApplicationDetailHandler
  );

  // PATCH /applications/:id/notes — update application notes.
  router.patch(
    '/applications/:id/notes',
    requireAuth,
    validate({ params: applicationIdParamsSchema, body: notesUpdateBodySchema }),
    updateNotesHandler
  );

  // DELETE /applications/:id — remove an application from the tracker.
  router.delete(
    '/applications/:id',
    requireAuth,
    validate({ params: applicationIdParamsSchema }),
    deleteApplicationHandler
  );

  // -------------------------------------------------------------------------
  // AI Writer (Requirements 6, 7, 8)
  // -------------------------------------------------------------------------

  // POST /ai/cover-letter — generate a cover letter for an application.
  router.post(
    '/ai/cover-letter',
    requireAuth,
    validate({ body: coverLetterBodySchema }),
    generateCoverLetterHandler
  );

  // POST /ai/linkedin-outreach — generate a LinkedIn outreach message.
  router.post(
    '/ai/linkedin-outreach',
    requireAuth,
    validate({ body: linkedInOutreachBodySchema }),
    generateLinkedInOutreachHandler
  );

  // POST /ai/follow-up-email — generate a follow-up email.
  router.post(
    '/ai/follow-up-email',
    requireAuth,
    validate({ body: followUpEmailBodySchema }),
    generateFollowUpEmailHandler
  );

  return router;
}
