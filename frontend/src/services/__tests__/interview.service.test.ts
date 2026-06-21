/**
 * Unit tests for the Interview frontend HTTP service envelope unwrapping.
 *
 * These tests mock the global `fetch` and verify the single responsibility of
 * `interview.service.ts`: unwrapping the `{ data, error, meta }` envelope so
 * that callers receive the `data` payload on success and a typed
 * `InterviewApiError` (carrying the backend `IApiError`) on failure.
 *
 * Covers Requirements 13.2 (success populates `data`) and 13.3 (failure throws
 * a typed client error carrying the `error` object).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterviewApiError,
  createSession,
  deleteStory,
  getStory,
  listSessions,
  setAuthToken,
} from '../interview.service';
import type {
  IApiResponse,
  IInterviewSession,
  IInterviewSessionSummary,
  IStarStory,
} from '../../types/interview.types';

/**
 * Build a minimal `Response`-like object. Only the members the service reads
 * (`ok`, `status`, `text()`) are implemented so we do not depend on a real
 * `Response` polyfill in jsdom.
 */
function mockResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Serialize an envelope to a JSON body string. */
function envelope<T>(body: IApiResponse<T>): string {
  return JSON.stringify(body);
}

describe('interview.service envelope unwrapping', () => {
  beforeEach(() => {
    setAuthToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setAuthToken(null);
  });

  it('returns the data array on a successful list response (listSessions)', async () => {
    const summaries: IInterviewSessionSummary[] = [
      {
        id: 'sess-1',
        state: 'SCORED',
        difficultyTier: 'MID',
        createdAt: '2024-01-01T00:00:00.000Z',
        overallScore: 82,
        passFailTier: 'PASS',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        envelope<IInterviewSessionSummary[]>({
          data: summaries,
          error: null,
          meta: { requestId: 'r1', timestamp: 't1', total: 1 },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSessions();

    expect(result).toEqual(summaries);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/interview/sessions',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns the data object on a successful single-resource response (getStory)', async () => {
    const story: IStarStory = {
      id: 'story-1',
      title: 'Led a migration',
      situation: 'Legacy system',
      task: 'Migrate it',
      action: 'Planned and executed',
      result: 'Zero downtime',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        envelope<IStarStory>({ data: story, error: null, meta: null }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStory('story-1');

    expect(result).toEqual(story);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/interview/stories/story-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws a typed InterviewApiError carrying the envelope error on a failure response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        409,
        envelope<null>({
          data: null,
          error: { code: 'conflict', message: 'A story with that title already exists' },
          meta: null,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await createSession({
      difficultyTier: 'MID',
      jobDescription: 'Backend engineer',
      questionCount: 5,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InterviewApiError);
    const apiError = error as InterviewApiError;
    expect(apiError.code).toBe('conflict');
    expect(apiError.message).toBe('A story with that title already exists');
    expect(apiError.status).toBe(409);
  });

  it('reads the discriminator from the backend `type` field when `code` is absent', async () => {
    // The backend currently emits `type` rather than `code` on error envelopes.
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        404,
        JSON.stringify({
          data: null,
          error: { type: 'not_found', message: 'Story not found' },
          meta: null,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = (await getStory('missing').catch((e: unknown) => e)) as InterviewApiError;

    expect(error).toBeInstanceOf(InterviewApiError);
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('Story not found');
    expect(error.status).toBe(404);
  });

  it('throws an http_error InterviewApiError on a non-ok status with an empty/non-JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(500, ''));
    vi.stubGlobal('fetch', fetchMock);

    const error = (await listSessions().catch((e: unknown) => e)) as InterviewApiError;

    expect(error).toBeInstanceOf(InterviewApiError);
    expect(error.code).toBe('http_error');
    expect(error.status).toBe(500);
    expect(error.message).toContain('500');
  });

  it('throws a network_error InterviewApiError with status 0 when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const error = (await listSessions().catch((e: unknown) => e)) as InterviewApiError;

    expect(error).toBeInstanceOf(InterviewApiError);
    expect(error.code).toBe('network_error');
    expect(error.status).toBe(0);
    expect(error.message).toBe('connection refused');
  });

  it('resolves to void for a successful delete returning null data (deleteStory)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        200,
        envelope<null>({ data: null, error: null, meta: null }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteStory('story-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/interview/stories/story-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('includes the Authorization header when an auth token is set', async () => {
    const session: IInterviewSession = {
      id: 'sess-1',
      userId: 'user-1',
      state: 'PENDING',
      difficultyTier: 'SENIOR',
      jobDescription: 'Staff engineer',
      questionCount: 7,
      resumeVersionId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        201,
        envelope<IInterviewSession>({ data: session, error: null, meta: null }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    setAuthToken('test-token');

    await createSession({
      difficultyTier: 'SENIOR',
      jobDescription: 'Staff engineer',
      questionCount: 7,
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const init = firstCall![1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
