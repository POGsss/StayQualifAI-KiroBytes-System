/**
 * Resume controller (Requirements 1.5, 3.4, 6.2, 12.1, 12.2, 12.3).
 *
 * The orchestration layer between the route/middleware stack and the Resume
 * service facade. Each handler:
 *   - reads the already-validated `body`/`params` from the request (validation
 *     runs in middleware, before these handlers — Requirement 11.4),
 *   - narrows the auth-middleware-provided `req.user` / `req.supabase` (threading
 *     the RLS-scoped client and `userId` into facade calls that touch the DB),
 *   - invokes the facade, and
 *   - shapes the result into the standard `{ data, error, meta }` envelope
 *     (`IApiResponse`) with `data` populated and `error` null on success
 *     (Requirements 12.1, 12.2).
 *
 * Failures are never shaped here: every handler is wrapped so any thrown typed
 * error is forwarded via `next(err)` to the centralized error middleware, which
 * produces the failure envelope (`data: null` + typed `error`) and maps the
 * HTTP status (Requirements 12.1, 12.3). Controllers hold NO direct Supabase or
 * Gemini access — they only pass `req.supabase` through to the facade
 * (Route → Controller → Service flow).
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

import type {
  IApiResponse,
  IAtsScanResult,
  IKeywordSuggestion,
  IMatchResult,
  IResumeTemplate,
  IResumeVersion,
  IStructuredResume,
  XyzBullet,
} from '../types/resume.types.js';
import { AuthError, ValidationError } from '../utils/errors.js';
import {
  cloneVersion,
  deleteVersion,
  generateBullets,
  listTemplates,
  listVersions,
  matchJob,
  parseUpload,
  renameVersion,
  saveVersion,
  scanResume,
  setActiveVersion,
  suggestKeywords,
  type IBulletInput,
  type IKeywordInput,
  type IMatchInput,
  type IScanInput,
  type SaveVersionInput,
} from '../services/resume.service.js';

// ---------------------------------------------------------------------------
// Request body shapes (validated upstream by the route validation middleware).
// ---------------------------------------------------------------------------

/** Body for `POST /scans`. */
interface IScanRequestBody {
  content: IStructuredResume;
  jobDescription?: string;
}

/** Body for `POST /keyword-suggestions`. */
interface IKeywordRequestBody {
  content: IStructuredResume;
  jobDescription: string;
}

/** Body for `POST /versions`. */
interface ISaveVersionRequestBody {
  name: string;
  content: IStructuredResume;
  sourceVersionId?: string;
}

/** Body for `PATCH /versions/:id`. */
interface IRenameRequestBody {
  name: string;
}

/** Body for `POST /match`. */
interface IMatchRequestBody {
  content: IStructuredResume;
  jobDescription: string;
}

/** Body for `POST /bullets`. */
interface IBulletsRequestBody {
  experience: string;
}

// ---------------------------------------------------------------------------
// Envelope + narrowing helpers.
// ---------------------------------------------------------------------------

/**
 * Resolve the request id surfaced in `meta` (Requirement 12.2). Honors an
 * upstream `x-request-id` header when present; otherwise generates a UUID.
 * Mirrors the convention used by the centralized error middleware so success
 * and failure envelopes share the same `meta` shape.
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
 * a `requestId` and ISO `timestamp` (Requirements 12.1, 12.2).
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
    throw new AuthError('Authenticated Supabase client is required for this operation.');
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
 * middleware via `next(err)` (Requirements 12.1, 12.3). Keeps each handler free
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
// Handlers — one per endpoint in the API catalog.
// ---------------------------------------------------------------------------

/**
 * `POST /uploads` — parse an uploaded `.pdf`/`.docx` file into an
 * `IStructuredResume` (Requirements 1.1–1.5). The upload middleware exposes the
 * parsed file as `req.file`; its absence is a malformed request
 * ({@link ValidationError}).
 */
export const uploadResume: RequestHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (file === undefined) {
    throw new ValidationError('A resume file is required under the "file" field.');
  }

  const result: IStructuredResume = await parseUpload({
    buffer: file.buffer,
    filename: file.originalname,
  });

  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /scans` — compute an ATS compatibility score for a resume, optionally
 * relative to a job description (Requirements 3.1–3.5, 3.4).
 */
export const scanResumeHandler: RequestHandler = asyncHandler(async (req, res) => {
  const body = req.body as IScanRequestBody;
  const input: IScanInput =
    body.jobDescription !== undefined
      ? { content: body.content, jobDescription: body.jobDescription }
      : { content: body.content };

  const result: IAtsScanResult = scanResume(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /keyword-suggestions` — suggest job-description keywords missing from
 * the resume (Requirements 4.1–4.4).
 */
export const suggestKeywordsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const body = req.body as IKeywordRequestBody;
  const input: IKeywordInput = {
    content: body.content,
    jobDescription: body.jobDescription,
  };

  const result: IKeywordSuggestion[] = suggestKeywords(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `GET /templates` — list the active ATS-parseable templates (Requirement 5.1).
 */
export const listTemplatesHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);

  const result: IResumeTemplate[] = await listTemplates(supabase);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /versions` — persist a built/edited resume version (Requirements
 * 5.2–5.4). Returns 201 Created for the newly persisted version.
 */
export const saveVersionHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const body = req.body as ISaveVersionRequestBody;

  const version: SaveVersionInput =
    body.sourceVersionId !== undefined
      ? { name: body.name, content: body.content, sourceVersionId: body.sourceVersionId }
      : { name: body.name, content: body.content };

  const result: IResumeVersion = await saveVersion(supabase, userId, version);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `GET /versions` — list the caller's resume versions (Requirement 10.1).
 */
export const listVersionsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);

  const result: IResumeVersion[] = await listVersions(supabase, userId);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /versions/:id/clone` — clone an existing version (Requirements 8.1–8.3).
 * Returns 201 Created for the newly created clone.
 */
export const cloneVersionHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const sourceId = requireParam(req, 'id');

  const result: IResumeVersion = await cloneVersion(supabase, userId, sourceId);
  res.status(201).json(successEnvelope(req, result));
});

/**
 * `PATCH /versions/:id` — rename a version, preserving its content
 * (Requirements 9.1–9.3).
 */
export const renameVersionHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = requireParam(req, 'id');
  const body = req.body as IRenameRequestBody;

  const result: IResumeVersion = await renameVersion(supabase, userId, id, body.name);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /versions/:id/activate` — set a version active, enforcing the
 * single-active invariant (Requirements 10.2–10.4).
 */
export const activateVersionHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = requireParam(req, 'id');

  const result: IResumeVersion = await setActiveVersion(supabase, userId, id);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /match` — compute a semantic match score plus matched/missing concepts
 * for a resume against a job description (Requirements 6.1–6.4, 6.2).
 */
export const matchJobHandler: RequestHandler = asyncHandler(async (req, res) => {
  const body = req.body as IMatchRequestBody;
  const input: IMatchInput = {
    content: body.content,
    jobDescription: body.jobDescription,
  };

  const result: IMatchResult = await matchJob(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `POST /bullets` — rewrite an experience description into X-Y-Z achievement
 * bullets (Requirements 7.1–7.4).
 */
export const generateBulletsHandler: RequestHandler = asyncHandler(async (req, res) => {
  const body = req.body as IBulletsRequestBody;
  const input: IBulletInput = { experience: body.experience };

  const result: XyzBullet[] = await generateBullets(input);
  res.status(200).json(successEnvelope(req, result));
});

/**
 * `DELETE /versions/:id` — delete a resume version owned by the caller.
 */
export const deleteVersionHandler: RequestHandler = asyncHandler(async (req, res) => {
  const supabase = requireSupabase(req);
  const userId = requireUserId(req);
  const id = requireParam(req, 'id');

  const result: IResumeVersion = await deleteVersion(supabase, userId, id);
  res.status(200).json(successEnvelope(req, result));
});
