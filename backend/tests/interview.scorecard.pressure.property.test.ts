/**
 * Property-based test for the Scorecard_Engine Pressure_Score clamping
 * (interview spec task 8.2).
 *
 * Feature: interview, Property 5: Pressure score is clamped regardless of AI output
 *
 * Property 5 — Pressure score is clamped regardless of AI output:
 *   No matter what numeric value the AI_Provider returns for the Pressure_Score
 *   (negative, greater than 100, or fractional), the Pressure_Score carried by
 *   the computed (and persisted) `IPerformanceScorecard` is always an integer
 *   in the inclusive range [0, 100], equal to clamp(g) = min(100, max(0,
 *   Math.round(g))).
 *
 * Strategy: the Interview module-local AI wrapper (`generateJson`) is mocked so
 * the Pressure_Score AI call resolves `{ pressureScore: g }` for a generated
 * finite number `g`. All questions already carry evaluations (so no
 * `evaluateAnswer` call is needed), the session is `COMPLETED`, and a chainable
 * Supabase stub echoes the inserted scorecard row back (so `mapRow` reflects the
 * persisted, clamped `pressure_score`) and succeeds on the session transition.
 *
 * Validates: Requirements 5.5
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock the Interview module-local AI wrapper BEFORE importing the engine.
vi.mock('../src/services/interview.aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { computeScorecard } from '../src/services/interview.scorecard.service.js';
import { clamp } from '../src/utils/interview.scoring.js';
import type {
  IInterviewQuestion,
  IInterviewSession,
} from '../src/types/interview.types.js';

const SCORECARDS_TABLE = 'interview_scorecards';
const SESSIONS_TABLE = 'interview_sessions';

/**
 * Build a chainable Supabase stub matching the EXACT chains the
 * Scorecard_Engine uses:
 *   - scorecard insert: from(SCORECARDS_TABLE).insert(row).select(cols)
 *       .returns() → { data: [echoedRow], error: null } (echoes pressure_score)
 *   - session transition: from(SESSIONS_TABLE).update({state}).eq().eq()
 *       → { error: null }
 */
function makeSupabaseStub(): SupabaseClient {
  const stub = {
    from(table: string) {
      if (table === SCORECARDS_TABLE) {
        return {
          insert(row: Record<string, unknown>) {
            // Echo the inserted row back through the persisted-row shape so the
            // returned scorecard reflects the clamped pressure_score.
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
        };
      }
      if (table === SESSIONS_TABLE) {
        return {
          update() {
            return {
              eq() {
                return {
                  eq() {
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
  return stub as unknown as SupabaseClient;
}

/** A COMPLETED session so the cache path is skipped and computation runs. */
function makeSession(): IInterviewSession {
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

/**
 * Questions that ALL already carry evaluations with valid latencies, so
 * `resolveEvaluations` never calls `evaluateAnswer`.
 */
function makeQuestions(): IInterviewQuestion[] {
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

describe('Scorecard_Engine Pressure_Score clamping (Property 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Feature: interview, Property 5: Pressure score is clamped regardless of AI output
  it('clamps the AI-returned pressure score to an integer in [0, 100]', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Finite numbers: negative, > 100, and fractional values.
        fc.double({
          min: -1000,
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        async (g) => {
          (generateJson as Mock).mockResolvedValue({ pressureScore: g });

          const scorecard = await computeScorecard(
            makeSupabaseStub(),
            makeSession(),
            makeQuestions()
          );

          // Normalize signed zero: -0 and +0 are equal as integer scores;
          // only Object.is-based `toBe` distinguishes them (adding 0 maps
          // -0 -> +0 without affecting any other value).
          const actual = scorecard.pressureScore + 0;
          const expected = Math.min(100, Math.max(0, Math.round(g))) + 0;

          // Returned (and persisted) pressure score equals clamp(g)...
          expect(actual).toBe(expected);
          expect(actual).toBe(clamp(g) + 0);
          // ...and is an integer within the inclusive range [0, 100].
          expect(Number.isInteger(scorecard.pressureScore)).toBe(true);
          expect(scorecard.pressureScore).toBeGreaterThanOrEqual(0);
          expect(scorecard.pressureScore).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
});
