/**
 * Edge tests for the Interview STAR_Story serializer (spec task 4.3).
 *
 * Requirement 11.3: deserializing a malformed stored representation throws a
 * `DeserializationError`. The serializer validates the stored shape with a
 * strict Zod schema, so malformed inputs — non-objects, missing required
 * fields, wrong-typed fields, and extra/unknown keys — must all be rejected.
 *
 * Framework: vitest (per design Testing Strategy). These are example-based
 * tests complementing the round-trip property test in
 * `interview.starSerializer.property.test.ts`.
 */
import { describe, it, expect } from 'vitest';

import { deserializeStarStory } from '../src/utils/interview.starSerializer.js';
import { DeserializationError } from '../src/utils/errors.js';

/**
 * A fully valid stored representation, used as the baseline that each malformed
 * case mutates so the test isolates the single defect under examination.
 */
const validStored = {
  id: 'story-1',
  title: 'Led migration',
  situation: 'Legacy system was failing',
  task: 'Migrate to new platform',
  action: 'Designed and executed the migration',
  result: 'Reduced downtime by 90%',
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('STAR serializer — edge: malformed stored representation (Requirement 11.3)', () => {
  it('throws DeserializationError for null', () => {
    expect(() => deserializeStarStory(null)).toThrow(DeserializationError);
  });

  it('throws DeserializationError for undefined', () => {
    expect(() => deserializeStarStory(undefined)).toThrow(DeserializationError);
  });

  it('throws DeserializationError for a non-object (string)', () => {
    expect(() => deserializeStarStory('not an object')).toThrow(DeserializationError);
  });

  it('throws DeserializationError for a non-object (number)', () => {
    expect(() => deserializeStarStory(42)).toThrow(DeserializationError);
  });

  it('throws DeserializationError for a non-object (boolean)', () => {
    expect(() => deserializeStarStory(true)).toThrow(DeserializationError);
  });

  it('throws DeserializationError for an array', () => {
    expect(() => deserializeStarStory([])).toThrow(DeserializationError);
  });

  it('throws DeserializationError for an empty object (all required fields missing)', () => {
    expect(() => deserializeStarStory({})).toThrow(DeserializationError);
  });

  it('throws DeserializationError when a required field is missing', () => {
    const { situation: _situation, ...missingSituation } = validStored;
    expect(() => deserializeStarStory(missingSituation)).toThrow(DeserializationError);
  });

  it('throws DeserializationError when created_at is missing', () => {
    const { created_at: _createdAt, ...missingCreatedAt } = validStored;
    expect(() => deserializeStarStory(missingCreatedAt)).toThrow(DeserializationError);
  });

  it('throws DeserializationError when a field has the wrong type (title as number)', () => {
    expect(() => deserializeStarStory({ ...validStored, title: 123 })).toThrow(
      DeserializationError
    );
  });

  it('throws DeserializationError when a field has the wrong type (result as null)', () => {
    expect(() => deserializeStarStory({ ...validStored, result: null })).toThrow(
      DeserializationError
    );
  });

  it('throws DeserializationError when the object carries an extra/unknown key', () => {
    expect(() =>
      deserializeStarStory({ ...validStored, unexpected: 'extra' })
    ).toThrow(DeserializationError);
  });

  it('accepts a well-formed stored representation (negative control)', () => {
    expect(() => deserializeStarStory(validStored)).not.toThrow();
  });
});
