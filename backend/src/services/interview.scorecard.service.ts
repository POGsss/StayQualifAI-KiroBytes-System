/**
 * Scorecard_Engine (Requirements 5.1, 5.5, 5.8, 5.10, 5.11, 5.12, 5.13).
 *
 * Aggregates the per-question `Answer_Evaluations` of a `COMPLETED` (or already
 * `SCORED`) `Interview_Session` into a single {@link IPerformanceScorecard}.
 *
 * Computation order (design "Scorecard_Engine"), all deterministic except the
 * Pressure_Score:
 *   1. If the session is already `SCORED` and a scorecard exists, return the
 *      cached scorecard WITHOUT recomputation (Requirement 5.11).
 *   2. Ensure every question has an evaluation; evaluate any missing ones first
 *      via {@link evaluateAnswer}. If ANY evaluation fails, throw an error that
 *      names the failed question positions and persist NOTHING (Requirement
 *      5.10).
 *   3. Answer_Quality_Score = rounded mean of all `qualityScore` (5.2);
 *      Grammar_Score = rounded mean of all `grammarScore` (5.3);
 *      Latency_Score = session latency score over all latencies (5.4);
 *      Pressure_Score = a single AI call over the ordered
 *      `(position, qualityScore, grammarScore)` sequence, with
 *      `Math.round(pressureScore)` clamped into [0, 100] (5.5);
 *      Overall_Score = rounded mean of the four dimensions (5.6);
 *      Pass_Fail_Tier = PASS iff Overall_Score >= 70 (5.7).
 *   4. Persist the scorecard and transition the session to `SCORED` ONLY when
 *      every step succeeds and Overall_Score is an integer in [0, 100];
 *      otherwise persist nothing and surface an error (Requirements 5.8, 5.12,
 *      5.13).
 *
 * Failure contract:
 *   - Any AI_Provider failure during the Pressure_Score call is normalized to
 *     {@link AiProviderError} by {@link generateJson}; because persistence
 *     happens strictly AFTER a successful computation, such a failure persists
 *     nothing (Requirement 5.12).
 *   - A missing-evaluation failure throws naming the failed positions and
 *     persists nothing (Requirement 5.10).
 *   - An out-of-range / non-integer Overall_Score aborts persistence
 *     (Requirement 5.13).
 *
 * Module isolation: this file imports NO Resume module code and reaches Gemini
 * only through the Interview module-local wrapper (design "Module Isolation").
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  IAnswerEvaluation,
  IInterviewQuestion,
  IInterviewSession,
  IPerformanceScorecard,
  PassFailTier,
} from '../types/interview.types.js';
import { AiProviderError, InternalError } from '../utils/errors.js';
import {
  clamp,
  meanScore,
  overallScore,
  passFailTier,
  sessionLatencyScore,
} from '../utils/interview.scoring.js';
import { generateJson } from './interview.aiProvider.service.js';
import { evaluateAnswer } from './interview.answerEvaluator.service.js';

/** Per-call timeout (ms) for the Pressure_Score AI call (Requirement 5.12). */
const PRESSURE_TIMEOUT_MS = 30_000;

/** Table holding the one-per-session `Performance_Scorecards`. */
const SCORECARDS_TABLE = 'interview_scorecards';

/** Table holding the `Interview_Sessions` whose state we transition. */
const SESSIONS_TABLE = 'interview_sessions';

/** Columns selected/returned for a persisted scorecard row. */
const SCORECARD_COLUMNS =
  'session_id, answer_quality_score, grammar_score, latency_score, pressure_score, overall_score, pass_fail_tier, created_at';

/** Inclusive lower bound for the Overall_Score validity check (Requirement 5.13). */
const OVERALL_MIN = 0;
/** Inclusive upper bound for the Overall_Score validity check (Requirement 5.13). */
const OVERALL_MAX = 100;

/**
 * Schema the parsed Gemini Pressure_Score JSON response must satisfy (design
 * "Pressure_Score prompt contract"). The raw `pressureScore` is intentionally
 * permissive (any number); the engine rounds and clamps it into [0, 100]
 * regardless of what the provider returns (Requirement 5.5).
 */
export const pressureSchema = z.object({ pressureScore: z.number() });

/**
 * The raw `interview_scorecards` row shape as returned by Supabase
 * (`snake_case`).
 */
interface InterviewScorecardRow {
  session_id: string;
  answer_quality_score: number;
  grammar_score: number;
  latency_score: number;
  pressure_score: number;
  overall_score: number;
  pass_fail_tier: PassFailTier;
  created_at: string;
}

/**
 * A single per-question entry of the ordered sequence the Pressure_Score AI
 * call reasons over, plus the latency used by the deterministic Latency_Score.
 */
interface ResolvedQuestionScore {
  position: number;
  qualityScore: number;
  grammarScore: number;
  latencySeconds: number;
}

/**
 * Fetch the cached {@link IPerformanceScorecard} for a session, RLS-scoped to
 * the owning user. Returns `null` when no scorecard has been persisted yet
 * (Requirement 5.11 existence check).
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id (defensive filter alongside RLS).
 * @param sessionId The session whose scorecard is requested.
 * @returns The persisted scorecard, or `null` when none exists.
 * @throws {InternalError} when the lookup fails for a system reason.
 */
export async function fetchCachedScorecard(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IPerformanceScorecard | null> {
  const { data, error } = await supabase
    .from(SCORECARDS_TABLE)
    .select(SCORECARD_COLUMNS)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<InterviewScorecardRow>();

  if (error !== null) {
    throw new InternalError(
      'Failed to load the performance scorecard.',
      error.message
    );
  }
  if (data === null) {
    return null;
  }

  return mapRow(data);
}

/**
 * Compute (or return the cached) {@link IPerformanceScorecard} for a session.
 *
 * The caller (the service facade) is responsible for loading the session and
 * its questions RLS-scoped to the requesting user, for verifying the session is
 * in `COMPLETED`/`SCORED` state (Requirement 5.9), and for mapping RLS no-rows
 * to a not-found error; this function performs the aggregation, the Pressure
 * AI call, the validity check, and the all-or-nothing persistence.
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param session   The owning `COMPLETED`/`SCORED` session.
 * @param questions The session's questions (any order; sorted internally by
 *   1-based position before scoring).
 * @returns The computed (or cached) {@link IPerformanceScorecard}.
 * @throws {AiProviderError} when one or more per-question evaluations fail
 *   (naming the failed positions — Requirement 5.10) or when the Pressure_Score
 *   AI call fails (Requirement 5.12); nothing is persisted in either case.
 * @throws {InternalError} when the computed Overall_Score is out of range
 *   (Requirement 5.13) or when persistence / the state transition fails.
 */
export async function computeScorecard(
  supabase: SupabaseClient,
  session: IInterviewSession,
  questions: IInterviewQuestion[]
): Promise<IPerformanceScorecard> {
  // Step 1: already SCORED with an existing scorecard → return cached (5.11).
  if (session.state === 'SCORED') {
    const cached: IPerformanceScorecard | null = await fetchCachedScorecard(
      supabase,
      session.userId,
      session.id
    );
    if (cached !== null) {
      return cached;
    }
  }

  const ordered: IInterviewQuestion[] = [...questions].sort(
    (a: IInterviewQuestion, b: IInterviewQuestion) => a.position - b.position
  );

  // Step 2: ensure every question has an evaluation; evaluate missing ones.
  const resolved: ResolvedQuestionScore[] = await resolveEvaluations(
    supabase,
    session,
    ordered
  );

  // Step 3: deterministic dimensions (5.2, 5.3, 5.4).
  const answerQualityScore: number = meanScore(
    resolved.map((entry: ResolvedQuestionScore) => entry.qualityScore)
  );
  const grammarScore: number = meanScore(
    resolved.map((entry: ResolvedQuestionScore) => entry.grammarScore)
  );
  const latencyScore: number = sessionLatencyScore(
    resolved.map((entry: ResolvedQuestionScore) => entry.latencySeconds)
  );

  // Pressure_Score via a single AI call, rounded + clamped into [0, 100] (5.5).
  const pressureScore: number = await computePressureScore(resolved);

  // Overall_Score and Pass_Fail_Tier (5.6, 5.7).
  const overall: number = overallScore({
    answerQualityScore,
    grammarScore,
    latencyScore,
    pressureScore,
  });

  // Step 4 guard: abort persistence on an out-of-range / non-integer overall
  // (Requirement 5.13). The scoring helpers clamp to an integer in [0, 100], so
  // this is a defensive check that never persists a partial scorecard.
  if (
    !Number.isInteger(overall) ||
    overall < OVERALL_MIN ||
    overall > OVERALL_MAX
  ) {
    throw new InternalError(
      'The scorecard could not be computed: the overall score was out of range.',
      { overall }
    );
  }

  const tier: PassFailTier = passFailTier(overall);

  // Step 4: persist + transition to SCORED only now that everything succeeded.
  return persistAndScore(supabase, session, {
    sessionId: session.id,
    answerQualityScore,
    grammarScore,
    latencyScore,
    pressureScore,
    overallScore: overall,
    passFailTier: tier,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Ensure every question carries an evaluation, evaluating any missing ones via
 * {@link evaluateAnswer} BEFORE any score is computed (Requirement 5.10). Every
 * unevaluated question is attempted so the error can name ALL failed positions
 * at once; if one or more fail, an {@link AiProviderError} is thrown naming the
 * failed 1-based positions and nothing is persisted.
 */
async function resolveEvaluations(
  supabase: SupabaseClient,
  session: IInterviewSession,
  ordered: IInterviewQuestion[]
): Promise<ResolvedQuestionScore[]> {
  const resolved: ResolvedQuestionScore[] = [];
  const failedPositions: number[] = [];

  for (const question of ordered) {
    let evaluation: IAnswerEvaluation | null = question.evaluation;

    if (evaluation === null) {
      try {
        evaluation = await evaluateAnswer(supabase, session, question);
      } catch {
        // Record the failed position and continue so we can name every failure.
        failedPositions.push(question.position);
        continue;
      }
    }

    resolved.push({
      position: question.position,
      qualityScore: evaluation.qualityScore,
      grammarScore: evaluation.grammarScore,
      latencySeconds: question.responseLatencySeconds ?? 0,
    });
  }

  if (failedPositions.length > 0) {
    throw new AiProviderError(
      `Evaluation failed for question position(s): ${failedPositions.join(', ')}.`,
      { failedPositions }
    );
  }

  return resolved;
}

/**
 * Compute the Pressure_Score with a single AI call over the ordered
 * `(position, qualityScore, grammarScore)` sequence, then round and clamp the
 * returned value into the integer range [0, 100] (Requirement 5.5). Any
 * provider failure is normalized to {@link AiProviderError} by
 * {@link generateJson} and propagates so nothing is persisted (Requirement
 * 5.12).
 */
async function computePressureScore(
  resolved: ResolvedQuestionScore[]
): Promise<number> {
  const sequence = resolved.map((entry: ResolvedQuestionScore) => ({
    position: entry.position,
    qualityScore: entry.qualityScore,
    grammarScore: entry.grammarScore,
  }));

  const result = await generateJson({
    prompt: buildPressurePrompt(sequence),
    schema: pressureSchema,
    systemInstruction: buildPressureSystemInstruction(),
    timeoutMs: PRESSURE_TIMEOUT_MS,
  });

  // `clamp` rounds with Math.round and bounds into [0, 100] (Requirement 5.5).
  return clamp(result.pressureScore);
}

/**
 * Persist the computed scorecard and transition the session `→ SCORED` as the
 * final all-or-nothing step (Requirement 5.8). The scorecard is inserted first;
 * if the subsequent state transition fails, the inserted scorecard is removed
 * so the session is left unchanged with nothing persisted.
 */
async function persistAndScore(
  supabase: SupabaseClient,
  session: IInterviewSession,
  scorecard: IPerformanceScorecard
): Promise<IPerformanceScorecard> {
  const { data, error } = await supabase
    .from(SCORECARDS_TABLE)
    .insert({
      user_id: session.userId,
      session_id: session.id,
      answer_quality_score: scorecard.answerQualityScore,
      grammar_score: scorecard.grammarScore,
      latency_score: scorecard.latencyScore,
      pressure_score: scorecard.pressureScore,
      overall_score: scorecard.overallScore,
      pass_fail_tier: scorecard.passFailTier,
    })
    .select(SCORECARD_COLUMNS)
    .returns<InterviewScorecardRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to persist the performance scorecard.',
      error.message
    );
  }
  const row: InterviewScorecardRow | undefined =
    data !== null ? data[0] : undefined;
  if (row === undefined) {
    throw new InternalError(
      'The performance scorecard was not returned after persistence.'
    );
  }

  const { error: transitionError } = await supabase
    .from(SESSIONS_TABLE)
    .update({ state: 'SCORED' })
    .eq('id', session.id)
    .eq('user_id', session.userId);

  if (transitionError !== null) {
    // Roll back the inserted scorecard so nothing is persisted on failure.
    await supabase
      .from(SCORECARDS_TABLE)
      .delete()
      .eq('session_id', session.id)
      .eq('user_id', session.userId);
    throw new InternalError(
      'Failed to transition the session to SCORED.',
      transitionError.message
    );
  }

  return mapRow(row);
}

/**
 * Build the system instruction steering Gemini to assess pressure handling and
 * to return only the agreed `{ pressureScore }` JSON shape (Requirement 5.5).
 */
function buildPressureSystemInstruction(): string {
  return [
    'You are an expert interview coach assessing how well a candidate handled',
    'pressure across an interview. You are given the ordered per-question',
    'quality and grammar scores. Return 100 when performance was fully',
    'sustained or improved across the session, 0 when it consistently',
    'declined, and a linearly-interpolated value in between. Respond ONLY with',
    'a JSON object of the shape { "pressureScore": integer 0-100 } and nothing',
    'else.',
  ].join(' ');
}

/**
 * Compose the Pressure_Score prompt from the ordered per-question sequence.
 */
function buildPressurePrompt(
  sequence: ReadonlyArray<{
    position: number;
    qualityScore: number;
    grammarScore: number;
  }>
): string {
  return [
    'Assess how the candidate sustained performance across the session given',
    'the ordered per-question scores below (indexed by 1-based position).',
    '',
    'Ordered per-question scores (JSON):',
    JSON.stringify(sequence),
    '',
    'Return a single pressureScore (integer 0-100) in the agreed JSON shape.',
  ].join('\n');
}

/**
 * Map a raw `interview_scorecards` row (`snake_case`) to the camelCase
 * {@link IPerformanceScorecard} domain object.
 */
function mapRow(row: InterviewScorecardRow): IPerformanceScorecard {
  return {
    sessionId: row.session_id,
    answerQualityScore: row.answer_quality_score,
    grammarScore: row.grammar_score,
    latencyScore: row.latency_score,
    pressureScore: row.pressure_score,
    overallScore: row.overall_score,
    passFailTier: row.pass_fail_tier,
    createdAt: row.created_at,
  };
}
