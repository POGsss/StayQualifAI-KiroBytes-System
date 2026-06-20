/**
 * Interview deterministic scoring utilities (Requirements 5.2, 5.3, 5.4, 5.6, 5.7).
 *
 * Pure, side-effect-free functions used by the Scorecard_Engine to compute the
 * deterministic dimensions of a Performance_Scorecard. None of these functions
 * perform network access, I/O, or any mutation of their inputs.
 *
 * The Pressure_Score dimension is NOT computed here — it requires an AI call and
 * lives in the Scorecard_Engine; this module only provides the `clamp` helper it
 * reuses to bound the AI-returned value.
 *
 * Rounding is performed with `Math.round` (round half toward +Infinity). All
 * returned scores are integers in the closed range [0, 100].
 *
 * Empty-array handling: the Scorecard_Engine guarantees a non-empty question set
 * before invoking these aggregations (a session has between 5 and 15 questions).
 * Defensively, `meanScore` and `sessionLatencyScore` return 0 for an empty input
 * rather than producing `NaN`, so a degenerate call can never yield an
 * out-of-range or non-integer score.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import type { PassFailTier } from '../types/interview.types.js';

/** Inclusive lower bound for every scoring dimension. */
const SCORE_MIN = 0;
/** Inclusive upper bound for every scoring dimension. */
const SCORE_MAX = 100;

/** Latency at or below which a response scores the maximum (Requirement 5.4). */
const LATENCY_FAST_THRESHOLD_SECONDS = 60;
/** Latency at or above which a response scores the minimum (Requirement 5.4). */
const LATENCY_SLOW_THRESHOLD_SECONDS = 180;
/** Width of the linear interpolation window (180 - 60). */
const LATENCY_INTERPOLATION_WINDOW_SECONDS =
  LATENCY_SLOW_THRESHOLD_SECONDS - LATENCY_FAST_THRESHOLD_SECONDS;

/** Overall score at or above which a session is graded `PASS` (Requirement 5.7). */
const PASS_THRESHOLD = 70;

/**
 * The four deterministic-plus-pressure dimension scores aggregated into the
 * Overall_Score. Each value is expected to already be an integer in [0, 100];
 * `overallScore` clamps the result defensively regardless.
 */
export interface IOverallScoreInput {
  answerQualityScore: number;
  grammarScore: number;
  latencyScore: number;
  pressureScore: number;
}

/**
 * Round a number to the nearest integer and clamp it into the inclusive range
 * [0, 100]. This is the single bounding helper reused across every dimension
 * (and by the Scorecard_Engine for the AI-returned Pressure_Score) so that no
 * dimension can ever escape the valid range (Requirement 5.5 clamping intent).
 */
export function clamp(value: number): number {
  const rounded = Math.round(value);

  if (rounded < SCORE_MIN) {
    return SCORE_MIN;
  }

  if (rounded > SCORE_MAX) {
    return SCORE_MAX;
  }

  return rounded;
}

/**
 * Per-question Latency_Score (Requirement 5.4).
 *
 * - responses within 60 seconds score 100;
 * - responses at or beyond 180 seconds score 0;
 * - responses in between interpolate linearly from 100 down to 0, rounded.
 *
 * Anchors: `perQuestionLatencyScore(60) === 100`,
 * `perQuestionLatencyScore(120) === 50`, `perQuestionLatencyScore(180) === 0`.
 */
export function perQuestionLatencyScore(t: number): number {
  if (t <= LATENCY_FAST_THRESHOLD_SECONDS) {
    return SCORE_MAX;
  }

  if (t >= LATENCY_SLOW_THRESHOLD_SECONDS) {
    return SCORE_MIN;
  }

  const interpolated =
    (SCORE_MAX * (LATENCY_SLOW_THRESHOLD_SECONDS - t)) /
    LATENCY_INTERPOLATION_WINDOW_SECONDS;

  return clamp(interpolated);
}

/**
 * Session Latency_Score (Requirement 5.4): the rounded arithmetic mean of the
 * per-question latency scores derived from each response's latency in seconds.
 *
 * Returns 0 for an empty input (see module-level empty-array note).
 */
export function sessionLatencyScore(latencies: readonly number[]): number {
  if (latencies.length === 0) {
    return SCORE_MIN;
  }

  const total = latencies.reduce(
    (sum, latency) => sum + perQuestionLatencyScore(latency),
    0
  );

  return clamp(total / latencies.length);
}

/**
 * Rounded arithmetic mean of a set of dimension scores, used for the
 * Answer_Quality_Score and Grammar_Score aggregations (Requirements 5.2, 5.3).
 *
 * Returns 0 for an empty input (see module-level empty-array note).
 */
export function meanScore(scores: readonly number[]): number {
  if (scores.length === 0) {
    return SCORE_MIN;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);

  return clamp(total / scores.length);
}

/**
 * Overall_Score (Requirement 5.6): the rounded arithmetic mean of the four
 * dimension scores (answer quality, grammar, latency, pressure), clamped into
 * [0, 100].
 */
export function overallScore(four: IOverallScoreInput): number {
  const total =
    four.answerQualityScore +
    four.grammarScore +
    four.latencyScore +
    four.pressureScore;

  return clamp(total / 4);
}

/**
 * Pass_Fail_Tier (Requirement 5.7): `PASS` when the Overall_Score is greater
 * than or equal to 70, otherwise `FAIL`.
 */
export function passFailTier(overall: number): PassFailTier {
  return overall >= PASS_THRESHOLD ? 'PASS' : 'FAIL';
}
