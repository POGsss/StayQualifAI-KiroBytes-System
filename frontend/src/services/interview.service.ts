/**
 * Interview module HTTP service.
 *
 * Single data-access layer for the React frontend. Every call targets the
 * backend Express API under `/api/v1/interview/*` (the Vite dev proxy forwards
 * `/api` to the backend). This file is the ONLY place the `{ data, error, meta }`
 * envelope is unwrapped: on success it returns the `data` payload, and on
 * failure it throws a typed `InterviewApiError` carrying the backend `IApiError`.
 *
 * Steering rule: the frontend talks only to the backend API — this module MUST
 * NOT import the Supabase client.
 *
 * Discriminator discrepancy (documented): the mirrored frontend `IApiError`
 * declares a `code` field, but the backend actually emits a `type` field on
 * error envelopes. To be robust regardless of which field is present, the
 * `InterviewApiError` reads the discriminator defensively from
 * `error.code ?? error.type` (the latter is read via a defensive cast since it
 * is not declared on the mirrored interface).
 *
 * Named exports only. No `any`.
 */

import type {
  IAnswerEvaluation,
  IApiError,
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
} from '../types/interview.types';

/** Base path for every interview endpoint. The Vite dev proxy forwards `/api`. */
const BASE_PATH = '/api/v1/interview';

/**
 * Read the error discriminator defensively. The mirrored `IApiError` declares
 * `code`, but the backend currently emits `type` (a known platform
 * discrepancy). Prefer `code` when present, otherwise fall back to `type`.
 */
function readErrorCode(error: IApiError): string {
  const withType = error as IApiError & { type?: string };
  return error.code ?? withType.type ?? 'unknown_error';
}

/**
 * Typed client error thrown when a request fails. Carries the backend
 * `IApiError` fields plus the HTTP status code so callers (store/components)
 * can branch on `code` or `status` without reparsing the envelope.
 */
export class InterviewApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(error: IApiError, status: number) {
    super(error.message);
    this.name = 'InterviewApiError';
    this.code = readErrorCode(error);
    this.status = status;
    if (error.details !== undefined) {
      this.details = error.details;
    }
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, InterviewApiError.prototype);
  }
}

/**
 * Module-level auth token. The auth session sets this via `setAuthToken`;
 * every request includes it as an `Authorization: Bearer` header when present.
 */
let authToken: string | null = null;

/** Set (or clear) the bearer token used for subsequent API calls. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Build request headers, optionally including JSON content type and auth. */
function buildHeaders(json: boolean): Headers {
  const headers = new Headers();
  if (json) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken !== null) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  return headers;
}

/** Parse a response body into the API envelope, tolerating empty/non-JSON bodies. */
async function parseEnvelope<T>(response: Response): Promise<IApiResponse<T> | null> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as IApiResponse<T>;
  } catch {
    return null;
  }
}

/**
 * Determine whether a parsed envelope (or non-ok status) represents a failure,
 * and throw a typed `InterviewApiError` if so. Shared by `send` and
 * `sendDelete` so both honour the same failure semantics.
 */
function throwIfError<T>(response: Response, envelope: IApiResponse<T> | null): void {
  if (!response.ok || (envelope !== null && envelope.error !== null)) {
    const error: IApiError =
      envelope?.error ?? {
        code: 'http_error',
        message: `Request failed with status ${response.status}`,
      };
    throw new InterviewApiError(error, response.status);
  }
}

/**
 * Core fetch wrapper. Sends the request, unwraps the envelope, and either
 * returns `data` on success or throws an `InterviewApiError` on failure.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new InterviewApiError({ code: 'network_error', message }, 0);
  }

  const envelope = await parseEnvelope<T>(response);

  // Failure: non-ok status or an explicit error in the envelope.
  throwIfError<T>(response, envelope);

  if (envelope === null || envelope.data === null) {
    throw new InterviewApiError(
      { code: 'invalid_response', message: 'Response did not contain a data payload' },
      response.status,
    );
  }

  return envelope.data;
}

/**
 * Variant of `send` for DELETE endpoints that resolve to `void`. The backend
 * returns `data: null` on a successful delete, so unlike `send` this tolerates
 * a null data payload (it only throws on an actual error envelope or non-ok
 * status).
 */
async function sendDelete(path: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(false),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new InterviewApiError({ code: 'network_error', message }, 0);
  }

  const envelope = await parseEnvelope<null>(response);
  throwIfError<null>(response, envelope);
  // Success with null data is expected — resolve to void.
}

/** Convenience wrapper for JSON-body POST/PATCH requests. */
async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: buildHeaders(true),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return send<T>(path, init);
}

/** Convenience wrapper for GET requests. */
async function sendGet<T>(path: string): Promise<T> {
  return send<T>(path, { method: 'GET', headers: buildHeaders(false) });
}

// ---------------------------------------------------------------------------
// Session endpoints — `/api/v1/interview/sessions/*`.
// ---------------------------------------------------------------------------

/** POST `/sessions` — create a new interview session. */
export async function createSession(
  input: ICreateSessionInput,
): Promise<IInterviewSession> {
  return sendJson<IInterviewSession>('/sessions', 'POST', input);
}

/** POST `/sessions/:id/start` — start a session and return its questions. */
export async function startSession(sessionId: string): Promise<IInterviewQuestion[]> {
  return sendJson<IInterviewQuestion[]>(
    `/sessions/${encodeURIComponent(sessionId)}/start`,
    'POST',
  );
}

/** GET `/sessions` — list the authenticated user's session summaries. */
export async function listSessions(): Promise<IInterviewSessionSummary[]> {
  return sendGet<IInterviewSessionSummary[]>('/sessions');
}

/** GET `/sessions/:id` — fetch full session detail (questions + scorecard). */
export async function getSession(sessionId: string): Promise<IInterviewSessionDetail> {
  return sendGet<IInterviewSessionDetail>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/** DELETE `/sessions/:id` — delete a session (cascades to questions/scorecard). */
export async function deleteSession(sessionId: string): Promise<void> {
  return sendDelete(`/sessions/${encodeURIComponent(sessionId)}`);
}

/** POST `/sessions/:id/questions/:qid/answers` — submit an answer to a question. */
export async function submitAnswer(
  sessionId: string,
  questionId: string,
  input: ISubmitAnswerInput,
): Promise<IInterviewQuestion> {
  return sendJson<IInterviewQuestion>(
    `/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(
      questionId,
    )}/answers`,
    'POST',
    input,
  );
}

/** POST `/sessions/:id/questions/:qid/evaluation` — evaluate a submitted answer. */
export async function evaluateAnswer(
  sessionId: string,
  questionId: string,
): Promise<IAnswerEvaluation> {
  return sendJson<IAnswerEvaluation>(
    `/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(
      questionId,
    )}/evaluation`,
    'POST',
  );
}

/** POST `/sessions/:id/scorecard` — compute and persist the session scorecard. */
export async function computeScorecard(
  sessionId: string,
): Promise<IPerformanceScorecard> {
  return sendJson<IPerformanceScorecard>(
    `/sessions/${encodeURIComponent(sessionId)}/scorecard`,
    'POST',
  );
}

/** GET `/sessions/:id/scorecard` — fetch the previously computed scorecard. */
export async function getScorecard(sessionId: string): Promise<IPerformanceScorecard> {
  return sendGet<IPerformanceScorecard>(
    `/sessions/${encodeURIComponent(sessionId)}/scorecard`,
  );
}

// ---------------------------------------------------------------------------
// STAR story endpoints — `/api/v1/interview/stories/*`.
// ---------------------------------------------------------------------------

/** POST `/stories` — create a STAR story. */
export async function createStory(input: ICreateStarInput): Promise<IStarStory> {
  return sendJson<IStarStory>('/stories', 'POST', input);
}

/** GET `/stories` — list the authenticated user's STAR stories. */
export async function listStories(): Promise<IStarStory[]> {
  return sendGet<IStarStory[]>('/stories');
}

/** GET `/stories/:id` — fetch a single STAR story. */
export async function getStory(id: string): Promise<IStarStory> {
  return sendGet<IStarStory>(`/stories/${encodeURIComponent(id)}`);
}

/** PATCH `/stories/:id` — update a STAR story. */
export async function updateStory(
  id: string,
  input: IUpdateStarInput,
): Promise<IStarStory> {
  return sendJson<IStarStory>(`/stories/${encodeURIComponent(id)}`, 'PATCH', input);
}

/** DELETE `/stories/:id` — delete a STAR story (resolves to void). */
export async function deleteStory(id: string): Promise<void> {
  return sendDelete(`/stories/${encodeURIComponent(id)}`);
}
