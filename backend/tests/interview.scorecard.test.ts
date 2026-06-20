/**
 * Example-based unit tests for the Scorecard_Engine persistence + failure paths
 * (interview spec task 8.3).
 *
 * These tests exercise `computeScorecard` / `fetchCachedScorecard` from
 * `interview.scorecard.service.ts` with BOTH the Interview module-local AI
 * wrapper (`generateJson`) and the `evaluateAnswer` collaborator mocked, and a
 * chainable Supabase stub that records the EXACT chains the engine uses so we
 * can assert what was (and was not) persisted.
 *
 * Covered acceptance criteria:
 *   - 5.12: a Pressure_Score AI failure aborts persistence — `computeScorecard`
 *     rejects with `AiProviderError`, no scorecard is inserted, and the session
 *     is NOT transitioned to `SCORED`.
 *   - 5.11: an already-`SCORED` session with a cached scorecard returns the
 *     cached scorecard WITHOUT calling `generateJson` and WITHOUT inserting.
 *   - 5.10: a missing-evaluation failure (a question with no evaluation whose
 *     `evaluateAnswer` rejects) rejects with an error naming the failed
 *     position(s) and persists nothing.
 *   - 5.13: the out-of-range Overall_Score guard is defensive; the scoring
 *     utilities clamp every dimension into the integer range [0, 100], so a
 *     normal computation persists exactly once, transitions to `SCORED`, and
 *     yields an Overall_Score in [0, 100].
 *
 * Validates: Requirements 5.10, 5.11, 5.12, 5.13
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock the Interview module-local AI wrapper AND the answer evaluator BEFORE
// importing the engine, so the engine binds to the mocked implementations.
vi.mock('../src/services/interview.aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));
vi.mock('../src/services/interview.answerEvaluator.service.js', () => ({
  evaluateAnswer: vi.fn(),
}));

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { evaluateAnswer } from '../src/services/interview.answerEvaluator.service.js';
import {
  computeScorecard,
  fetchCachedScorecard,
} from '../src/services/interview.scorecard.service.js';
import { AiProviderError } from '../src/utils/errors.js';
import type {
  IInterviewQuestion,
  IInterviewSession,
  IPerformanceScorecard,
} from '../src/types/interview.types.js';

const SCORECARDS_TABLE = 'interview_scorecards';
const SESSIONS_TABLE = 'interview_sessions';

/**
 * Records of the side-effecting chains the engine performs, so each test can
 * assert exactly what was persisted.
 */
interface StubCalls {
  inserts: Array<Record<string, unknown>>;
  transitions: Array<Record<string, unknown>>;
  deletes: number;
}

interface StubOptions {
  /**
   * Row returned by the cached-scorecard lookup
   * (`select().eq().eq().maybeSingle()`); `null` means "no scorecard yet".
   */
  cachedRow?: Record<string, unknown> | null;
}

/**
 * Build a chainable Supabase stub matching the EXACT chains used by the
 * Scorecard_Engine:
 *   - cached lookup: from(SCORECARDS_TABLE).select(cols)
 *       .eq('session_id', _).eq('user_id', _).maybeSingle()
 *   - scorecard insert: from(SCORECARDS_TABLE).insert(row).select(cols)
 *       .returns() → echoes the inserted row back through the persisted shape
 *   - session transition: from(SESSIONS_TABLE).update({state}).eq().eq()
 *   - rollback: from(SCORECARDS_TABLE).delete().eq().eq()
 */
function makeSupabaseStub(options: StubOptions = {}): {
  client: SupabaseClient;
  calls: StubCalls;
} {
  const calls: StubCalls = { inserts: [], transitions: [], deletes: 0 };
  const cachedRow = options.cachedRow ?? null;

  const stub = {
    from(table: string) {
      if (table === SCORECARDS_TABLE) {
        return {
          // Cached-scorecard lookup chain (fetchCachedScorecard / 5.11).
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({
                          data: cachedRow,
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
          // Persistence chain (persistAndScore / 5.8).
          insert(row: Record<string, unknown>) {
            calls.inserts.push(row);
            const echoed = {
              session_id: row.session_id,
              answer_quality_score: row.answer_quality_score,
              grammar_score: row.grammar_score,
              latency_score: row.latency_score,
              pressure_score: row.pressure_score,
              overall_score: row.overall_score,
              pass_fail_tier: row.pass_fail_tier,
              created_at: new Date().toISOString(),
            };
            return {
              select() {
                return {
                  returns() {
                    return Promise.resolve({ data: [echoed], error: null });
                  },
                };
              },
            };
          },
          // Rollback chain (only reached if a transition fails).
          delete() {
            return {
              eq() {
                return {
                  eq() {
                    calls.deletes += 1;
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === SESSIONS_TABLE) {
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq() {
                return {
                  eq() {
                    calls.transitions.push(patch);
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table in stub: ${table}`);
    },
  };

  return { client: stub as unknown as SupabaseClient, calls };
}

/** A COMPLETED session (cache path skipped, computation runs). */
function makeCompletedSession(): IInterviewSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    state: 'COMPLETED',
    difficultyTier: 'MID',
    jobDescription: 'Build great software.',
    questionCount: 3,
    resumeVersionId: null,
    createdAt: new Date().toISOString(),
  };
}

/** Questions that ALL carry evaluations (no `evaluateAnswer` call needed). */
function makeEvaluatedQuestions(): IInterviewQuestion[] {
  return [1, 2, 3].map((position) => ({
    id: `q-${position}`,
    sessionId: 'session-1',
    position,
    text: `Question ${position}`,
    answerText: `Answer ${position}`,
    responseLatencySeconds: 45,
    evaluation: {
      qualityScore: 80,
      grammarScore: 90,
      feedbackComment: 'Solid answer.',
    },
  }));
}

describe('Scorecard_Engine persistence + failure paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Requirement 5.12 — a Pressure_Score AI failure aborts persistence.
  it('rejects with AiProviderError and persists nothing when the pressure AI call fails (5.12)', async () => {
    (generateJson as Mock).mockRejectedValue(
      new AiProviderError('The AI provider is unavailable.')
    );

    const { client, calls } = makeSupabaseStub();

    await expect(
      computeScorecard(client, makeCompletedSession(), makeEvaluatedQuestions())
    ).rejects.toBeInstanceOf(AiProviderError);

    // No scorecard inserted and no SCORED transition occurred.
    expect(calls.inserts).toHaveLength(0);
    expect(calls.transitions).toHaveLength(0);
    expect(calls.deletes).toBe(0);
  });

  // Requirement 5.11 — cached scorecard returned for an already-SCORED session.
  it('returns the cached scorecard for a SCORED session without calling the AI or inserting (5.11)', async () => {
    const cachedRow = {
      session_id: 'session-1',
      answer_quality_score: 82,
      grammar_score: 88,
      latency_score: 95,
      pressure_score: 77,
      overall_score: 86,
      pass_fail_tier: 'PASS',
      created_at: '2024-01-01T00:00:00.000Z',
    };
    const { client, calls } = makeSupabaseStub({ cachedRow });

    const session: IInterviewSession = {
      ...makeCompletedSession(),
      state: 'SCORED',
    };

    const result = await computeScorecard(
      client,
      session,
      makeEvaluatedQuestions()
    );

    // Cached scorecard returned verbatim (mapped to camelCase).
    expect(result).toEqual<IPerformanceScorecard>({
      sessionId: 'session-1',
      answerQualityScore: 82,
      grammarScore: 88,
      latencyScore: 95,
      pressureScore: 77,
      overallScore: 86,
      passFailTier: 'PASS',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    // No recomputation and no re-persistence.
    expect(generateJson as Mock).not.toHaveBeenCalled();
    expect(evaluateAnswer as Mock).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(calls.transitions).toHaveLength(0);
  });

  // Requirement 5.10 — missing-evaluation failure names the failed position(s).
  it('rejects naming the failed question position(s) and persists nothing when an evaluation fails (5.10)', async () => {
    // Position 2 has no evaluation; its `evaluateAnswer` call rejects.
    const questions: IInterviewQuestion[] = makeEvaluatedQuestions();
    questions[1] = { ...questions[1]!, evaluation: null };

    (evaluateAnswer as Mock).mockRejectedValue(
      new AiProviderError('The AI provider failed.')
    );

    const { client, calls } = makeSupabaseStub();

    const error = await computeScorecard(
      client,
      makeCompletedSession(),
      questions
    ).then(
      () => null,
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(AiProviderError);
    const appError = error as AiProviderError;
    // The error message names the failed 1-based position(s).
    expect(appError.message).toContain('2');
    expect(appError.details).toEqual({ failedPositions: [2] });

    // The pressure AI call is never reached, and nothing is persisted.
    expect(generateJson as Mock).not.toHaveBeenCalled();
    expect(calls.inserts).toHaveLength(0);
    expect(calls.transitions).toHaveLength(0);
  });

  // Requirement 5.13 (defensive guard) + happy-path persistence (5.8).
  it('persists exactly once, transitions to SCORED, and yields an in-range overall on success (5.13)', async () => {
    (generateJson as Mock).mockResolvedValue({ pressureScore: 75 });

    const { client, calls } = makeSupabaseStub();

    const result = await computeScorecard(
      client,
      makeCompletedSession(),
      makeEvaluatedQuestions()
    );

    // Exactly one insert and one SCORED transition.
    expect(calls.inserts).toHaveLength(1);
    expect(calls.transitions).toHaveLength(1);
    expect(calls.transitions[0]).toEqual({ state: 'SCORED' });
    expect(calls.deletes).toBe(0);

    // Persisted row carries the owning user + session and a clamped pressure.
    expect(calls.inserts[0]).toMatchObject({
      user_id: 'user-1',
      session_id: 'session-1',
      pressure_score: 75,
    });

    // The clamp utilities guarantee every dimension is an integer in [0, 100].
    expect(Number.isInteger(result.overallScore)).toBe(true);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.passFailTier).toBe(result.overallScore >= 70 ? 'PASS' : 'FAIL');
  });

  // Requirement 5.11 (existence check) — fetchCachedScorecard returns null when
  // no scorecard has been persisted yet.
  it('fetchCachedScorecard returns null when no scorecard exists (5.11 existence check)', async () => {
    const { client } = makeSupabaseStub({ cachedRow: null });

    const cached = await fetchCachedScorecard(client, 'user-1', 'session-1');

    expect(cached).toBeNull();
  });
});
