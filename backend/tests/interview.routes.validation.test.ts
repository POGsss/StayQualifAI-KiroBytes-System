/**
 * Edge / validation tests per Interview route (interview spec task 10.6).
 *
 * Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 3.3, 3.4, 12.3
 *
 * `supertest` is intentionally NOT a dependency of this package, so rather than
 * booting the Express app over HTTP these tests exercise the SAME validation
 * and guard surfaces the routes are wired to, at the layer that owns each rule:
 *
 *   - Session-create + answer-submit body validation (1.4–1.8, 3.3) is owned by
 *     the Zod schemas in `routes/interview.schemas.ts` (mounted via the shared
 *     `validate` middleware). These tests call `.safeParse(...)` directly and
 *     assert rejection plus the offending field/message — exactly what the
 *     middleware would relay to the caller.
 *   - The "re-answer an already-answered question" conflict (3.4) is enforced by
 *     the facade `submitAnswer` (ConflictError). A chainable Supabase stub
 *     returns an ACTIVE session whose question already carries an answer, and
 *     the test asserts a `ConflictError` is thrown and nothing is persisted.
 *   - The unauthenticated → auth-error path (12.3) is enforced by the
 *     `requireAuth` middleware. A request lacking an `Authorization` header is
 *     rejected with an `AuthError` forwarded to `next()`, short-circuiting
 *     before any Supabase/network call.
 *
 * No new dependencies, no HTTP server, no real network.
 */
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';

import {
  createSessionBodySchema,
  submitAnswerBodySchema,
  JOB_DESCRIPTION_MAX_LENGTH,
  ANSWER_MAX_LENGTH,
  QUESTION_COUNT_MIN,
  QUESTION_COUNT_MAX,
  DIFFICULTY_TIERS,
} from '../src/routes/interview.schemas.js';
import { submitAnswer } from '../src/services/interview.service.js';
import { requireAuth } from '../src/middleware/auth.js';
import { AuthError, ConflictError } from '../src/utils/errors.js';
import type { LifecycleState } from '../src/types/interview.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal, always-valid session-create body the per-case tests mutate. */
function validSessionBody(): Record<string, unknown> {
  return {
    difficultyTier: 'MID',
    jobDescription: 'Build and operate a scalable backend service.',
    questionCount: 8,
  };
}

/** A minimal, always-valid answer body the per-case tests mutate. */
function validAnswerBody(): Record<string, unknown> {
  return {
    answerText: 'A clear, structured answer describing the situation and result.',
    responseLatencySeconds: 42,
  };
}

/** Collect the `path` of every issue raised by a failed safeParse. */
function issuePaths(result: ReturnType<typeof createSessionBodySchema.safeParse>): string[] {
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
}

/** Concatenate every issue message raised by a failed safeParse. */
function issueMessages(
  result:
    | ReturnType<typeof createSessionBodySchema.safeParse>
    | ReturnType<typeof submitAnswerBodySchema.safeParse>
): string {
  if (result.success) {
    return '';
  }
  return result.error.issues.map((issue) => issue.message).join(' | ');
}

// ===========================================================================
// POST /sessions body validation (Requirements 1.4–1.8)
// ===========================================================================

describe('createSessionBodySchema — session-create validation (Req 1.4–1.8)', () => {
  it('accepts a well-formed session-create body (happy path)', () => {
    const result = createSessionBodySchema.safeParse(validSessionBody());
    expect(result.success).toBe(true);
  });

  it('accepts a body with an optional resumeVersionId (UUID)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      resumeVersionId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  // --- jobDescription (1.4 / 1.5) ---

  it('rejects a missing jobDescription, identifying the field (Req 1.4)', () => {
    const body = validSessionBody();
    delete body.jobDescription;

    const result = createSessionBodySchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('jobDescription');
  });

  it('rejects an empty jobDescription, identifying the field (Req 1.4)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      jobDescription: '',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('jobDescription');
  });

  it('rejects a whitespace-only jobDescription, identifying the field (Req 1.4)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      jobDescription: '    \t  \n ',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('jobDescription');
  });

  it('rejects a jobDescription over 5000 characters, identifying the field (Req 1.5)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      jobDescription: 'x'.repeat(JOB_DESCRIPTION_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('jobDescription');
    expect(issueMessages(result)).toContain(String(JOB_DESCRIPTION_MAX_LENGTH));
  });

  it('accepts a jobDescription exactly at the 5000-character limit (boundary)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      jobDescription: 'x'.repeat(JOB_DESCRIPTION_MAX_LENGTH),
    });

    expect(result.success).toBe(true);
  });

  // --- difficultyTier (1.3 required / 1.6 invalid value) ---

  it('rejects a missing difficultyTier, identifying the field (Req 1.3)', () => {
    const body = validSessionBody();
    delete body.difficultyTier;

    const result = createSessionBodySchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('difficultyTier');
  });

  it('rejects an invalid difficultyTier value and lists the valid values (Req 1.6)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      difficultyTier: 'PRINCIPAL',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('difficultyTier');
    // The error message enumerates every permitted tier.
    const message = issueMessages(result);
    for (const tier of DIFFICULTY_TIERS) {
      expect(message).toContain(tier);
    }
  });

  it('accepts every valid difficultyTier value', () => {
    for (const tier of DIFFICULTY_TIERS) {
      const result = createSessionBodySchema.safeParse({
        ...validSessionBody(),
        difficultyTier: tier,
      });
      expect(result.success).toBe(true);
    }
  });

  // --- questionCount (1.7 range/integer / 1.8 required) ---

  it('rejects a missing questionCount, identifying the field (Req 1.8)', () => {
    const body = validSessionBody();
    delete body.questionCount;

    const result = createSessionBodySchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('questionCount');
  });

  it('rejects a questionCount below the minimum (4), identifying the field (Req 1.7)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      questionCount: QUESTION_COUNT_MIN - 1,
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('questionCount');
  });

  it('rejects a questionCount above the maximum (16), identifying the field (Req 1.7)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      questionCount: QUESTION_COUNT_MAX + 1,
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('questionCount');
  });

  it('rejects a non-integer questionCount, identifying the field (Req 1.7)', () => {
    const result = createSessionBodySchema.safeParse({
      ...validSessionBody(),
      questionCount: 7.5,
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('questionCount');
  });

  it('accepts questionCount at both range boundaries (5 and 15)', () => {
    for (const count of [QUESTION_COUNT_MIN, QUESTION_COUNT_MAX]) {
      const result = createSessionBodySchema.safeParse({
        ...validSessionBody(),
        questionCount: count,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ===========================================================================
// POST /sessions/:id/questions/:qid/answers body validation (Requirement 3.3)
// ===========================================================================

describe('submitAnswerBodySchema — answer validation (Req 3.3)', () => {
  it('accepts a well-formed answer body (happy path)', () => {
    const result = submitAnswerBodySchema.safeParse(validAnswerBody());
    expect(result.success).toBe(true);
  });

  it('rejects an empty answerText, identifying the field (Req 3.3)', () => {
    const result = submitAnswerBodySchema.safeParse({
      ...validAnswerBody(),
      answerText: '',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result as ReturnType<typeof createSessionBodySchema.safeParse>)).toContain(
      'answerText'
    );
  });

  it('rejects a whitespace-only answerText, identifying the field (Req 3.3)', () => {
    const result = submitAnswerBodySchema.safeParse({
      ...validAnswerBody(),
      answerText: '   \n\t  ',
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result as ReturnType<typeof createSessionBodySchema.safeParse>)).toContain(
      'answerText'
    );
  });

  it('rejects an answerText over 5000 characters, identifying the field (Req 3.3)', () => {
    const result = submitAnswerBodySchema.safeParse({
      ...validAnswerBody(),
      answerText: 'x'.repeat(ANSWER_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result as ReturnType<typeof createSessionBodySchema.safeParse>)).toContain(
      'answerText'
    );
    expect(issueMessages(result)).toContain(String(ANSWER_MAX_LENGTH));
  });

  it('accepts an answerText exactly at the 5000-character limit (boundary)', () => {
    const result = submitAnswerBodySchema.safeParse({
      ...validAnswerBody(),
      answerText: 'x'.repeat(ANSWER_MAX_LENGTH),
    });

    expect(result.success).toBe(true);
  });

  it('rejects a negative responseLatencySeconds', () => {
    const result = submitAnswerBodySchema.safeParse({
      ...validAnswerBody(),
      responseLatencySeconds: -1,
    });

    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// Re-answering an already-answered question → conflict (Requirement 3.4)
// ===========================================================================

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';
const QUESTION_ID = 'question-1';
const SESSIONS_TABLE = 'interview_sessions';
const QUESTIONS_TABLE = 'interview_questions';

interface SessionRow {
  id: string;
  user_id: string;
  state: LifecycleState;
  difficulty_tier: string;
  job_description: string;
  question_count: number;
  resume_version_id: string | null;
  created_at: string;
}

interface QuestionRow {
  id: string;
  user_id: string;
  session_id: string;
  position: number;
  text: string;
  answer_text: string | null;
  response_latency_seconds: number | null;
  quality_score: number | null;
  grammar_score: number | null;
  feedback_comment: string | null;
  created_at: string;
}

/** Records whether any mutating write reached Supabase. */
interface WriteLedger {
  questionUpdated: boolean;
  sessionUpdated: boolean;
}

/**
 * Minimal chainable Supabase stub mirroring the chains `submitAnswer` uses:
 *   - session load:  from(sessions).select().eq().eq().maybeSingle()
 *   - question load: from(questions).select().eq().eq().eq().maybeSingle()
 * Any `update(...)` flips the ledger so the test can prove the conflict
 * short-circuits BEFORE persistence.
 */
function makeConflictSupabase(
  sessionRow: SessionRow,
  questionRow: QuestionRow,
  ledger: WriteLedger
): SupabaseClient {
  class Builder {
    private op: 'select' | 'update' = 'select';
    public constructor(private readonly table: string) {}
    public select(): this {
      return this;
    }
    public update(): this {
      this.op = 'update';
      if (this.table === QUESTIONS_TABLE) {
        ledger.questionUpdated = true;
      } else if (this.table === SESSIONS_TABLE) {
        ledger.sessionUpdated = true;
      }
      return this;
    }
    public eq(): this {
      return this;
    }
    public is(): this {
      return this;
    }
    public order(): this {
      return this;
    }
    public returns(): this {
      return this;
    }
    public maybeSingle(): Promise<unknown> {
      if (this.table === SESSIONS_TABLE) {
        return Promise.resolve({ data: sessionRow, error: null });
      }
      if (this.table === QUESTIONS_TABLE) {
        return Promise.resolve({ data: questionRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
    public then(
      onfulfilled?: ((value: unknown) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ): Promise<unknown> {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from(table: string): Builder {
      return new Builder(table);
    },
  };
  return client as unknown as SupabaseClient;
}

describe('submitAnswer — re-answering an already-answered question (Req 3.4)', () => {
  it('throws ConflictError when the question already carries an answer, persisting nothing', async () => {
    const sessionRow: SessionRow = {
      id: SESSION_ID,
      user_id: USER_ID,
      state: 'ACTIVE',
      difficulty_tier: 'MID',
      job_description: 'A job description.',
      question_count: 5,
      resume_version_id: null,
      created_at: 'now',
    };
    const questionRow: QuestionRow = {
      id: QUESTION_ID,
      user_id: USER_ID,
      session_id: SESSION_ID,
      position: 1,
      text: 'A question.',
      answer_text: 'An answer was already submitted earlier.',
      response_latency_seconds: 30,
      quality_score: null,
      grammar_score: null,
      feedback_comment: null,
      created_at: 'now',
    };
    const ledger: WriteLedger = { questionUpdated: false, sessionUpdated: false };
    const supabase = makeConflictSupabase(sessionRow, questionRow, ledger);

    await expect(
      submitAnswer(supabase, USER_ID, SESSION_ID, QUESTION_ID, {
        answerText: 'A second answer attempt.',
        responseLatencySeconds: 12,
      })
    ).rejects.toBeInstanceOf(ConflictError);

    // The conflict must short-circuit before any write reaches the database.
    expect(ledger.questionUpdated).toBe(false);
    expect(ledger.sessionUpdated).toBe(false);
  });
});

// ===========================================================================
// Unauthenticated request → auth error (Requirement 12.3)
// ===========================================================================

describe('requireAuth — unauthenticated request (Req 12.3)', () => {
  it('forwards an AuthError to next() when the Authorization header is missing', async () => {
    const req = { headers: {} } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(AuthError);
  });

  it('forwards an AuthError to next() when the Authorization header is malformed (no Bearer scheme)', async () => {
    const req = {
      headers: { authorization: 'Token abc123' },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(AuthError);
  });

  it('forwards an AuthError to next() when the Bearer token is empty', async () => {
    const req = {
      headers: { authorization: 'Bearer    ' },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwarded = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(AuthError);
  });
});
