/**
 * Property-based test for the Interview STAR_Story serializer (spec task 4.2).
 *
 * Property 1: STAR story serialization round-trip.
 * For any well-formed STAR_Story, serializing it to its stored representation
 * and then deserializing it produces a STAR_Story whose five text fields
 * (title, situation, task, action, result) — plus id and createdAt — are
 * character-for-character identical to the original, with no trimming,
 * encoding mutation, or truncation applied to any field.
 *
 * Framework: vitest + fast-check (per design Testing Strategy).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  serializeStarStory,
  deserializeStarStory,
} from '../src/utils/interview.starSerializer.js';
import type { IStarStory } from '../src/types/interview.types.js';

/**
 * A non-empty, full-unicode string arbitrary bounded by `maxLength`.
 *
 * `fc.fullUnicodeString` draws from the full unicode code-point space
 * (including whitespace, surrogate-pair characters, and control characters),
 * which is exactly the adversarial input space we want to prove round-trips
 * losslessly. We additionally bias toward whitespace-heavy values so the
 * generator exercises the "no trimming" guarantee (Requirement 11.1/11.2).
 */
function arbTextField(maxLength: number): fc.Arbitrary<string> {
  const unicode = fc.fullUnicodeString({ minLength: 1, maxLength });
  const whitespaceHeavy = fc
    .array(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u2003'), {
      minLength: 1,
      maxLength: Math.min(maxLength, 50),
    })
    .map((parts) => parts.join(''));
  // Mostly arbitrary unicode, occasionally pure-whitespace edge cases.
  return fc.oneof({ weight: 9, arbitrary: unicode }, { weight: 1, arbitrary: whitespaceHeavy });
}

/**
 * Generator for a well-formed `IStarStory`, respecting the documented field
 * length bounds: title 1..200, situation/task/action/result 1..2000.
 * `id` and `createdAt` are arbitrary identifier/date-like strings.
 */
const arbStarStory: fc.Arbitrary<IStarStory> = fc.record({
  id: fc.oneof(fc.uuid(), fc.fullUnicodeString({ minLength: 1, maxLength: 64 })),
  title: arbTextField(200),
  situation: arbTextField(2000),
  task: arbTextField(2000),
  action: arbTextField(2000),
  result: arbTextField(2000),
  createdAt: fc.oneof(
    fc.date({ min: new Date('1970-01-01T00:00:00.000Z'), max: new Date('2100-01-01T00:00:00.000Z') }).map((d) => d.toISOString()),
    fc.fullUnicodeString({ minLength: 1, maxLength: 40 })
  ),
});

describe('STAR serializer — Property 1: serialization round-trip', () => {
  // Feature: interview, Property 1: STAR story serialization round-trip
  it('deserializeStarStory(serializeStarStory(x)) is character-for-character identical to x', () => {
    fc.assert(
      fc.property(arbStarStory, (story) => {
        const roundTripped = deserializeStarStory(serializeStarStory(story));

        // Whole-object structural equality.
        expect(roundTripped).toEqual(story);

        // Explicit character-for-character checks on every preserved field.
        expect(roundTripped.id).toBe(story.id);
        expect(roundTripped.title).toBe(story.title);
        expect(roundTripped.situation).toBe(story.situation);
        expect(roundTripped.task).toBe(story.task);
        expect(roundTripped.action).toBe(story.action);
        expect(roundTripped.result).toBe(story.result);
        expect(roundTripped.createdAt).toBe(story.createdAt);
      }),
      { numRuns: 200 }
    );
  });
});
