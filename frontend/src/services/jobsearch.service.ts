/**
 * Job Search module HTTP service.
 *
 * Single data-access layer for the React frontend. Every call targets the
 * backend Express API under `/api/v1/jobsearch/*` (the Vite dev proxy forwards
 * `/api` to the backend). This file is the ONLY place the `{ data, error, meta }`
 * envelope is unwrapped: on success it returns the `data` payload, and on
 * failure it throws a typed `JobSearchApiError` carrying the backend `IApiError`.
 *
 * Steering rule: the frontend talks only to the backend API — this module MUST
 * NOT import the Supabase client.
 *
 * Named exports only. No `any`.
 */

import type {
  IAiWriterResponse,
  IApplication,
  IApplicationDetail,
  IListing,
  IListingFilters,
  IListingIngestInput,
  IPaginationMeta,
  Stage,
} from '../types/jobsearch.types';

import type { IApiError, IApiResponse } from '../types/resume.types';

/** Base path for every job search endpoint. The Vite dev proxy forwards `/api`. */
const BASE_PATH = '/api/v1/jobsearch';

/**
 * Typed client error thrown when a request fails. Carries the backend
 * `IApiError` fields plus the HTTP status code so callers (store/components)
 * can branch on `type` or `status` without reparsing the envelope.
 */
export class JobSearchApiError extends Error {
  public readonly type: string;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(error: IApiError, status: number) {
    super(error.message);
    this.name = 'JobSearchApiError';
    this.type = error.type;
    this.status = status;
    if (error.details !== undefined) {
      this.details = error.details;
    }
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, JobSearchApiError.prototype);
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
 * returns `data` on success or throws a `JobSearchApiError` on failure.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new JobSearchApiError({ type: 'network_error', message }, 0);
  }

  const envelope = await parseEnvelope<T>(response);

  // Failure: non-ok status or an explicit error in the envelope.
  if (!response.ok || (envelope !== null && envelope.error !== null)) {
    const error: IApiError =
      envelope?.error ?? {
        type: 'http_error',
        message: `Request failed with status ${response.status}`,
      };
    throw new JobSearchApiError(error, response.status);
  }

  if (envelope === null || envelope.data === null) {
    throw new JobSearchApiError(
      { type: 'invalid_response', message: 'Response did not contain a data payload' },
      response.status,
    );
  }

  return envelope.data;
}

/**
 * Fetch wrapper for DELETE requests that may return 204 No Content.
 * Returns void, does not require a data payload in the envelope.
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
    throw new JobSearchApiError({ type: 'network_error', message }, 0);
  }

  // 204 No Content — success with empty body.
  if (response.status === 204) {
    return;
  }

  const envelope = await parseEnvelope<unknown>(response);

  if (!response.ok || (envelope !== null && envelope.error !== null)) {
    const error: IApiError =
      envelope?.error ?? {
        type: 'http_error',
        message: `Request failed with status ${response.status}`,
      };
    throw new JobSearchApiError(error, response.status);
  }
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
// Listings response type — wraps the paginated envelope data.
// ---------------------------------------------------------------------------

export interface IListingsResponse {
  listings: IListing[];
  meta: IPaginationMeta;
}

// ---------------------------------------------------------------------------
// Params interface for getListings.
// ---------------------------------------------------------------------------

export interface IGetListingsParams extends IListingFilters {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Endpoint functions — one per `/api/v1/jobsearch/*` route.
// ---------------------------------------------------------------------------

/** GET `/listings` — paginated, filtered job listings. */
export async function getListings(params?: IGetListingsParams): Promise<IListingsResponse> {
  const searchParams = new URLSearchParams();

  if (params !== undefined) {
    if (params.page !== undefined) {
      searchParams.set('page', String(params.page));
    }
    if (params.pageSize !== undefined) {
      searchParams.set('pageSize', String(params.pageSize));
    }
    if (params.workMode !== undefined) {
      searchParams.set('workMode', params.workMode);
    }
    if (params.location !== undefined) {
      searchParams.set('location', params.location);
    }
    if (params.keyword !== undefined) {
      searchParams.set('keyword', params.keyword);
    }
    if (params.company !== undefined) {
      searchParams.set('company', params.company);
    }
  }

  const query = searchParams.toString();
  const path = query.length > 0 ? `/listings?${query}` : '/listings';
  return sendGet<IListingsResponse>(path);
}

/** POST `/listings` — ingest a new listing (with dedup). */
export async function ingestListing(input: IListingIngestInput): Promise<IListing> {
  return sendJson<IListing>('/listings', 'POST', input);
}

/** GET `/applications` — list the authenticated user's applications. */
export async function listApplications(): Promise<IApplication[]> {
  return sendGet<IApplication[]>('/applications');
}

/** POST `/applications` — add a listing to the application tracker. */
export async function addApplication(listingId: string): Promise<IApplication> {
  return sendJson<IApplication>('/applications', 'POST', { listingId });
}

/** PATCH `/applications/:id/stage` — move application to a new stage. */
export async function updateStage(id: string, stage: Stage): Promise<IApplication> {
  return sendJson<IApplication>(
    `/applications/${encodeURIComponent(id)}/stage`,
    'PATCH',
    { stage },
  );
}

/** GET `/applications/:id` — get application detail + history. */
export async function getApplicationDetail(id: string): Promise<IApplicationDetail> {
  return sendGet<IApplicationDetail>(`/applications/${encodeURIComponent(id)}`);
}

/** PATCH `/applications/:id/notes` — update application notes. */
export async function updateNotes(id: string, notes: string): Promise<IApplication> {
  return sendJson<IApplication>(
    `/applications/${encodeURIComponent(id)}/notes`,
    'PATCH',
    { notes },
  );
}

/** DELETE `/applications/:id` — delete an application. */
export async function deleteApplication(id: string): Promise<void> {
  return sendDelete(`/applications/${encodeURIComponent(id)}`);
}

/** POST `/ai/cover-letter` — generate a cover letter for an application. */
export async function generateCoverLetter(applicationId: string): Promise<IAiWriterResponse> {
  return sendJson<IAiWriterResponse>('/ai/cover-letter', 'POST', { applicationId });
}

/** POST `/ai/linkedin-outreach` — generate a LinkedIn outreach message. */
export async function generateLinkedInOutreach(
  applicationId: string,
  recipientName?: string,
  recipientRole?: string,
): Promise<IAiWriterResponse> {
  const body: { applicationId: string; recipientName?: string; recipientRole?: string } = {
    applicationId,
  };
  if (recipientName !== undefined) {
    body.recipientName = recipientName;
  }
  if (recipientRole !== undefined) {
    body.recipientRole = recipientRole;
  }
  return sendJson<IAiWriterResponse>('/ai/linkedin-outreach', 'POST', body);
}

/** POST `/ai/follow-up-email` — generate a follow-up email. */
export async function generateFollowUpEmail(applicationId: string): Promise<IAiWriterResponse> {
  return sendJson<IAiWriterResponse>('/ai/follow-up-email', 'POST', { applicationId });
}
