/**
 * Upskilling module HTTP service (Career Roadmap & Learning Engine).
 *
 * Single data-access layer for the React frontend. Every call targets the
 * backend Express API under `/api/v1/upskilling/*` (the Vite dev proxy forwards
 * `/api` to the backend). This file is the ONLY place the `{ data, error, meta }`
 * envelope is unwrapped: on success it returns the `data` payload, and on
 * failure it throws a typed `UpskillingApiError` carrying the backend `IApiError`.
 *
 * Note: the upskilling DELETE/action endpoints return HTTP 200 with a
 * `{ data: null, error: null, meta: null }` envelope (not 204 No Content), so
 * the delete helper treats a null-data success as valid and does not throw.
 *
 * Steering rule: the frontend talks only to the backend API — this module MUST
 * NOT import the Supabase client.
 *
 * Named exports only. No `any`.
 */

import type {
  CostClassification,
  DifficultyLevel,
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
} from '../types/upskilling.types';

import type { IApiError, IApiResponse } from '../types/resume.types';

import { API_BASE_URL } from './apiConfig';

/**
 * Base path for every upskilling endpoint. `API_BASE_URL` is empty in dev (the
 * Vite proxy forwards `/api`) and the hosted backend origin in production.
 */
const BASE_PATH = `${API_BASE_URL}/api/v1/upskilling`;

/**
 * Typed client error thrown when a request fails. Carries the backend
 * `IApiError` fields plus the HTTP status code so callers (store/components)
 * can branch on `type` or `status` without reparsing the envelope.
 */
export class UpskillingApiError extends Error {
  public readonly type: string;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(error: IApiError, status: number) {
    super(error.message);
    this.name = 'UpskillingApiError';
    this.type = error.type;
    this.status = status;
    if (error.details !== undefined) {
      this.details = error.details;
    }
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, UpskillingApiError.prototype);
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
 * returns `data` on success or throws an `UpskillingApiError` on failure.
 */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_PATH}${path}`, init);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw new UpskillingApiError({ type: 'network_error', message }, 0);
  }

  const envelope = await parseEnvelope<T>(response);

  // Failure: non-ok status or an explicit error in the envelope.
  if (!response.ok || (envelope !== null && envelope.error !== null)) {
    const error: IApiError =
      envelope?.error ?? {
        type: 'http_error',
        message: `Request failed with status ${response.status}`,
      };
    throw new UpskillingApiError(error, response.status);
  }

  if (envelope === null || envelope.data === null) {
    throw new UpskillingApiError(
      { type: 'invalid_response', message: 'Response did not contain a data payload' },
      response.status,
    );
  }

  return envelope.data;
}

/**
 * Fetch wrapper for DELETE/action requests. The upskilling backend returns
 * HTTP 200 with `{ data: null, error: null, meta: null }` for deletes, so a
 * null-data success is valid here and must NOT throw. Only surfaces failures
 * (non-ok status or an explicit error in the envelope).
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
    throw new UpskillingApiError({ type: 'network_error', message }, 0);
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
    throw new UpskillingApiError(error, response.status);
  }
  // Otherwise: 200 with a null-data envelope — a successful delete. Return void.
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
// Input shapes for save endpoints (subset of full persisted records).
// ---------------------------------------------------------------------------

/** Body for `POST /projects` — persist a generated project suggestion. */
export interface ISaveProjectInput {
  targetRole: string;
  title: string;
  description: string;
  demonstratedSkills: string[];
  difficulty: DifficultyLevel;
  estimatedEffortHours: number;
}

/** Body for `POST /courses/saved` — bookmark a course recommendation. */
export interface ISaveCourseInput {
  title: string;
  provider: string;
  url: string;
  cost: CostClassification;
}

// ---------------------------------------------------------------------------
// Project endpoints — `/api/v1/upskilling/projects/*`.
// ---------------------------------------------------------------------------

/** POST `/projects/generate` — generate 3–5 role-based project suggestions. */
export async function generateProjects(
  input: IGenerateProjectsInput,
): Promise<IProjectSuggestion[]> {
  return sendJson<IProjectSuggestion[]>('/projects/generate', 'POST', input);
}

/** POST `/projects` — persist a generated project suggestion. */
export async function saveProject(input: ISaveProjectInput): Promise<IProjectSuggestion> {
  return sendJson<IProjectSuggestion>('/projects', 'POST', input);
}

/** GET `/projects` — list the authenticated user's saved project suggestions. */
export async function listProjects(): Promise<IProjectSuggestion[]> {
  return sendGet<IProjectSuggestion[]>('/projects');
}

/** DELETE `/projects/:id` — delete a saved project suggestion. */
export async function deleteProject(id: string): Promise<void> {
  return sendDelete(`/projects/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Roadmap endpoints — `/api/v1/upskilling/roadmaps/*`.
// ---------------------------------------------------------------------------

/** POST `/roadmaps/generate` — generate a career-transition roadmap draft. */
export async function generateRoadmap(input: IGenerateRoadmapInput): Promise<IRoadmapDraft> {
  return sendJson<IRoadmapDraft>('/roadmaps/generate', 'POST', input);
}

/** POST `/roadmaps` — persist a roadmap draft (with milestones). */
export async function saveRoadmap(draft: IRoadmapDraft): Promise<IRoadmap> {
  return sendJson<IRoadmap>('/roadmaps', 'POST', draft);
}

/** GET `/roadmaps` — list the authenticated user's saved roadmaps. */
export async function listRoadmaps(): Promise<IRoadmapSummary[]> {
  return sendGet<IRoadmapSummary[]>('/roadmaps');
}

/** GET `/roadmaps/:id` — get a roadmap with milestones and completion counts. */
export async function getRoadmap(id: string): Promise<IRoadmapDetail> {
  return sendGet<IRoadmapDetail>(`/roadmaps/${encodeURIComponent(id)}`);
}

/** PATCH `/roadmaps/:roadmapId/milestones/:milestoneId` — toggle completion. */
export async function updateMilestone(
  roadmapId: string,
  milestoneId: string,
  completed: boolean,
): Promise<IMilestone> {
  return sendJson<IMilestone>(
    `/roadmaps/${encodeURIComponent(roadmapId)}/milestones/${encodeURIComponent(milestoneId)}`,
    'PATCH',
    { completed },
  );
}

/** DELETE `/roadmaps/:id` — delete a roadmap (cascade-removes milestones). */
export async function deleteRoadmap(id: string): Promise<void> {
  return sendDelete(`/roadmaps/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Course endpoints — `/api/v1/upskilling/courses/*`.
// ---------------------------------------------------------------------------

/** GET `/courses/search?query=...&cost=...` — find course recommendations. */
export async function searchCourses(
  input: ISearchCoursesInput,
): Promise<ICourseRecommendation[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('query', input.query);
  if (input.cost !== undefined) {
    searchParams.set('cost', input.cost);
  }
  const query = searchParams.toString();
  return sendGet<ICourseRecommendation[]>(`/courses/search?${query}`);
}

/** POST `/courses/saved` — bookmark a course recommendation. */
export async function saveCourse(input: ISaveCourseInput): Promise<ISavedCourse> {
  return sendJson<ISavedCourse>('/courses/saved', 'POST', input);
}

/** GET `/courses/saved` — list the authenticated user's saved courses. */
export async function listSavedCourses(): Promise<ISavedCourse[]> {
  return sendGet<ISavedCourse[]>('/courses/saved');
}

/** DELETE `/courses/saved/:id` — delete a saved course bookmark. */
export async function deleteSavedCourse(id: string): Promise<void> {
  return sendDelete(`/courses/saved/${encodeURIComponent(id)}`);
}
