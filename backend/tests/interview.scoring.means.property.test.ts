/**
 * Property-based tests for the Interview answer-quality / grammar mean scoring
 * (interview spec task 4.6).
 *
 * Property 3: Answer-quality and grammar means are bounded integers
 * (Requirements 5.2, 5.3).
 *
 * `meanScore(scores)` aggregates the per-question quality scores into the
 * Answer_Quality_Score (Requirement 5.2) and the per-question grammar scores
 * into the Grammar_Score (Requirement 5.3) using the same rounded-mean function.
 *
 * Over a non-empty array of integer dimension scores in [0, 100]:
 *   - `meanScore` is always an integer in [0, 100];
 *   - `meanScore` equals `Math.round(sum / length)`.
 *
 * Uses fast-check (3.23.2) with a minimum of 100 iterations.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { meanScore } from '../src/utils/interview.scoring.js';

const RUNS = 100;

/** Non-empty array of integer dimension scores in [0, 100]. */
const arbScores = fc.array(fc.integer({ min: 0, max: 100 }), {
  minLength: 1,
  maxLength: 15,
});

const isIntInRange = (n: number): boolean =>
  Number.isInteger(n) && n >= 0 && n <= 100;

describe('Interview quality/grammar mean scoring (Property 3)', () => {
  // Feature: interview, Property 3: Answer-quality and grammar means are bounded integers
  it('meanScore over a non-empty score array is an integer in [0, 100]', () => {
    fc.assert(
      fc.property(arbScores, (scores) => {
        expect(isIntInRange(meanScore(scores))).toBe(true);
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 3: Answer-quality and grammar means are bounded integers
  it('meanScore equals round(sum / length) for both quality and grammar aggregations', () => {
    fc.assert(
      fc.property(arbScores, (scores) => {
        const sum = scores.reduce((acc, score) => acc + score, 0);
        const expected = Math.round(sum / scores.length);
        expect(meanScore(scores)).toBe(expected);
      }),
      { numRuns: RUNS }
    );
  });
});
