/**
 * Property test for the session lifecycle state machine (interview spec task
 * 10.2).
 *
 * Property 7: Session lifecycle honors the state machine.
 *
 * The Interview service facade owns the `PENDING → ACTIVE → COMPLETED → SCORED`
 * state machine. Every state-guarded operation loads the session RLS-scoped to
 * the caller and validates the current `Lifecycle_State` BEFORE acting:
 *
 *   | Operation         | Allowed state(s)      | Requirement |
 *   |-------------------|-----------------------|-------------|
 *   | startSession      | PENDING               | 2.5         |
 *   | submitAnswer      | ACTIVE                | 3.5         |
 *   | evaluateAnswer    | COMPLETED or SCORED   | 4.4         |
 *   | computeScorecard  | COMPLETED or SCORED   | 5.9         |
 *
 * Over the full `(state, operation)` transition table this test asserts:
 *   - ALLOWED pairs pass the guard (the operation does NOT throw a state-guard
 *     `ValidationError`; the mocked delegations resolve), and
 *   - every DISALLOWED pair is rejected with a typed `ValidationError` whose
 *     message names the current state, leaving the session unmodified (the
 *     Supabase stub records NO state-mutating update to `interview_sessions`).
 *
 * The sub-component delegations (`generateQuestions`, the answer evaluator, the
 * scorecard engine, and the STAR organizer) are mocked so the test focuses on
 * the STATE GUARD only, and the Supabase client is a chainable stub that
 * returns a session in a generated `state` and records whether any
 * state-mutating update occurred.
 *
 * Validates: Requirements 2.5, 3.5, 4.4, 5.9
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import type { LifecycleState } from '../src/types/interview.types.js';
import { ValidationError } from '../src/utils/errors.js';

// --- Mock every delegated sub-component so only the state guard is exercised ---

vi.mock('../src/services/interview.questionGenerator.service.js', () => ({
  generateQuestions: vi.fn(async () => []),
}));

vi.mock('../src/services/interview.answerEvaluator.service.js', () => ({
  evaluateAnswer: vi.fn(async () => ({
    qualityScore: 80,
    grammarScore: 80,
    feedbackComment: 'ok',
  })),
}));

vi.mock('../src/services/interview.scorecard.service.js', () => ({
  computeScorecard: vi.fn(async () => ({
    sessionId: 'session-1',
    answerQualityScore: 80,
    grammarScore: 80,
    latencyScore: 80,
    pressureScore: 80,
    overallScore: 80,
    passFailTier: 'PASS',
    createdAt: 'now',
  })),
  fetchCachedScorecard: vi.fn(async () => null),
}));

vi.mock('../src/services/interview.starOrganizer.service.js', () => ({
  createStory: vi.fn(async () => ({})),
  listStories: vi.fn(async () => []),
  getStory: vi.fn(async () => ({})),
  updateStory: vi.fn(async () => ({})),
  deleteStory: vi.fn(async () => undefined),
}));

import {
  computeScorecard,
  evaluateAnswer,
  startSession,
  submitAnswer,
} from '../src/services/interview.service.js';

// --- Fixtures --------------------------------------------------------------

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';
const QUESTION_ID = 'question-1';

const SESSIONS_TABLE = 'interview_sessions';
const QUESTIONS_TABLE = 'interview_questions';

/** The raw `interview_sessions` row shape Supabase returns (snake_case). */
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

/** The raw `interview_questions` row shape Supabase returns (snake_case). */
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

function makeSessionRow(state: LifecycleState): SessionRow {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    state,
    difficulty_tier: 'MID',
    job_description: 'A job description.',
    question_count: 5,
    resume_version_id: null,
    created_at: 'now',
  };
}

function makeQuestionRow(): QuestionRow {
  return {
    id: QUESTION_ID,
    user_id: USER_ID,
    session_id: SESSION_ID,
    position: 1,
    text: 'A question.',
    answer_text: null,
    response_latency_seconds: null,
    quality_score: null,
    grammar_score: null,
    feedback_comment: null,
    created_at: 'now',
  };
}

/** Mutation ledger the stub writes to so the test can detect state changes. */
interface StubRecord {
  sessionStateUpdated: boolean;
}

interface StubContext {
  sessionRow: SessionRow;
  questionRow: QuestionRow;
  record: StubRecord;
}

/**
 * A minimal chainable Supabase query-builder stub. It mirrors the exact chains
 * the facade uses:
 *   - session load:  from(sessions).select().eq().eq().maybeSingle()
 *   - question load: from(questions).select().eq().eq().eq().maybeSingle()
 *   - answer write:  from(questions).update().eq().eq().eq().select().returns()
 *   - count head:    from(questions).select('id',{head}).eq().eq().is()
 *   - completion:    from(sessions).update().eq().eq().eq()
 * Awaiting the builder (its `then`) resolves the multi-row / count result;
 * `maybeSingle()` resolves the single-row result.
 */
class QueryBuilder {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private head = false;

  public constructor(
    private readonly table: string,
    private readonly ctx: StubContext
  ) {}

  public select(
    _columns?: string,
    options?: { count?: string; head?: boolean }
  ): this {
    if (options?.head === true) {
      this.head = true;
    }
    return this;
  }

  public insert(_payload: unknown): this {
    this.op = 'insert';
    return this;
  }

  public update(_payload: unknown): this {
    this.op = 'update';
    return this;
  }

  public delete(): this {
    this.op = 'delete';
    return this;
  }

  public eq(_column: string, _value: unknown): this {
    return this;
  }

  public is(_column: string, _value: unknown): this {
    return this;
  }

  public order(_column: string, _options?: unknown): this {
    return this;
  }

  public returns(): this {
    return this;
  }

  public maybeSingle(): Promise<unknown> {
    return Promise.resolve(this.resolveSingle());
  }

  public then(
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ): Promise<unknown> {
    return Promise.resolve(this.resolveMany()).then(onfulfilled, onrejected);
  }

  private resolveSingle(): unknown {
    if (this.table === SESSIONS_TABLE) {
      return { data: this.ctx.sessionRow, error: null };
    }
    if (this.table === QUESTIONS_TABLE) {
      return { data: this.ctx.questionRow, error: null };
    }
    return { data: null, error: null };
  }

  private resolveMany(): unknown {
    // A state-mutating update on the sessions table (e.g. → COMPLETED).
    if (this.table === SESSIONS_TABLE && this.op === 'update') {
      this.ctx.record.sessionStateUpdated = true;
      return { data: null, error: null };
    }

    if (this.table === QUESTIONS_TABLE) {
      // maybeCompleteSession count head query: report all answered.
      if (this.head) {
        return { count: 0, error: null };
      }
      // persistAnswer returning the updated question row.
      if (this.op === 'update') {
        return {
          data: [
            {
              ...this.ctx.questionRow,
              answer_text: 'answer',
              response_latency_seconds: 1,
            },
          ],
          error: null,
        };
      }
      // loadQuestions select-many.
      return { data: [this.ctx.questionRow], error: null };
    }

    return { data: [], error: null };
  }
}

function makeSupabaseStub(ctx: StubContext): SupabaseClient {
  const client = {
    from(table: string): QueryBuilder {
      return new QueryBuilder(table, ctx);
    },
  };
  return client as unknown as SupabaseClient;
}

// --- Transition table ------------------------------------------------------

type Operation = 'start' | 'submitAnswer' | 'evaluate' | 'computeScorecard';

const STATES: readonly LifecycleState[] = [
  'PENDING',
  'ACTIVE',
  'COMPLETED',
  'SCORED',
];
const OPERATIONS: readonly Operation[] = [
  'start',
  'submitAnswer',
  'evaluate',
  'computeScorecard',
];

const ALLOWED: Readonly<Record<Operation, ReadonlySet<LifecycleState>>> = {
  start: new Set<LifecycleState>(['PENDING']),
  submitAnswer: new Set<LifecycleState>(['ACTIVE']),
  evaluate: new Set<LifecycleState>(['COMPLETED', 'SCORED']),
  computeScorecard: new Set<LifecycleState>(['COMPLETED', 'SCORED']),
};

function runOperation(
  operation: Operation,
  supabase: SupabaseClient
): Promise<unknown> {
  switch (operation) {
    case 'start':
      return startSession(supabase, USER_ID, SESSION_ID);
    case 'submitAnswer':
      return submitAnswer(supabase, USER_ID, SESSION_ID, QUESTION_ID, {
        answerText: 'answer',
        responseLatencySeconds: 1,
      });
    case 'evaluate':
      return evaluateAnswer(supabase, USER_ID, SESSION_ID, QUESTION_ID);
    case 'computeScorecard':
      return computeScorecard(supabase, USER_ID, SESSION_ID);
  }
}

// --- Property --------------------------------------------------------------

describe('Interview lifecycle state machine', () => {
  // Feature: interview, Property 7: Session lifecycle honors the state machine
  it('allows only valid (state, operation) pairs and rejects the rest naming the current state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...STATES),
        fc.constantFrom(...OPERATIONS),
        async (state: LifecycleState, operation: Operation) => {
          const record: StubRecord = { sessionStateUpdated: false };
          const ctx: StubContext = {
            sessionRow: makeSessionRow(state),
            questionRow: makeQuestionRow(),
            record,
          };
          const supabase = makeSupabaseStub(ctx);

          if (ALLOWED[operation].has(state)) {
            // Allowed pair: the state guard passes and the (mocked) delegation
            // resolves — no state-guard ValidationError is thrown.
            await expect(runOperation(operation, supabase)).resolves.toBeDefined();
            return;
          }

          // Disallowed pair: rejected with a ValidationError naming the current
          // state, and no session state mutation is performed.
          let thrown: unknown;
          try {
            await runOperation(operation, supabase);
          } catch (error: unknown) {
            thrown = error;
          }

          expect(thrown).toBeInstanceOf(ValidationError);
          expect((thrown as ValidationError).message).toContain(state);
          expect(record.sessionStateUpdated).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
