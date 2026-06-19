/**
 * Job_Matcher (Requirement 6).
 *
 * Computes a semantic `Match_Score` between an `IStructuredResume` and a
 * `Job_Description` by delegating to the AI_Provider (Gemini) through the
 * single {@link generateJson} contact point. The model is asked to return
 * `{ score: 0..100, matchedConcepts: string[], missingConcepts: string[] }`.
 *
 * Defensive invariant (Requirement 6.1 / Property 6)
 * --------------------------------------------------
 * Language models can return out-of-range, fractional, or otherwise garbage
 * numeric values. After the response is parsed, the score is normalized to an
 * integer in the inclusive range `[0, 100]` via {@link clampScore} before being
 * returned. The exported {@link matchJob} therefore ALWAYS resolves to an
 * `IMatchResult` whose `score` is an integer in `[0, 100]`, regardless of what
 * the provider returns.
 *
 * Concepts (Requirement 6.2)
 * --------------------------
 * Matched and missing concepts are returned as-provided (defensively
 * normalized to trimmed, non-empty strings).
 *
 * Failures (Requirement 6.4)
 * --------------------------
 * Any provider failure (network, timeout, quota, invalid JSON, schema
 * mismatch) is already mapped to `AiProviderError` by {@link generateJson} and
 * simply propagates from here.
 *
 * Missing `Job_Description` (Requirement 6.3) is rejected by route validation
 * before this service runs; a defensive guard is nonetheless included.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { z } from 'zod';

import type { IMatchResult, IStructuredResume } from '../types/resume.types.js';
import { ValidationError } from '../utils/errors.js';
import { generateJson } from './aiProvider.service.js';

/** Inclusive lower bound for a `Match_Score`. */
const MIN_SCORE = 0;

/** Inclusive upper bound for a `Match_Score`. */
const MAX_SCORE = 100;

/** Input accepted by {@link matchJob}. */
export interface IMatchInput {
  /** The structured resume being matched against the job description. */
  content: IStructuredResume;
  /** The free-text job description to match against. */
  jobDescription: string;
}

/**
 * Schema the Gemini response must satisfy. `score` is accepted as a permissive
 * number (the model may emit fractional or out-of-range values); the defensive
 * {@link clampScore} normalization happens after parsing.
 */
const matchResponseSchema = z
  .object({
    score: z.number(),
    matchedConcepts: z.array(z.string()),
    missingConcepts: z.array(z.string()),
  })
  .strict();

/** System instruction steering Gemini toward strict, concept-level JSON. */
const SYSTEM_INSTRUCTION =
  'You are an expert technical recruiter and ATS analyst. Given a candidate ' +
  'resume and a job description, assess how well the resume matches the role. ' +
  'Respond with a single JSON object and nothing else, using the shape ' +
  '{ "score": number, "matchedConcepts": string[], "missingConcepts": string[] }. ' +
  '"score" is an integer from 0 to 100 representing overall semantic fit. ' +
  '"matchedConcepts" lists skills/requirements from the job description that ' +
  'the resume satisfies. "missingConcepts" lists skills/requirements from the ' +
  'job description that the resume does not address.';

/**
 * Compute a semantic `Match_Score` plus matched/missing concepts for a resume
 * against a job description (Requirements 6.1, 6.2).
 *
 * The returned `score` is guaranteed to be an integer in `[0, 100]`.
 */
export async function matchJob(input: IMatchInput): Promise<IMatchResult> {
  const jobDescription: string = input.jobDescription.trim();
  if (jobDescription.length === 0) {
    // Defensive: route validation (6.3) normally rejects this before we run.
    throw new ValidationError(
      'A job description is required to compute a match score.'
    );
  }

  const resumeText: string = serializeResumeToText(input.content);
  const prompt: string = buildPrompt(resumeText, jobDescription);

  const raw = await generateJson({
    prompt,
    schema: matchResponseSchema,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  return {
    score: clampScore(raw.score),
    matchedConcepts: normalizeConcepts(raw.matchedConcepts),
    missingConcepts: normalizeConcepts(raw.missingConcepts),
  };
}

/**
 * Normalize an arbitrary numeric value into an integer in the inclusive range
 * `[0, 100]` (Requirement 6.1 / Property 6).
 *
 * - Non-finite values (`NaN`, `±Infinity`) coerce to {@link MIN_SCORE}.
 * - Fractional values are rounded to the nearest integer.
 * - Values outside `[0, 100]` are clamped to the nearest bound.
 *
 * Exported as a small pure helper so it can be exercised directly by the
 * Property 6 test (task 12.3).
 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_SCORE;
  }
  const rounded: number = Math.round(value);
  if (rounded < MIN_SCORE) {
    return MIN_SCORE;
  }
  if (rounded > MAX_SCORE) {
    return MAX_SCORE;
  }
  return rounded;
}

/** Trim concept strings and drop any that are empty after trimming. */
function normalizeConcepts(concepts: string[]): string[] {
  const result: string[] = [];
  for (const concept of concepts) {
    const trimmed: string = concept.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}

/** Compose the user prompt from the serialized resume and job description. */
function buildPrompt(resumeText: string, jobDescription: string): string {
  return [
    'Analyze the semantic match between the following resume and job description.',
    '',
    '=== RESUME ===',
    resumeText,
    '',
    '=== JOB DESCRIPTION ===',
    jobDescription,
  ].join('\n');
}

/**
 * Serialize an `IStructuredResume` into a readable plain-text form for the
 * prompt. Self-contained (does not depend on other services) so the matcher
 * has no cross-module coupling.
 */
function serializeResumeToText(resume: IStructuredResume): string {
  const parts: string[] = [];
  const { contact } = resume;

  pushLine(parts, contact.name);
  pushLine(parts, contact.email);
  pushLine(parts, contact.phone);
  pushLine(parts, contact.location);
  for (const link of contact.links) {
    pushLine(parts, link);
  }

  if (hasText(resume.summary)) {
    parts.push('', 'Summary:', resume.summary.trim());
  }

  appendSections(parts, 'Experience', resume.experience);
  appendSections(parts, 'Education', resume.education);

  const skills: string[] = resume.skills
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
  if (skills.length > 0) {
    parts.push('', 'Skills:', skills.join(', '));
  }

  appendSections(parts, 'Additional', resume.additional);

  return parts.join('\n');
}

/** Append a labeled group of resume sections (heading + items) as text. */
function appendSections(
  parts: string[],
  label: string,
  sections: IStructuredResume['experience']
): void {
  if (sections.length === 0) {
    return;
  }
  parts.push('', `${label}:`);
  for (const section of sections) {
    pushLine(parts, section.heading);
    for (const item of section.items) {
      if (hasText(item)) {
        parts.push(`- ${item.trim()}`);
      }
    }
  }
}

/** Push a trimmed value onto the accumulator only when it carries text. */
function pushLine(parts: string[], value: string | undefined): void {
  if (hasText(value)) {
    parts.push(value.trim());
  }
}

/** True when a string is defined and contains non-whitespace characters. */
function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
