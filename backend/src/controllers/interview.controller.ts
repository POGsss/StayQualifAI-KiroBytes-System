/**
 * Interview controller (Requirements 13.1, 13.2, 13.3, 13.4).
 *
 * The orchestration layer between the route/middleware stack and the Interview
 * service facade. Each handler:
 *   - reads the already-validated `body`/`params` from the request (validation
 *     runs in middleware, before these handlers — Requirement 12.5),
 *   - narrows the auth-middleware-provided `req.user` / `req.supabase` (threading
 *     the RLS-scoped client and `userId` into facade calls),
 *   - invokes the facade, and
 *   - shapes the result into the standard `{ data, error, meta }` envelope
 *     (`IApiResponse`) with `data` populated and `error` null on success
 *     (Requirements 13.1, 13.2).
 *
 * Failures are never shaped here: every handler is wrapped so any thrown typed
 * error is forwarded via `next(err)` to the centralized error middleware, which
 * produces the failure envelope (`data: null` + typed `error`, `meta: null`)
 * and maps the HTTP status (Requirements 13.3, 13.4). Controllers hold NO
 * direct Supabase or Gemini access — they only pass `req.supabase` through to
 * the facade (Route → Controller → Service flow).
 *
 * Envelope `meta` nuance (Requirement 13.1): single-resource and action
 * responses set `meta` to `null`; list responses carry a `total` integer. The
 * shared `IApiMeta` type additionally requires a `requestId` + `timestamp` when
 * non-null, so list envelopes include those alongside `total` to satisfy the
 * type while guaranteeing `total` is present; single envelopes use `null`
 * exactly as Requirement 13.1 specifies. This intentionally DIFFERS from the
 * Resume controller, which always populates `meta` with `requestId`/`timestamp`.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

import {
  createSession,
  createStory,
  computeScorecard,
  deleteSession,
  deleteStory,
  evaluateAnswer,
  forceEndSession,
  getSession,
  getStory,
  listSessions,
  listStories,
  startSession,
  submitAnswer,
  updateStory,
} from '../services/interview.service.js';
import type {
  IAnswerEvaluation,
  IApiResponse,
  ICreateSessionInput,
  ICreateStarInput,
  IInterviewQuestion,
  IInterviewSession,
  IInterviewSessionDetail,
  IInterviewSessionSummary,
  IPerformanceScorecard,
  IStarStory,
  ISubmitAnswerInput,
  IUpdateStarInput,
} from '../types/interview.types.js';
import { AuthError, ValidationError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Envelope + narrowing helpers.
// ---------------------------------------------------------------------------

/**
 * Resolve the request id surfaced in a list response's `meta`. Honors an
 * upstream `x-request-id` header when present; otherwise generates a UUID.
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
 * Build a single-resource / action success envelope: `data` populated, `error`
 * null, and `meta` set to `null` (Requirements 13.1, 13.2).
 */
function singleEnvelope<T>(data: T): IApiResponse<T> {
  return {
    data,
    error: null,
    meta: null,
  };
}

/**
 * Build a list success envelope: `data` populated with the array, `error` null,
 * and `meta` carrying a `total` integer equal to the array length (Requirement
 * 13.1). `requestId` + `timestamp` are included to satisfy the shared
 * {@link IApiResponse} `meta` shape while guaranteeing `total` is present.
 */
function listEnvelope<T>(req: Request, data: T[]): IApiResponse<T[]> {
  return {
    data,
    error: null,
    meta: {
      requestId: resolveRequestId(req),
      timestamp: new Date().toISOString(),
      total: data.length,
    },
  };
}

/**
 * Narrow the authenticated user id from `req.user`. These handlers run after
 * the auth middleware, so the user is expected to be present; a missing user is
 * an unexpected misconfiguration surfaced as a typed {@link AuthError}.
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
    throw new AuthError(
      'Authenticated Supabase client is required for this operation.'
    );
  }
  return supabase;
}

/** Narrow a required string route param, throwing {@link ValidationError} if absent. */
function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Missing required route parameter "${name}".`);
  }
  return value;
}

/**
 * Wrap an async handler so any rejection is forwarded to the centralized error
 * middleware via `next(err)` (Requirements 13.3, 13.4). Keeps each handler free
 * of repetitive try/catch boilerplate.
 */
function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Session handlers
// ---------------------------------------------------------------------------

/**
 * `POST /sessions` — create a new interview session in `PENDING` state
 * (Requirements 1.1–1.9). Returns 201 Created for the newly persisted session
 * (single-resource envelope).
 */
export const createSessionHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const input = req.body as ICreateSessionInput;

    const result: IInterviewSession = await createSession(
      supabase,
      userId,
      input
    );
    res.status(201).json(singleEnvelope(result));
  }
);

/**
 * `POST /sessions/:id/start` — generate and persist the session's questions and
 * transition it to `ACTIVE` (Requirements 2.2, 2.5). Returns the ordered
 * questions array as a list envelope (`meta.total` set).
 */
export const startSessionHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    const result: IInterviewQuestion[] = await startSession(
      supabase,
      userId,
      sessionId
    );
    res.status(200).json(listEnvelope(req, result));
  }
);

/**
 * `GET /sessions` — list the caller's sessions newest-first (Requirement 6.1).
 * Returns a list envelope (`meta.total` set).
 */
export const listSessionsHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);

    const result: IInterviewSessionSummary[] = await listSessions(
      supabase,
      userId
    );
    res.status(200).json(listEnvelope(req, result));
  }
);

/**
 * `GET /sessions/:id` — retrieve a full session detail (config + questions +
 * scorecard) (Requirements 6.2, 6.3). Single-resource envelope.
 */
export const getSessionHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    const result: IInterviewSessionDetail = await getSession(
      supabase,
      userId,
      sessionId
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `POST /sessions/:id/questions/:qid/answers` — submit a candidate answer to a
 * question, transitioning the session to `COMPLETED` when the last answer lands
 * (Requirements 3.1–3.7). Single-resource envelope.
 */
export const submitAnswerHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');
    const questionId = requireParam(req, 'qid');
    const input = req.body as ISubmitAnswerInput;

    const result: IInterviewQuestion = await submitAnswer(
      supabase,
      userId,
      sessionId,
      questionId,
      input
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `POST /sessions/:id/questions/:qid/evaluation` — evaluate one answered
 * question (Requirements 4.1–4.6). Single-resource envelope.
 */
export const evaluateAnswerHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');
    const questionId = requireParam(req, 'qid');

    const result: IAnswerEvaluation = await evaluateAnswer(
      supabase,
      userId,
      sessionId,
      questionId
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `POST /sessions/:id/scorecard` — compute and persist the performance
 * scorecard, transitioning the session to `SCORED` (Requirements 5.1–5.13).
 * Single-resource envelope.
 */
export const computeScorecardHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    const result: IPerformanceScorecard = await computeScorecard(
      supabase,
      userId,
      sessionId
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `GET /sessions/:id/scorecard` — retrieve the existing scorecard (Requirement
 * 5.11). Single-resource envelope.
 *
 * The facade exposes no standalone `getScorecard`; per the design's endpoint
 * catalog the compute (`POST`) and retrieve (`GET`) paths are distinguished by
 * HTTP method, and `computeScorecard` returns the cached scorecard for an
 * already-`SCORED` session WITHOUT recomputation (Requirement 5.11). This
 * handler therefore delegates to `computeScorecard`. Tradeoff: for a
 * `COMPLETED` (not yet `SCORED`) session a GET computes-then-returns rather
 * than returning nothing, yielding retrieve-or-compute semantics; for the
 * `SCORED` case — the case Requirement 5.11 governs — it is a pure cached read.
 */
export const getScorecardHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    const result: IPerformanceScorecard = await computeScorecard(
      supabase,
      userId,
      sessionId
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `POST /sessions/:id/end` — force-end an active session. All unanswered
 * questions are filled with "I don't know" and the session transitions to
 * `COMPLETED`. Returns the full session detail (single-resource envelope).
 */
export const forceEndSessionHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    const result: IInterviewSessionDetail = await forceEndSession(
      supabase,
      userId,
      sessionId
    );
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `DELETE /sessions/:id` — delete an interview session owned by the caller.
 * The questions and scorecard rows are removed by the database's
 * `ON DELETE CASCADE` foreign keys. Returns a single-resource envelope with
 * `data: null`, `error: null`, `meta: null`.
 */
export const deleteSessionHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const sessionId = requireParam(req, 'id');

    await deleteSession(supabase, userId, sessionId);
    res.status(200).json(singleEnvelope<null>(null));
  }
);

// ---------------------------------------------------------------------------
// STAR story handlers
// ---------------------------------------------------------------------------

/**
 * `POST /stories` — create a STAR story (Requirements 7.1–7.5). Returns 201
 * Created (single-resource envelope).
 */
export const createStoryHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const input = req.body as ICreateStarInput;

    const result: IStarStory = await createStory(supabase, userId, input);
    res.status(201).json(singleEnvelope(result));
  }
);

/**
 * `GET /stories` — list the caller's STAR stories newest-first (Requirement
 * 8.1). Returns a list envelope (`meta.total` set).
 */
export const listStoriesHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);

    const result: IStarStory[] = await listStories(supabase, userId);
    res.status(200).json(listEnvelope(req, result));
  }
);

/**
 * `GET /stories/:id` — fetch a single STAR story (Requirements 8.2, 8.3).
 * Single-resource envelope.
 */
export const getStoryHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const id = requireParam(req, 'id');

    const result: IStarStory = await getStory(supabase, userId, id);
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `PATCH /stories/:id` — update a STAR story, mutating only supplied fields
 * (Requirements 9.1–9.6). Single-resource envelope.
 */
export const updateStoryHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const id = requireParam(req, 'id');
    const input = req.body as IUpdateStarInput;

    const result: IStarStory = await updateStory(supabase, userId, id, input);
    res.status(200).json(singleEnvelope(result));
  }
);

/**
 * `DELETE /stories/:id` — delete a STAR story (Requirements 10.1–10.3). Returns
 * a single-resource envelope with `data: null`, `error: null`, `meta: null`
 * (Requirement 10.1).
 */
export const deleteStoryHandler: RequestHandler = asyncHandler(
  async (req, res) => {
    const supabase = requireSupabase(req);
    const userId = requireUserId(req);
    const id = requireParam(req, 'id');

    await deleteStory(supabase, userId, id);
    res.status(200).json(singleEnvelope<null>(null));
  }
);
