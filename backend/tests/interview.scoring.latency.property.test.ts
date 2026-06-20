/**
 * Property-based tests for the Interview latency scoring (interview spec task 4.5).
 *
 * Property 2: Latency score is a bounded integer and follows the deterministic
 * formula (Requirement 5.4).
 *
 * `perQuestionLatencyScore(t)`:
 *   - t <= 60  -> 100
 *   - t >= 180 -> 0
 *   - 60 < t < 180 -> round(100 * (180 - t) / 120)
 *   - monotonically non-increasing in t
 *   - always an integer in [0, 100]
 *
 * `sessionLatencyScore(latencies)` over a non-empty array of non-negative
 * latencies -> always an integer in [0, 100].
 *
 * Uses fast-check (3.23.2) with a minimum of 100 iterations.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  perQuestionLatencyScore,
  sessionLatencyScore,
} from '../src/utils/interview.scoring.js';

const RUNS = 100;

/** Non-negative finite latency in seconds (no NaN/Infinity). */
const arbLatency = fc.double({ min: 0, max: 600, noNaN: true });

const isIntInRange = (n: number): boolean =>
  Number.isInteger(n) && n >= 0 && n <= 100;

describe('Interview latency scoring (Property 2)', () => {
  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('perQuestionLatencyScore is always an integer in [0, 100]', () => {
    fc.assert(
      fc.property(arbLatency, (t) => {
        expect(isIntInRange(perQuestionLatencyScore(t))).toBe(true);
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('scores 100 for latencies at or below 60 seconds', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 60, noNaN: true }), (t) => {
        expect(perQuestionLatencyScore(t)).toBe(100);
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('scores 0 for latencies at or above 180 seconds', () => {
    fc.assert(
      fc.property(fc.double({ min: 180, max: 600, noNaN: true }), (t) => {
        expect(perQuestionLatencyScore(t)).toBe(0);
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('interpolates as round(100 * (180 - t) / 120) for 60 < t < 180', () => {
    fc.assert(
      // Keep strictly inside the open interval (60, 180).
      fc.property(
        fc.double({ min: 60, max: 180, noNaN: true }).filter((t) => t > 60 && t < 180),
        (t) => {
          const expected = Math.round((100 * (180 - t)) / 120);
          expect(perQuestionLatencyScore(t)).toBe(expected);
        }
      ),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('is monotonically non-increasing in t', () => {
    fc.assert(
      fc.property(arbLatency, arbLatency, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(perQuestionLatencyScore(lo)).toBeGreaterThanOrEqual(
          perQuestionLatencyScore(hi)
        );
      }),
      { numRuns: RUNS }
    );
  });

  // Feature: interview, Property 2: Latency score is a bounded integer and follows the deterministic formula
  it('sessionLatencyScore over a non-empty latency array is an integer in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.array(arbLatency, { minLength: 1, maxLength: 15 }),
        (latencies) => {
          expect(isIntInRange(sessionLatencyScore(latencies))).toBe(true);
        }
      ),
      { numRuns: RUNS }
    );
  });
});
