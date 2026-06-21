/**
 * Property-based test for the Interview API envelope (interview spec task 10.5).
 *
 * Property 8: All responses conform to the API envelope.
 *   For any request outcome, the response is an API_Response of shape
 *   `{ data, error, meta }` where EXACTLY ONE of `data` / `error` is non-null —
 *   on success `data` is populated and `error` is null, and on failure `error`
 *   is a typed error (discriminator + message) and `data` is null.
 *
 * Approach (Option B — unit-level, no new deps): supertest is not a backend
 * dependency, so rather than booting the full HTTP stack we exercise the two
 * envelope producers directly:
 *   - SUCCESS envelopes: invoke the real controller handlers (single, list,
 *     and the documented DELETE no-content case) with a mocked req/res and the
 *     Interview service facade mocked to resolve the generated payload.
 *   - FAILURE envelopes: invoke the real centralized error middleware
 *     (`errorHandler`) with each generated typed error, exactly as Express
 *     would when a handler forwards a thrown error via `next(err)`.
 * Both paths return the genuine `{ data, error, meta }` body the client sees.
 *
 * Documented exception (Requirement 10.1): DELETE /stories/:id returns
 * `{ data: null, error: null, meta: null }` — both `data` and `error` are null.
 * This outcome is asserted against that exact shape and is excluded from the
 * "exactly one non-null" check, matching the spec's stated carve-out.
 *
 * Validates: Requirements 13.1, 13.2, 13.3
 */
import type { Request, Response } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

import {
  AiProviderError,
  AppError,
  AuthError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../src/utils/errors.js';

// Mock the Interview service facade so the success handlers resolve generated
// payloads instead of touching Supabase. Every name the controller imports is
// stubbed; only a few are configured per-iteration.
vi.mock('../src/services/interview.service.js', () => ({
  createSession: vi.fn(),
  createStory: vi.fn(),
  computeScorecard: vi.fn(),
  deleteStory: vi.fn(),
  evaluateAnswer: vi.fn(),
  getSession: vi.fn(),
  getStory: vi.fn(),
  listSessions: vi.fn(),
  listStories: vi.fn(),
  startSession: vi.fn(),
  submitAnswer: vi.fn(),
  updateStory: vi.fn(),
}));

import {
  deleteStoryHandler,
  getStoryHandler,
  listStoriesHandler,
} from '../src/controllers/interview.controller.js';
import {
  deleteStory,
  getStory,
  listStories,
} from '../src/services/interview.service.js';
import { errorHandler } from '../src/middleware/error.js';

// ---------------------------------------------------------------------------
// Test doubles for Express req/res that capture the JSON body the client sees.
// ---------------------------------------------------------------------------

interface ICapture {
  res: Response;
  done: Promise<void>;
  getBody: () => unknown;
}

function makeCapture(): ICapture {
  let body: unknown;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const res = {
    headersSent: false,
    status(_code: number): Response {
      return res as unknown as Response;
    },
    json(payload: unknown): Response {
      body = payload;
      resolveDone();
      return res as unknown as Response;
    },
  };

  return {
    res: res as unknown as Response,
    done,
    getBody: () => body,
  };
}

function makeReq(): Request {
  return {
    headers: {},
    params: { id: 'story-1' },
    body: {},
    // The facade is mocked, so these only need to be present (non-undefined)
    // to satisfy the controller's narrowing guards.
    user: { id: 'user-1' },
    supabase: {},
  } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Outcome generator: a discriminated union covering success (single / list /
// delete) and failure (one per typed error class).
// ---------------------------------------------------------------------------

type ErrorType =
  | 'ValidationError'
  | 'NotFoundError'
  | 'ConflictError'
  | 'AiProviderError'
  | 'AuthError'
  | 'InternalError';

type Outcome =
  | { kind: 'success-single' }
  | { kind: 'success-list'; n: number }
  | { kind: 'success-delete' }
  | { kind: 'failure'; errorType: ErrorType; message: string };

function buildError(errorType: ErrorType, message: string): AppError {
  switch (errorType) {
    case 'ValidationError':
      return new ValidationError(message);
    case 'NotFoundError':
      return new NotFoundError(message);
    case 'ConflictError':
      return new ConflictError(message);
    case 'AiProviderError':
      return new AiProviderError(message);
    case 'AuthError':
      return new AuthError(message);
    case 'InternalError':
      return new InternalError(message);
  }
}

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  fc.constant<Outcome>({ kind: 'success-single' }),
  fc
    .integer({ min: 0, max: 25 })
    .map<Outcome>((n) => ({ kind: 'success-list', n })),
  fc.constant<Outcome>({ kind: 'success-delete' }),
  fc
    .record({
      errorType: fc.constantFrom<ErrorType>(
        'ValidationError',
        'NotFoundError',
        'ConflictError',
        'AiProviderError',
        'AuthError',
        'InternalError'
      ),
      message: fc.string({ minLength: 1, maxLength: 200 }),
    })
    .map<Outcome>(({ errorType, message }) => ({
      kind: 'failure',
      errorType,
      message,
    }))
);

/**
 * Run an outcome through the real envelope producer and return the captured
 * `{ data, error, meta }` body.
 */
async function produceEnvelope(outcome: Outcome): Promise<unknown> {
  const capture = makeCapture();
  const req = makeReq();

  switch (outcome.kind) {
    case 'success-single': {
      vi.mocked(getStory).mockResolvedValue({
        id: 'story-1',
        title: 'Led migration',
        situation: 's',
        task: 't',
        action: 'a',
        result: 'r',
        createdAt: new Date().toISOString(),
      });
      getStoryHandler(req, capture.res, vi.fn());
      break;
    }
    case 'success-list': {
      const items = Array.from({ length: outcome.n }, (_unused, i) => ({
        id: `story-${i}`,
        title: `t-${i}`,
        situation: 's',
        task: 't',
        action: 'a',
        result: 'r',
        createdAt: new Date().toISOString(),
      }));
      vi.mocked(listStories).mockResolvedValue(items);
      listStoriesHandler(req, capture.res, vi.fn());
      break;
    }
    case 'success-delete': {
      vi.mocked(deleteStory).mockResolvedValue(undefined);
      deleteStoryHandler(req, capture.res, vi.fn());
      break;
    }
    case 'failure': {
      const err = buildError(outcome.errorType, outcome.message);
      errorHandler(err, req, capture.res, vi.fn());
      break;
    }
  }

  await capture.done;
  return capture.getBody();
}

// ---------------------------------------------------------------------------
// Property + targeted unit assertions.
// ---------------------------------------------------------------------------

describe('Interview API envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Feature: interview, Property 8: All responses conform to the API envelope
  it('Property 8: every outcome produces a valid { data, error, meta } envelope', async () => {
    await fc.assert(
      fc.asyncProperty(outcomeArb, async (outcome) => {
        const body = (await produceEnvelope(outcome)) as {
          data: unknown;
          error: unknown;
          meta: unknown;
        };

        // Every envelope has exactly the three top-level keys.
        expect(Object.keys(body).sort()).toEqual(['data', 'error', 'meta']);

        if (outcome.kind === 'success-delete') {
          // Documented exception (Req 10.1): DELETE returns data:null,
          // error:null, meta:null. Both data and error are null here.
          expect(body.data).toBeNull();
          expect(body.error).toBeNull();
          expect(body.meta).toBeNull();
          return;
        }

        const dataNonNull = body.data !== null && body.data !== undefined;
        const errorNonNull = body.error !== null && body.error !== undefined;

        // Core invariant: exactly one of data / error is non-null (Req 13.1).
        expect(dataNonNull).not.toBe(errorNonNull);

        if (outcome.kind === 'failure') {
          // Failure: error populated, data null (Req 13.3).
          expect(dataNonNull).toBe(false);
          expect(errorNonNull).toBe(true);
          const error = body.error as Record<string, unknown>;
          // Typed error carries a string discriminator + message. The platform
          // discriminator field is `type` (the design refers to it as `code`).
          expect(typeof error.type).toBe('string');
          expect((error.type as string).length).toBeGreaterThan(0);
          expect(error.type).toBe(outcome.errorType);
          expect(typeof error.message).toBe('string');
        } else {
          // Success: data populated, error null (Req 13.2).
          expect(dataNonNull).toBe(true);
          expect(errorNonNull).toBe(false);
          expect(body.error).toBeNull();

          if (outcome.kind === 'success-single') {
            // Single-resource responses set meta to null (Req 13.1).
            expect(body.meta).toBeNull();
          } else {
            // List responses carry a `total` integer count (Req 13.1).
            const meta = body.meta as { total?: unknown } | null;
            expect(meta).not.toBeNull();
            expect(typeof meta?.total).toBe('number');
            expect(meta?.total).toBe(outcome.n);
            expect(Array.isArray(body.data)).toBe(true);
            expect((body.data as unknown[]).length).toBe(outcome.n);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // A couple of concrete examples for fast, readable regression coverage.
  it('success single envelope: data set, error null, meta null', async () => {
    const body = (await produceEnvelope({ kind: 'success-single' })) as {
      data: unknown;
      error: unknown;
      meta: unknown;
    };
    expect(body.data).not.toBeNull();
    expect(body.error).toBeNull();
    expect(body.meta).toBeNull();
  });

  it('failure envelope: typed error set, data null', async () => {
    const body = (await produceEnvelope({
      kind: 'failure',
      errorType: 'NotFoundError',
      message: 'missing',
    })) as { data: unknown; error: { type: string; message: string } };
    expect(body.data).toBeNull();
    expect(body.error.type).toBe('NotFoundError');
    expect(body.error.message).toBe('missing');
  });
});
