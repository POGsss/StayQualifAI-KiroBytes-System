/**
 * Bullet_Generator (Requirements 7.1, 7.2, 7.4).
 *
 * Rewrites a free-form experience description into one or more X-Y-Z achievement
 * bullets of the form "Accomplished [X] as measured by [Y] by doing [Z]" using
 * the AI_Provider (Gemini). All provider interaction goes through the single
 * {@link generateJson} wrapper, which normalizes every provider failure mode to
 * a typed {@link AiProviderError} (Requirement 7.4).
 *
 * Generation contract
 * --------------------
 * The service prompts Gemini to return JSON shaped as `{ bullets: string[] }`
 * and validates that shape with a Zod schema passed to {@link generateJson}
 * (Requirement 7.1). Each returned bullet is expected to encode an
 * accomplishment, a measurable outcome, and the action taken (Requirement 7.2);
 * the prompt and system instruction steer the model toward that structure.
 *
 * Post-validation
 * ---------------
 * The model can occasionally emit empty or whitespace-only strings even when the
 * JSON shape is valid. Each bullet is trimmed and empties are dropped. If no
 * usable bullet remains, the provider effectively failed to produce output, so
 * an {@link AiProviderError} is thrown (Requirements 7.1, 7.4).
 *
 * Empty/whitespace input is rejected by route validation middleware before this
 * service runs (Requirement 7.3); a defensive guard is included regardless.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { z } from 'zod';

import type { XyzBullet } from '../types/resume.types.js';
import { AiProviderError } from '../utils/errors.js';
import { generateJson } from './aiProvider.service.js';

/** Per-call timeout (ms) for the bullet-generation request. */
const BULLET_TIMEOUT_MS = 30_000;

/**
 * System instruction steering Gemini to produce X-Y-Z achievement bullets and
 * to return only the agreed JSON shape.
 */
const SYSTEM_INSTRUCTION =
  'You are an expert resume writer. Rewrite the user\'s experience description ' +
  'into one or more concise achievement bullets in the X-Y-Z format: ' +
  '"Accomplished [X] as measured by [Y] by doing [Z]". Every bullet must state ' +
  'an accomplishment (X), a measurable outcome (Y), and the action taken (Z). ' +
  'Prefer concrete, quantified outcomes. Respond ONLY with a JSON object of the ' +
  'shape { "bullets": string[] } and nothing else.';

/** Input accepted by {@link generateBullets}. */
export interface IBulletInput {
  /** Free-form experience description to rewrite into X-Y-Z bullets. */
  experience: string;
}

/** Zod schema the parsed Gemini JSON response must satisfy. */
const bulletResponseSchema = z
  .object({
    bullets: z.array(z.string()),
  })
  .strict();

/**
 * Generate one or more X-Y-Z achievement bullets from an experience description
 * via the AI_Provider (Requirements 7.1, 7.2).
 *
 * @throws {AiProviderError} when the provider is unavailable, errors, times out,
 *   returns malformed output, or yields no usable (non-empty) bullet
 *   (Requirement 7.4).
 */
export async function generateBullets(input: IBulletInput): Promise<XyzBullet[]> {
  const experience: string = input.experience.trim();

  // Defensive guard; route validation rejects empty input first (Requirement 7.3).
  if (experience.length === 0) {
    throw new AiProviderError('Cannot generate bullets from an empty experience description.');
  }

  const prompt: string = buildPrompt(experience);

  const result = await generateJson({
    prompt,
    schema: bulletResponseSchema,
    systemInstruction: SYSTEM_INSTRUCTION,
    timeoutMs: BULLET_TIMEOUT_MS,
  });

  const bullets: XyzBullet[] = result.bullets
    .map((bullet: string): string => bullet.trim())
    .filter((bullet: string): boolean => bullet.length > 0);

  if (bullets.length === 0) {
    throw new AiProviderError(
      'The AI provider did not return any usable achievement bullets.'
    );
  }

  return bullets;
}

/** Compose the content prompt for a single experience description. */
function buildPrompt(experience: string): string {
  return [
    'Rewrite the following experience description into one or more X-Y-Z',
    'achievement bullets. Each bullet must follow the form',
    '"Accomplished [X] as measured by [Y] by doing [Z]".',
    '',
    'Experience description:',
    experience,
  ].join('\n');
}
