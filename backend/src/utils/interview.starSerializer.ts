/**
 * Interview STAR_Story serializer (Requirements 11.1, 11.2, 11.3).
 *
 * Converts an `IStarStory` between its in-memory object representation and the
 * stored representation persisted in the `interview_star_stories` row. The
 * stored shape mirrors the table's `snake_case` columns; the five STAR text
 * fields (`title`, `situation`, `task`, `action`, `result`) are carried as
 * plain `text` and are stored verbatim — no trimming, encoding mutation, or
 * truncation is ever applied (Requirements 11.1, 11.2).
 *
 * The serializer guarantees a lossless, character-for-character round-trip:
 *   deserializeStarStory(serializeStarStory(x)) ≡ x   (Property 1, tested in 4.2)
 *
 * On deserialize, a Zod schema validates the stored representation; any
 * malformed input throws a `DeserializationError` (Requirement 11.3).
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { z } from 'zod';

import type { IStarStory } from '../types/interview.types.js';
import { DeserializationError } from './errors.js';

/**
 * Stored representation of an `IStarStory`. This shape mirrors the
 * `interview_star_stories` row (`snake_case` columns) and is what the
 * STAR_Organizer persists / reads back. The `user_id` column is a row-level
 * ownership concern owned by the service layer and is intentionally not part
 * of the serialized story content.
 *
 * Every field is a plain string carried verbatim, preserving the five STAR
 * text fields character-for-character.
 */
const storedStarStorySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
    created_at: z.string(),
  })
  .strict();

/**
 * The stored representation of an `IStarStory`, matching the DB row shape with
 * `snake_case` keys. JSON-serializable and round-trip exact.
 */
export type StoredStarStory = z.infer<typeof storedStarStorySchema>;

/**
 * Serialize an `IStarStory` into its stored representation (Requirement 11.1).
 *
 * The five STAR text fields are copied verbatim with no normalization. Only the
 * `createdAt` field is mapped to the `created_at` column name.
 */
export function serializeStarStory(story: IStarStory): StoredStarStory {
  return {
    id: story.id,
    title: story.title,
    situation: story.situation,
    task: story.task,
    action: story.action,
    result: story.result,
    created_at: story.createdAt,
  };
}

/**
 * Deserialize a stored representation back into an `IStarStory`
 * (Requirement 11.2). The five STAR text fields are restored character-for-
 * character with no trimming, encoding mutation, or truncation.
 *
 * Throws `DeserializationError` when the stored input is malformed — missing
 * fields, wrong types, or extra/unknown keys (Requirement 11.3).
 */
export function deserializeStarStory(stored: unknown): IStarStory {
  const result = storedStarStorySchema.safeParse(stored);

  if (!result.success) {
    throw new DeserializationError(
      'Stored STAR story content could not be deserialized: malformed or incompatible shape.',
      result.error.format()
    );
  }

  const data = result.data;

  return {
    id: data.id,
    title: data.title,
    situation: data.situation,
    task: data.task,
    action: data.action,
    result: data.result,
    createdAt: data.created_at,
  };
}
