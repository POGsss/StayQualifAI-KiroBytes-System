/**
 * Property-based tests for the Interview overall scoring and pass/fail tier
 * (interview spec task 4.7).
 *
 * Property 4: Overall score is the bounded mean of the four dimensions and
 * determines the pass/fail tier (Requirements 5.6, 5.7).
 *
 * `overallScore({ answerQualityScore, grammarScore, latencyScore,
 * pressureScore })`:
 *   - is always an integer in [0, 100];
 *   - equals `Math.round((a + b + c + d) / 4)`.
 *
 * `passFailTier(overall)`:
 *   - returns `'PASS'` iff `overall >= 70`, otherwise `'FAIL'`;
 *   - the boundary is exercised explicitly at 69 (FAIL), 70 (PASS), 71 (PASS).
 *
 * Uses fast-check (3.23.2) with a minimum of 100 iterations.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  overallScore,
  passFailTier,
} from '../src/utils/interview.scoring.js';

const RUNS = 100;

/** Integer dimension score in [0, 100]. */
const arbDimension = fc.integer({ min: 0, max: 100 });

const isIntInRange = (n: number): boolean =>
  Number.isInteger(n) && n >= 0 && n <= 100;

describe('Interview overall scoring and pass/fail tier (Property 4)', () => {
  // Feature: interview, Property 4: Overall score is the bounded mean of the four dimensions and determines the pass/fail tier
  it('overallScore is an integer in [0, 100] and equals round((a + b + c + d) / 4)', () => {
    fc.assert(
      fc.property(
        arbDimension,
        arbDimension,
        arbDimension,
        arbDimension,
        (answerQualityScore, grammarScore, latencyScore, pressureScore) => {
          const overall = overallScore({
            answerQualityScore,
            grammarScore,
            latencyScore,
            pressureScore,
          });
          const expected = Math.round(
            (answerQualityScore +
              grammarScore +
              latencyScore +
              pressureScore) /
              4
          );

          expect(isIntInRange(overall)).toBe(true);
          expect(overall).toBe(expected);
        }
      ),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 4: Overall score is the bounded mean of the four dimensions and determines the pass/fail tier
  it('passFailTier(overallScore(...)) is PASS iff the overall score is >= 70', () => {
    fc.assert(
      fc.property(
        arbDimension,
        arbDimension,
        arbDimension,
        arbDimension,
        (answerQualityScore, grammarScore, latencyScore, pressureScore) => {
          const overall = overallScore({
            answerQualityScore,
            grammarScore,
            latencyScore,
            pressureScore,
          });
          const expected = overall >= 70 ? 'PASS' : 'FAIL';

          expect(passFailTier(overall)).toBe(expected);
        }
      ),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 4: Overall score is the bounded mean of the four dimensions and determines the pass/fail tier
  it('passFailTier is PASS iff the score is >= 70 across the full integer range', () => {
    fc.assert(
      fc.property(arbDimension, (overall) => {
        const expected = overall >= 70 ? 'PASS' : 'FAIL';
        expect(passFailTier(overall)).toBe(expected);
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 4: Overall score is the bounded mean of the four dimensions and determines the pass/fail tier
  it('passFailTier resolves the boundary correctly: 69 -> FAIL, 70 -> PASS, 71 -> PASS', () => {
    expect(passFailTier(69)).toBe('FAIL');
    expect(passFailTier(70)).toBe('PASS');
    expect(passFailTier(71)).toBe('PASS');
  });
});
