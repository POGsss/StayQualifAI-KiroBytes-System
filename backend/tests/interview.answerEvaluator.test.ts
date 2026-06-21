/**
 * Example-based unit tests for the Answer_Evaluator guards and failure handling
 * (interview spec task 7.2).
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 *
 * These tests pin down the evaluator's guard and persistence behavior with
 * concrete, example-driven cases:
 *   1. No-answer question (`answerText === null`) → rejects with
 *      `ValidationError`; no update is performed and the AI is never called
 *      (Requirement 4.3).
 *   2. Wrong-state session (e.g. `ACTIVE` / `PENDING`) → rejects with
 *      `ValidationError`; no update, no AI call (Requirement 4.4).
 *   3. AI failure (`generateJson` rejects with `AiProviderError`) → rejects
 *      with `AiProviderError`; nothing is persisted (Requirement 4.5).
 *   4. Valid evaluation → resolves with the persisted `IAnswerEvaluation`; the
 *      question row is updated exactly once with
 *      `quality_score`/`grammar_score`/`feedback_comment`, overwriting any
 *      prior evaluation (Requirement 4.2).
 *
 * The module-local AI wrapper (`generateJson`) is mocked so the test exercises
 * the evaluator's own guard / persistence logic rather than Gemini. The
 * Supabase client is a chainable stub that records the exact update chain
 * (`update().eq('id').eq('user_id').select().returns()`) so each test can
 * assert what was (or was not) persisted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IInterviewQuestion,
  IInterviewSession,
  LifecycleState,
} from '../src/types/interview.types.js';
import { AiProviderError, ValidationError } from '../src/utils/errors.js';

// Mock the module-local AI wrapper so `generateJson` returns a controlled
// payload (or rejects), letting us drive both well-formed and deliberately
// failing responses straight into the evaluator.
vi.mock('../src/services/interview.aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { evaluateAnswer } from '../src/services/interview.answerEvaluator.service.js';

const mockedGenerateJson = vi.mocked(generateJson);

/** Records the persistence operations the evaluator performs on Supabase. */
interface PersistenceCalls {
  /** How many times `interview_questions.update(...)` was invoked. */
  updateCount: number;
  /** The payload passed to the most recent update (or null if never called). */
  updatePayload: {
    quality_score: number;
    grammar_score: number;
    feedback_comment: string;
  } | null;
  /** The `.eq('id', ...)` / `.eq('user_id', ...)` filters recorded in order. */
  eqFilters: Array<{ column: string; value: unknown }>;
}

/**
 * Build a chainable Supabase stub mirroring the exact update chain used by the
 * Answer_Evaluator's `persistEvaluation`:
 *   from(t).update(payload).eq('id', qId).eq('user_id', uId)
 *     .select(cols).returns() → { data, error }
 *
 * The returned row echoes the persisted payload back so the evaluator can map
 * it to the domain `IAnswerEvaluation`. `rowFound` controls whether a row is
 * returned (true) or an empty set is returned (false, → NotFoundError).
 */
function createMockSupabase(rowFound = true): {
  client: SupabaseClient;
  calls: PersistenceCalls;
} {
  const calls: PersistenceCalls = {
    updateCount: 0,
    updatePayload: null,
    eqFilters: [],
  };

  const client = {
    from(_table: string) {
      return {
        update(payload: {
          quality_score: number;
          grammar_score: number;
          feedback_comment: string;
        }) {
          calls.updateCount += 1;
          calls.updatePayload = payload;
          const chain = {
            eq(column: string, value: unknown) {
              calls.eqFilters.push({ column, value });
              return chain;
            },
            select(_columns: string) {
              return {
                returns() {
                  const data = rowFound
                    ? [
                        {
                          quality_score: payload.quality_score,
                          grammar_score: payload.grammar_score,
                          feedback_comment: payload.feedback_comment,
                        },
                      ]
                    : [];
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
          return chain;
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

/** Construct a session in the given lifecycle state. */
function makeSession(state: LifecycleState): IInterviewSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    state,
    difficultyTier: 'MID',
    jobDescription: 'Build and operate a scalable web service.',
    questionCount: 8,
    resumeVersionId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/** Construct a question with the given stored answer and prior evaluation. */
function makeQuestion(
  answerText: string | null,
  evaluation: IInterviewQuestion['evaluation'] = null
): IInterviewQuestion {
  return {
    id: 'question-1',
    sessionId: 'session-1',
    position: 1,
    text: 'Describe a time you resolved a production incident under pressure.',
    answerText,
    responseLatencySeconds: answerText === null ? null : 42,
    evaluation,
  };
}

describe('Answer_Evaluator guards and failure handling (task 7.2)', () => {
  beforeEach(() => {
    mockedGenerateJson.mockReset();
  });

  it('rejects a question with no stored answer with ValidationError; no AI call and no update (Req 4.3)', async () => {
    const { client, calls } = createMockSupabase();
    const session = makeSession('COMPLETED');
    const question = makeQuestion(null);

    await expect(
      evaluateAnswer(client, session, question)
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockedGenerateJson).not.toHaveBeenCalled();
    expect(calls.updateCount).toBe(0);
    expect(calls.updatePayload).toBeNull();
  });

  it('rejects a wrong-state (ACTIVE) session with ValidationError before any AI call or update (Req 4.4)', async () => {
    const { client, calls } = createMockSupabase();
    const session = makeSession('ACTIVE');
    const question = makeQuestion('A thorough, well-structured answer.');

    await expect(
      evaluateAnswer(client, session, question)
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockedGenerateJson).not.toHaveBeenCalled();
    expect(calls.updateCount).toBe(0);
  });

  it('rejects a wrong-state (PENDING) session with ValidationError before any AI call or update (Req 4.4)', async () => {
    const { client, calls } = createMockSupabase();
    const session = makeSession('PENDING');
    const question = makeQuestion('A thorough, well-structured answer.');

    await expect(
      evaluateAnswer(client, session, question)
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockedGenerateJson).not.toHaveBeenCalled();
    expect(calls.updateCount).toBe(0);
  });

  it('propagates AiProviderError when the provider fails, persisting nothing (Req 4.5)', async () => {
    mockedGenerateJson.mockRejectedValue(
      new AiProviderError('The AI provider request failed.')
    );
    const { client, calls } = createMockSupabase();
    const session = makeSession('COMPLETED');
    const question = makeQuestion('A thorough, well-structured answer.');

    await expect(
      evaluateAnswer(client, session, question)
    ).rejects.toBeInstanceOf(AiProviderError);

    // AI was contacted, but persistence never ran → nothing overwritten.
    expect(mockedGenerateJson).toHaveBeenCalledTimes(1);
    expect(calls.updateCount).toBe(0);
    expect(calls.updatePayload).toBeNull();
  });

  it('persists a valid evaluation exactly once, overwriting any prior evaluation, and resolves with it (Req 4.2)', async () => {
    const aiEvaluation = {
      qualityScore: 88,
      grammarScore: 91,
      feedbackComment: 'Strong, structured answer with concrete metrics.',
    };
    mockedGenerateJson.mockResolvedValue(aiEvaluation);
    const { client, calls } = createMockSupabase();
    const session = makeSession('SCORED');
    // Question already carries a prior (stale) evaluation that must be overwritten.
    const priorEvaluation = {
      qualityScore: 40,
      grammarScore: 50,
      feedbackComment: 'Old feedback that should be replaced.',
    };
    const question = makeQuestion(
      'A thorough, well-structured answer with concrete examples.',
      priorEvaluation
    );

    const result = await evaluateAnswer(client, session, question);

    // Resolves with the new evaluation (not the prior one).
    expect(result).toEqual(aiEvaluation);
    expect(result).not.toEqual(priorEvaluation);

    // Persisted exactly once with the new scores/feedback (overwrite semantics).
    expect(calls.updateCount).toBe(1);
    expect(calls.updatePayload).toEqual({
      quality_score: aiEvaluation.qualityScore,
      grammar_score: aiEvaluation.grammarScore,
      feedback_comment: aiEvaluation.feedbackComment,
    });

    // Update was scoped to the question id and owning user id.
    expect(calls.eqFilters).toEqual([
      { column: 'id', value: question.id },
      { column: 'user_id', value: session.userId },
    ]);
  });
});
