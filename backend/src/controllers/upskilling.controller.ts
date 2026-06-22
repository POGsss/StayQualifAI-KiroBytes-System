/**
 * Upskilling controller (Career Roadmap & Learning Engine — Requirements 1–8).
 *
 * The orchestration layer between the route/middleware stack and the Upskilling
 * service facade (`../services/upskilling.service.js`). Each handler:
 *   - reads the already-validated `body`/`params`/`query` from the request
 *     (validation runs in middleware, before these handlers),
 *   - narrows the auth-middleware-provided `req.user` / `req.supabase` (threading
 *     the RLS-scoped client and `userId` into facade calls that touch the DB),
 *   - invokes the facade, and
 *   - shapes the result into the standard `{ data, error, meta }` envelope
 *     (`IApiResponse`) with `data` populated and `error` null on success.
 *
 * Envelope rules (per the module design / platform conventions):
 *   - List responses (GET projects / roadmaps / courses search + saved) set
 *     `meta.total` to the returned array length.
 *   - Single-resource, generate, and update responses populate `data` with the
 *     standard `requestId`/`timestamp` meta.
 *   - Action (DELETE) responses return literally `{ data: null, error: null,
 *     meta: null }`.
 *
 * Failures are never shaped here: every handler is wrapped so any thrown typed
 * error is forwarded via `next(err)` to the centralized error middleware, which
 * produces the failure envelope and maps the HTTP status. Controllers hold NO
 * direct Supabase or Gemini access — they only pass `req.supabase` through to
 * the facade (Route → Controller → Service flow).
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

import type { IApiResponse } from '../types/resume.types.js';
import type {
  CostClassification,
  ICourseRecommendation,
  IGenerateProjectsInput,
  IGenerateRoadmapInput,
  IMilestone,
  IProjectSuggestion,
  IRoadmap,
  IRoadmapDetail,
  IRoadmapDraft,
  IRoadmapSummary,
  ISavedCourse,
  ISearchCoursesInput,
} from '../types/upskilling.types.js';
import { AuthError } from '../utils/errors.js';
import {
  generateProjects as generateProjectsSvc,
  saveProject as saveProjectSvc,
  listProjects as listProjectsSvc,
  deleteProject as deleteProjectSvc,
  generateRoadmap as generateRoadmapSvc,
  saveRoadmap as saveRoadmapSvc,
  listRoadmaps as listRoadmapsSvc,
  getRoadmap as getRoadmapSvc,
  setMilestoneCompletion as setMilestoneCompletionSvc,
  deleteRoadmap as deleteRoadmapSvc,
  searchCourses as searchCoursesSvc,
  saveCourse as saveCourseSvc,
  listSavedCourses as listSavedCoursesSvc,
  deleteSavedCourse as deleteSavedCourseSvc,
  type ISaveProjectInput,
  type ISaveCourseInput,
} from '../services/upskilling.service.js';

// ---------------------------------------------------------------------------
// Envelope + narrowing helpers.
// ---------------------------------------------------------------------------

/** The literal action-response envelope returned by successful DELETEs. */
interface IActionResponse {
  data: null;
  error: null;
  meta: null;
}

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
 * Build a list success envelope: the array becomes `data` and `meta.total` is
 * set to the array length (platform rule "list responses set meta.total").
 */
function listEnvelope<T>(req: Request, items: T[]): IApiResponse<T[]> {
  const envelope = successEnvelope(req, items);
  envelope.meta = {
    ...envelope.meta,
    total: items.length,
  };
  return envelope;
}

/**
 * Build the action-response envelope returned by successful DELETEs:
 * `{ data: null, error: null, meta: null }`.
 */
function actionEnvelope(): IActionResponse {
  return { data: null, error: null, meta: null };
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
// Handlers — Role-Based Project Generator (Requirements 1, 2)
// ---------------------------------------------------------------------------

/**
 * `POST /api/v1/upskilling/projects/generate` — generate 3–5 role-based project
 * suggestions (Requirements 1.1–1.6).
 */
export const generateProjectsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const input = req.body as IGenerateProjectsInput;

  const result: IProjectSuggestion[] = await generateProjectsSvc(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /api/v1/upskilling/projects` — persist a project suggestion for the
 * authenticated user (Requirements 2.1, 2.6, 2.7).
 */
export const saveProjectHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const input = req.body as ISaveProjectInput;

  const result: IProjectSuggestion = await saveProjectSvc(supabase, userId, input);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `GET /api/v1/upskilling/projects` — list the user's saved project suggestions
 * (Requirements 2.2, 2.3).
 */
export const listProjectsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);

  const result: IProjectSuggestion[] = await listProjectsSvc(supabase, userId);
  res.status(200).json(listEnvelope(req, result));
});

/**
 * `DELETE /api/v1/upskilling/projects/:id` — delete an owned project suggestion
 * (Requirements 2.4, 2.5).
 */
export const deleteProjectHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  await deleteProjectSvc(supabase, userId, id);
  res.status(200).json(actionEnvelope());
});

// ---------------------------------------------------------------------------
// Handlers — Career Goal Roadmap (Requirements 3, 4)
// ---------------------------------------------------------------------------

/**
 * `POST /api/v1/upskilling/roadmaps/generate` — generate a career roadmap draft
 * with 3–12 milestones (Requirements 3.1–3.6).
 */
export const generateRoadmapHandler: RequestHandler = asyncHandler(async (req, res) => {
  const input = req.body as IGenerateRoadmapInput;

  const result: IRoadmapDraft = await generateRoadmapSvc(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /api/v1/upskilling/roadmaps` — persist a roadmap draft and its
 * milestones for the authenticated user (Requirements 4.1, 4.2).
 */
export const saveRoadmapHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const draft = req.body as IRoadmapDraft;

  const result: IRoadmap = await saveRoadmapSvc(supabase, userId, draft);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `GET /api/v1/upskilling/roadmaps` — list the user's roadmaps with progress
 * counts (Requirement 4.3).
 */
export const listRoadmapsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);

  const result: IRoadmapSummary[] = await listRoadmapsSvc(supabase, userId);
  res.status(200).json(listEnvelope(req, result));
});

/**
 * `GET /api/v1/upskilling/roadmaps/:id` — get a roadmap's full detail including
 * milestones and completed/total counts (Requirements 4.7, 4.8).
 */
export const getRoadmapHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  const result: IRoadmapDetail = await getRoadmapSvc(supabase, userId, id);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `PATCH /api/v1/upskilling/roadmaps/:roadmapId/milestones/:milestoneId` —
 * set a milestone's completion state (Requirements 4.4, 4.5, 4.6, 4.8).
 */
export const updateMilestoneHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const roadmapId = req.params.roadmapId as string;
  const milestoneId = req.params.milestoneId as string;
  const { completed } = req.body as { completed: boolean };

  const result: IMilestone = await setMilestoneCompletionSvc(
    supabase,
    userId,
    roadmapId,
    milestoneId,
    completed
  );
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `DELETE /api/v1/upskilling/roadmaps/:id` — delete an owned roadmap, cascading
 * to its milestones (Requirements 4.8, 4.9).
 */
export const deleteRoadmapHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  await deleteRoadmapSvc(supabase, userId, id);
  res.status(200).json(actionEnvelope());
});

// ---------------------------------------------------------------------------
// Handlers — Course & Certificate Finder (Requirements 5, 6)
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/upskilling/courses/search` — search aggregated course/certificate
 * recommendations with an optional cost filter (Requirements 5.1–5.9).
 */
export const searchCoursesHandler: RequestHandler = asyncHandler(async (req, res) => {
  const input: ISearchCoursesInput = { query: req.query.query as string };
  if (typeof req.query.cost === 'string' && req.query.cost.length > 0) {
    input.cost = req.query.cost as CostClassification;
  }

  const result: ICourseRecommendation[] = await searchCoursesSvc(input);
  res.status(200).json(listEnvelope(req, result));
});

/**
 * `POST /api/v1/upskilling/courses/saved` — bookmark a course recommendation for
 * the authenticated user (Requirements 6.1, 6.2, 6.4).
 */
export const saveCourseHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const input = req.body as ISaveCourseInput;

  const result: ISavedCourse = await saveCourseSvc(supabase, userId, input);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `GET /api/v1/upskilling/courses/saved` — list the user's saved courses
 * (Requirement 6.3).
 */
export const listSavedCoursesHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);

  const result: ISavedCourse[] = await listSavedCoursesSvc(supabase, userId);
  res.status(200).json(listEnvelope(req, result));
});

/**
 * `DELETE /api/v1/upskilling/courses/saved/:id` — delete an owned saved course
 * (Requirements 6.5, 6.6).
 */
export const deleteSavedCourseHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = req.params.id as string;

  await deleteSavedCourseSvc(supabase, userId, id);
  res.status(200).json(actionEnvelope());
});
