/**
 * Resume module router.
 *
 * Wires the Resume API catalog to its controller handlers, threading the
 * middleware stack in a fixed order per route:
 *
 *   auth → validation (→ upload where needed) → controller handler
 *
 * Every route requires authentication (Requirement 11.2): {@link requireAuth}
 * runs first so unauthenticated requests never reach validation or business
 * logic. Validation (Requirement 11.4) runs next, rejecting malformed bodies
 * and params before the controller. The upload route additionally runs the
 * multipart parser ({@link uploadResumeFile}) instead of body validation, since
 * its payload is `multipart/form-data` rather than JSON.
 *
 * Mounted under `/api/v1/resume` by the app factory, so the final paths are
 * `/api/v1/resume/*`.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import express, { type Router } from 'express';

import {
  activateVersionHandler,
  cloneVersionHandler,
  generateBulletsHandler,
  listTemplatesHandler,
  listVersionsHandler,
  matchJobHandler,
  renameVersionHandler,
  saveVersionHandler,
  scanResumeHandler,
  suggestKeywordsHandler,
  uploadResume,
} from '../controllers/resume.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadResumeFile } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';

import {
  bulletsBodySchema,
  keywordSuggestionsBodySchema,
  matchBodySchema,
  renameVersionBodySchema,
  saveVersionBodySchema,
  scanBodySchema,
  versionIdParamsSchema,
} from './resume.schemas.js';

/**
 * Builds the Resume router. All routes are authenticated; bodies/params are
 * validated by per-route Zod schemas before the controller runs.
 */
export function createResumeRouter(): Router {
  const router: Router = express.Router();

  // POST /uploads — upload + parse (multipart). auth → upload → controller.
  router.post('/uploads', requireAuth, uploadResumeFile, uploadResume);

  // POST /scans — ATS scan (job description optional).
  router.post('/scans', requireAuth, validate({ body: scanBodySchema }), scanResumeHandler);

  // POST /keyword-suggestions — job description REQUIRED (Req 4.4).
  router.post(
    '/keyword-suggestions',
    requireAuth,
    validate({ body: keywordSuggestionsBodySchema }),
    suggestKeywordsHandler
  );

  // GET /templates — list ATS-parseable templates (Req 5.1).
  router.get('/templates', requireAuth, listTemplatesHandler);

  // POST /versions — persist a resume version.
  router.post(
    '/versions',
    requireAuth,
    validate({ body: saveVersionBodySchema }),
    saveVersionHandler
  );

  // GET /versions — list the caller's versions.
  router.get('/versions', requireAuth, listVersionsHandler);

  // POST /versions/:id/clone — clone an existing version.
  router.post(
    '/versions/:id/clone',
    requireAuth,
    validate({ params: versionIdParamsSchema }),
    cloneVersionHandler
  );

  // PATCH /versions/:id — rename; empty/whitespace name rejected (Req 9.2).
  router.patch(
    '/versions/:id',
    requireAuth,
    validate({ params: versionIdParamsSchema, body: renameVersionBodySchema }),
    renameVersionHandler
  );

  // POST /versions/:id/activate — set a version active.
  router.post(
    '/versions/:id/activate',
    requireAuth,
    validate({ params: versionIdParamsSchema }),
    activateVersionHandler
  );

  // POST /match — semantic match; job description REQUIRED (Req 6.3).
  router.post('/match', requireAuth, validate({ body: matchBodySchema }), matchJobHandler);

  // POST /bullets — X-Y-Z bullets; empty/whitespace experience rejected (Req 7.3).
  router.post('/bullets', requireAuth, validate({ body: bulletsBodySchema }), generateBulletsHandler);

  return router;
}
