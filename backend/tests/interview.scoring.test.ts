/**
 * Example-based unit tests for the deterministic interview scoring utilities
 * (interview spec task 4.8).
 *
 * Requirements:
 * - 5.2 Answer_Quality_Score aggregation (rounded mean)
 * - 5.3 Grammar_Score aggregation (rounded mean)
 * - 5.4 Latency_Score anchors + linear interpolation (t = 60/120/180)
 * - 5.6 Overall_Score (rounded mean of four dimensions)
 * - 5.7 Pass_Fail_Tier boundary exactly at 70
 *
 * These assert concrete anchor/boundary/rounding values. Rounding uses
 * `Math.round` (round half toward +Infinity), so the 0.5 cases round up.
 */
import { describe, it, expect } from 'vitest';

import {
  perQuestionLatencyScore,
  sessionLatencyScore,
  meanScore,
  overallScore,
  passFailTier,
  clamp,
} from '../src/utils/interview.scoring.js';

describe('perQuestionLatencyScore (Requirement 5.4)', () => {
  it('scores the maximum at and below the fast threshold', () => {
    expect(perQuestionLatencyScore(0)).toBe(100);
    expect(perQuestionLatencyScore(60)).toBe(100);
  });

  it('scores the midpoint anchor at t = 120', () => {
    expect(perQuestionLatencyScore(120)).toBe(50);
  });

  it('scores the minimum at and beyond the slow threshold', () => {
    expect(perQuestionLatencyScore(180)).toBe(0);
    expect(perQuestionLatencyScore(240)).toBe(0);
  });

  it('interpolates linearly (rounded) between the thresholds', () => {
    // 100 * (180 - 90) / 120 = 75
    expect(perQuestionLatencyScore(90)).toBe(75);
    // 100 * (180 - 150) / 120 = 25
    expect(perQuestionLatencyScore(150)).toBe(25);
  });
});

describe('sessionLatencyScore (Requirement 5.4)', () => {
  it('averages per-question latency scores at the anchors', () => {
    // perQuestion(60) = 100, perQuestion(180) = 0 -> mean = 50
    expect(sessionLatencyScore([60, 180])).toBe(50);
  });

  it('rounds the mean of per-question latency scores', () => {
    // perQuestion(90) = 75, perQuestion(150) = 25, perQuestion(120) = 50
    // mean = (75 + 25 + 50) / 3 = 50
    expect(sessionLatencyScore([90, 150, 120])).toBe(50);
    // perQuestion(60) = 100, perQuestion(90) = 75, perQuestion(180) = 0
    // mean = 175 / 3 = 58.33... -> 58
    expect(sessionLatencyScore([60, 90, 180])).toBe(58);
  });

  it('returns 0 for an empty input', () => {
    expect(sessionLatencyScore([])).toBe(0);
  });
});

describe('meanScore (Requirements 5.2, 5.3)', () => {
  it('rounds half upward', () => {
    // 80.5 -> 81
    expect(meanScore([80, 81])).toBe(81);
    // 1.5 -> 2
    expect(meanScore([1, 2])).toBe(2);
  });

  it('rounds an exact integer mean to itself', () => {
    // 213 / 3 = 71
    expect(meanScore([70, 71, 72])).toBe(71);
  });

  it('returns 0 for an empty input', () => {
    expect(meanScore([])).toBe(0);
  });
});

describe('overallScore (Requirement 5.6)', () => {
  it('returns the exact mean when all dimensions are equal', () => {
    expect(
      overallScore({
        answerQualityScore: 70,
        grammarScore: 70,
        latencyScore: 70,
        pressureScore: 70,
      })
    ).toBe(70);
  });

  it('rounds the mean of the four dimensions', () => {
    // (70 + 70 + 70 + 71) / 4 = 70.25 -> 70
    expect(
      overallScore({
        answerQualityScore: 70,
        grammarScore: 70,
        latencyScore: 70,
        pressureScore: 71,
      })
    ).toBe(70);
  });
});

describe('passFailTier (Requirement 5.7)', () => {
  it('passes exactly at the threshold of 70', () => {
    expect(passFailTier(70)).toBe('PASS');
  });

  it('fails just below the threshold', () => {
    expect(passFailTier(69)).toBe('FAIL');
  });

  it('handles the range extremes', () => {
    expect(passFailTier(100)).toBe('PASS');
    expect(passFailTier(0)).toBe('FAIL');
  });
});

describe('clamp', () => {
  it('clamps below the minimum to 0', () => {
    expect(clamp(-5)).toBe(0);
  });

  it('clamps above the maximum to 100', () => {
    expect(clamp(105)).toBe(100);
  });

  it('rounds within range (half upward)', () => {
    expect(clamp(50.4)).toBe(50);
    expect(clamp(50.5)).toBe(51);
  });
});
