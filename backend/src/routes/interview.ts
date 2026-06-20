/**
 * Interview module router.
 *
 * Wires the Interview API catalog to its controller handlers, threading the
 * middleware stack in a fixed order per route:
 *
 *   auth → validation → controller handler
 *
 * Every route requires authentication (Requirement 12.3): {@link requireAuth}
 * runs first so unauthenticated requests never reach validation or business
 * logic. Validation (Requirements 12.5, 12.6) runs next, rejecting malformed
 * bodies/params before the controller — each invalid field is surfaced with a
 * message identifying the field, the valid values, or the permitted range.
 * Routes without a JSON body or path params (e.g. list/get/start/evaluation/
 * scorecard/delete) attach only auth (+ param validation where path params
 * exist).
 *
 * Mounted under `/api/v1/interview` by the app factory, so the final paths are
 * `/api/v1/interview/*`.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import express, { type Router } from 'express';

import {
  computeScorecardHandler,
  createSessionHandler,
  createStoryHandler,
  deleteStoryHandler,
  evaluateAnswerHandler,
  getScorecardHandler,
  getSessionHandler,
  getStoryHandler,
  listSessionsHandler,
  listStoriesHandler,
  startSessionHandler,
  submitAnswerHandler,
  updateStoryHandler,
} from '../controllers/interview.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import {
  createSessionBodySchema,
  createStarSchema,
  sessionIdParamsSchema,
  sessionQuestionParamsSchema,
  storyIdParamsSchema,
  submitAnswerBodySchema,
  updateStarSchema,
} from './interview.schemas.js';

/**
 * Builds the Interview router. All routes are authenticated; bodies/params are
 * validated by per-route Zod schemas before the controller runs.
 */
export function createInterviewRouter(): Router {
  const router: Router = express.Router();

  // --- Sessions -----------------------------------------------------------

  // POST /sessions — create a PENDING session (session-create constraints).
  router.post(
    '/sessions',
    requireAuth,
    validate({ body: createSessionBodySchema }),
    createSessionHandler
  );

  // GET /sessions — list the caller's sessions newest-first.
  router.get('/sessions', requireAuth, listSessionsHandler);

  // POST /sessions/:id/start — generate questions and transition to ACTIVE.
  router.post(
    '/sessions/:id/start',
    requireAuth,
    validate({ params: sessionIdParamsSchema }),
    startSessionHandler
  );

  // GET /sessions/:id — full session detail.
  router.get(
    '/sessions/:id',
    requireAuth,
    validate({ params: sessionIdParamsSchema }),
    getSessionHandler
  );

  // POST /sessions/:id/questions/:qid/answers — submit a candidate answer.
  router.post(
    '/sessions/:id/questions/:qid/answers',
    requireAuth,
    validate({ params: sessionQuestionParamsSchema, body: submitAnswerBodySchema }),
    submitAnswerHandler
  );

  // POST /sessions/:id/questions/:qid/evaluation — evaluate one answer.
  router.post(
    '/sessions/:id/questions/:qid/evaluation',
    requireAuth,
    validate({ params: sessionQuestionParamsSchema }),
    evaluateAnswerHandler
  );

  // POST /sessions/:id/scorecard — compute and persist the scorecard.
  router.post(
    '/sessions/:id/scorecard',
    requireAuth,
    validate({ params: sessionIdParamsSchema }),
    computeScorecardHandler
  );

  // GET /sessions/:id/scorecard — retrieve the existing scorecard.
  router.get(
    '/sessions/:id/scorecard',
    requireAuth,
    validate({ params: sessionIdParamsSchema }),
    getScorecardHandler
  );

  // --- STAR stories -------------------------------------------------------

  // POST /stories — create a STAR story (createStarSchema: Req 7.2).
  router.post(
    '/stories',
    requireAuth,
    validate({ body: createStarSchema }),
    createStoryHandler
  );

  // GET /stories — list the caller's STAR stories newest-first.
  router.get('/stories', requireAuth, listStoriesHandler);

  // GET /stories/:id — fetch a single STAR story.
  router.get(
    '/stories/:id',
    requireAuth,
    validate({ params: storyIdParamsSchema }),
    getStoryHandler
  );

  // PATCH /stories/:id — update supplied fields (updateStarSchema: Req 9.6).
  router.patch(
    '/stories/:id',
    requireAuth,
    validate({ params: storyIdParamsSchema, body: updateStarSchema }),
    updateStoryHandler
  );

  // DELETE /stories/:id — delete a STAR story.
  router.delete(
    '/stories/:id',
    requireAuth,
    validate({ params: storyIdParamsSchema }),
    deleteStoryHandler
  );

  return router;
}
