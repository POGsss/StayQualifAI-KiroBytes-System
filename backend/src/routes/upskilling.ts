/**
 * Upskilling module router (Career Roadmap & Learning Engine).
 *
 * Wires the Upskilling API catalog to its controller handlers, threading the
 * middleware stack in a fixed order per route:
 *
 *   auth → validation → controller handler
 *
 * Every route requires authentication: {@link requireAuth} runs first so
 * unauthenticated requests never reach validation or business logic. Validation
 * runs next (where applicable), rejecting malformed bodies, params, and query
 * strings before the controller.
 *
 * Route ordering note: static/specific path segments are registered before
 * param segments so they are matched first. In particular `/projects/generate`
 * is registered before the `/projects/:id` delete, and `/roadmaps/generate`
 * before `/roadmaps/:id`, so the literal `generate` segment is never captured
 * by a `:id`/`:roadmapId` param route.
 *
 * Mounted under `/api/v1/upskilling` by the app factory, so the final paths are
 * `/api/v1/upskilling/*`.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import express, { type Router } from 'express';

import {
  generateProjectsHandler,
  saveProjectHandler,
  listProjectsHandler,
  deleteProjectHandler,
  generateRoadmapHandler,
  saveRoadmapHandler,
  listRoadmapsHandler,
  getRoadmapHandler,
  updateMilestoneHandler,
  deleteRoadmapHandler,
  searchCoursesHandler,
  saveCourseHandler,
  listSavedCoursesHandler,
  deleteSavedCourseHandler,
} from '../controllers/upskilling.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import {
  generateProjectsBodySchema,
  saveProjectBodySchema,
  idParamsSchema,
  generateRoadmapBodySchema,
  saveRoadmapBodySchema,
  milestoneParamsSchema,
  updateMilestoneBodySchema,
  searchCoursesQuerySchema,
  saveCourseBodySchema,
} from './upskilling.schemas.js';

/**
 * Builds the Upskilling router. All routes are authenticated; bodies/params/query
 * are validated by per-route Zod schemas before the controller runs.
 */
export function createUpskillingRouter(): Router {
  const router: Router = express.Router();

  // -------------------------------------------------------------------------
  // Projects — Role-Based Project Generator (Requirements 1, 2)
  // -------------------------------------------------------------------------

  // POST /projects/generate — generate role-based project suggestions.
  // Registered before `/projects/:id` so `generate` is never captured as `:id`.
  router.post(
    '/projects/generate',
    requireAuth,
    validate({ body: generateProjectsBodySchema }),
    generateProjectsHandler
  );

  // POST /projects — save a generated project suggestion.
  router.post(
    '/projects',
    requireAuth,
    validate({ body: saveProjectBodySchema }),
    saveProjectHandler
  );

  // GET /projects — list the caller's saved projects.
  router.get('/projects', requireAuth, listProjectsHandler);

  // DELETE /projects/:id — remove a saved project.
  router.delete(
    '/projects/:id',
    requireAuth,
    validate({ params: idParamsSchema }),
    deleteProjectHandler
  );

  // -------------------------------------------------------------------------
  // Roadmaps — Career Goal Roadmap (Requirements 3, 4)
  // -------------------------------------------------------------------------

  // POST /roadmaps/generate — generate a career roadmap.
  // Registered before `/roadmaps/:id` so `generate` is never captured as `:id`.
  router.post(
    '/roadmaps/generate',
    requireAuth,
    validate({ body: generateRoadmapBodySchema }),
    generateRoadmapHandler
  );

  // POST /roadmaps — save a generated roadmap draft.
  router.post(
    '/roadmaps',
    requireAuth,
    validate({ body: saveRoadmapBodySchema }),
    saveRoadmapHandler
  );

  // GET /roadmaps — list the caller's saved roadmaps.
  router.get('/roadmaps', requireAuth, listRoadmapsHandler);

  // GET /roadmaps/:id — full roadmap detail with milestones.
  router.get(
    '/roadmaps/:id',
    requireAuth,
    validate({ params: idParamsSchema }),
    getRoadmapHandler
  );

  // PATCH /roadmaps/:roadmapId/milestones/:milestoneId — toggle milestone completion.
  router.patch(
    '/roadmaps/:roadmapId/milestones/:milestoneId',
    requireAuth,
    validate({ params: milestoneParamsSchema, body: updateMilestoneBodySchema }),
    updateMilestoneHandler
  );

  // DELETE /roadmaps/:id — remove a saved roadmap and its milestones.
  router.delete(
    '/roadmaps/:id',
    requireAuth,
    validate({ params: idParamsSchema }),
    deleteRoadmapHandler
  );

  // -------------------------------------------------------------------------
  // Courses — Course & Certificate Finder (Requirements 5, 6)
  // -------------------------------------------------------------------------

  // GET /courses/search — search for course recommendations.
  // Static segment registered before `/courses/saved/:id` param routes.
  router.get(
    '/courses/search',
    requireAuth,
    validate({ query: searchCoursesQuerySchema }),
    searchCoursesHandler
  );

  // POST /courses/saved — save a course bookmark.
  router.post(
    '/courses/saved',
    requireAuth,
    validate({ body: saveCourseBodySchema }),
    saveCourseHandler
  );

  // GET /courses/saved — list the caller's saved courses.
  router.get('/courses/saved', requireAuth, listSavedCoursesHandler);

  // DELETE /courses/saved/:id — remove a saved course.
  router.delete(
    '/courses/saved/:id',
    requireAuth,
    validate({ params: idParamsSchema }),
    deleteSavedCourseHandler
  );

  return router;
}
