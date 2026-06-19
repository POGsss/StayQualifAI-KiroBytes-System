/**
 * Resume module HTTP service.
 *
 * Single data-access layer for the React frontend. Every call targets the
 * backend Express API under `/api/v1/resume/*` (the Vite dev proxy forwards
 * `/api` to the backend). This file is the ONLY place the `{ data, error, meta }`
 * envelope is unwrapped: on success it returns the `data` payload, and on
 * failure it throws a typed `ResumeApiError` carrying the backend `IApiError`.
 *
 * Steering rule: the frontend talks only to the backend API — this module MUST
 * NOT import the Supabase client.
 *
 * Named exports only. No `any`.
 */

import type {
  IApiError,
  IApiResponse,
  IAtsScanResult,
  IKeywordSuggestion,
  IMatchResult,
  IResumeTemplate,
  IResumeVersion,
  IStructuredResume,
  XyzBullet,
} from '../types/resume.types';

/** Base path for every resume endpoint. The Vite dev proxy forwards `/api`. */
const BASE_PATH = '/api/v1/resume';

/**
 * Typed client error thrown when a request fails. Carries the backend
 * `IApiError` fields plus the HTTP status code so callers (store/components)
 * can branch on `type` or `status` without reparsing the envelope.
 */
export class ResumeApiError extends Error {
  public readonly type: string;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(error: IApiError, status: number) {
    super(error.message);
    this.name = 'ResumeApiError';
    this.type = error.type;
    this.status = status;
    if (error.details !== undefined) {
      this.details = error.details;
    }
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, ResumeApiError.prototype);
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
 * Core fetch wrapper. Sends the request, unwraps the envelope, and either
 * returns `data` on success or throws a `ResumeApiError` on failure.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new ResumeApiError({ type: 'network_error', message }, 0);
  }

  const envelope = await parseEnvelope<T>(response);

  // Failure: non-ok status or an explicit error in the envelope.
  if (!response.ok || (envelope !== null && envelope.error !== null)) {
    const error: IApiError =
      envelope?.error ?? {
        type: 'http_error',
        message: `Request failed with status ${response.status}`,
      };
    throw new ResumeApiError(error, response.status);
  }

  if (envelope === null || envelope.data === null) {
    throw new ResumeApiError(
      { type: 'invalid_response', message: 'Response did not contain a data payload' },
      response.status,
    );
  }

  return envelope.data;
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
// Endpoint functions — one per `/api/v1/resume/*` route.
// ---------------------------------------------------------------------------

/** POST `/uploads` — upload + parse a resume file (multipart form-data). */
export async function uploadResume(file: File): Promise<IStructuredResume> {
  const form = new FormData();
  form.append('file', file);
  // NOTE: do not set Content-Type — the browser sets the multipart boundary.
  return send<IStructuredResume>('/uploads', {
    method: 'POST',
    headers: buildHeaders(false),
    body: form,
  });
}

/** POST `/scans` — compute an ATS compatibility score (+ optional JD). */
export async function scanResume(
  content: IStructuredResume,
  jobDescription?: string,
): Promise<IAtsScanResult> {
  const body: { content: IStructuredResume; jobDescription?: string } = { content };
  if (jobDescription !== undefined) {
    body.jobDescription = jobDescription;
  }
  return sendJson<IAtsScanResult>('/scans', 'POST', body);
}

/** POST `/keyword-suggestions` — keyword gap suggestions against a JD. */
export async function suggestKeywords(
  content: IStructuredResume,
  jobDescription: string,
): Promise<IKeywordSuggestion[]> {
  return sendJson<IKeywordSuggestion[]>('/keyword-suggestions', 'POST', {
    content,
    jobDescription,
  });
}

/** GET `/templates` — list ATS-parseable templates. */
export async function listTemplates(): Promise<IResumeTemplate[]> {
  return sendGet<IResumeTemplate[]>('/templates');
}

/** POST `/versions` — save a built/edited resume version. */
export async function createVersion(
  name: string,
  content: IStructuredResume,
  sourceVersionId?: string,
): Promise<IResumeVersion> {
  const body: { name: string; content: IStructuredResume; sourceVersionId?: string } = {
    name,
    content,
  };
  if (sourceVersionId !== undefined) {
    body.sourceVersionId = sourceVersionId;
  }
  return sendJson<IResumeVersion>('/versions', 'POST', body);
}

/** GET `/versions` — list the authenticated user's versions. */
export async function listVersions(): Promise<IResumeVersion[]> {
  return sendGet<IResumeVersion[]>('/versions');
}

/** POST `/versions/:id/clone` — clone a version into a new variant. */
export async function cloneVersion(id: string): Promise<IResumeVersion> {
  return sendJson<IResumeVersion>(`/versions/${encodeURIComponent(id)}/clone`, 'POST');
}

/** PATCH `/versions/:id` — rename a version. */
export async function renameVersion(id: string, name: string): Promise<IResumeVersion> {
  return sendJson<IResumeVersion>(`/versions/${encodeURIComponent(id)}`, 'PATCH', { name });
}

/** POST `/versions/:id/activate` — set a version active. */
export async function activateVersion(id: string): Promise<IResumeVersion> {
  return sendJson<IResumeVersion>(
    `/versions/${encodeURIComponent(id)}/activate`,
    'POST',
  );
}

/** POST `/match` — semantic match analysis against a JD. */
export async function matchJob(
  content: IStructuredResume,
  jobDescription: string,
): Promise<IMatchResult> {
  return sendJson<IMatchResult>('/match', 'POST', { content, jobDescription });
}

/** POST `/bullets` — generate X-Y-Z achievement bullets. */
export async function generateBullets(experience: string): Promise<XyzBullet[]> {
  return sendJson<XyzBullet[]>('/bullets', 'POST', { experience });
}
