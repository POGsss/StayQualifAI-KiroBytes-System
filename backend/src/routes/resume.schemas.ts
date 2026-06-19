/**
 * Zod request schemas for the Resume module routes.
 *
 * These schemas back the per-route validation middleware (Requirement 11.4):
 * malformed requests are rejected before reaching any controller/service. The
 * `structuredResumeSchema` mirrors the `IStructuredResume` type in
 * `types/resume.types.ts` and is reused across every endpoint that accepts a
 * resume body (scans, keyword-suggestions, versions, match).
 *
 * Several fields enforce non-empty-after-trim semantics so whitespace-only
 * input is rejected (Requirements 4.4, 6.3, 7.3, 9.2).
 *
 * Named exports only. No `any`.
 */
import { z } from 'zod';

import type { ResumeSectionType } from '../types/resume.types.js';

/** The allowed `IResumeSection.type` values (mirrors {@link ResumeSectionType}). */
export const resumeSectionTypeSchema: z.ZodType<ResumeSectionType> = z.enum([
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'additional',
]);

/** Schema for a single `IResumeSection`. */
export const resumeSectionSchema = z.object({
  type: resumeSectionTypeSchema,
  heading: z.string(),
  items: z.array(z.string()),
});

/** Schema for the `contact` block of an `IStructuredResume`. */
export const resumeContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.string()),
});

/**
 * Schema mirroring {@link IStructuredResume}. Reused across every endpoint that
 * accepts a structured resume in its body. The inferred output type is
 * structurally compatible with {@link IStructuredResume}.
 */
export const structuredResumeSchema = z.object({
  contact: resumeContactSchema,
  summary: z.string(),
  experience: z.array(resumeSectionSchema),
  education: z.array(resumeSectionSchema),
  skills: z.array(z.string()),
  additional: z.array(resumeSectionSchema),
});

/** A non-empty-after-trim string (rejects whitespace-only input). */
const nonEmptyTrimmed = z.string().trim().min(1);

/** A UUID route parameter (`:id`). */
const uuidParam = z.string().uuid();

// ---------------------------------------------------------------------------
// Endpoint body / params schemas.
// ---------------------------------------------------------------------------

/** `POST /scans` — resume content with an optional job description. */
export const scanBodySchema = z.object({
  content: structuredResumeSchema,
  jobDescription: z.string().optional(),
});

/**
 * `POST /keyword-suggestions` — job description is REQUIRED and non-empty
 * (Requirement 4.4).
 */
export const keywordSuggestionsBodySchema = z.object({
  content: structuredResumeSchema,
  jobDescription: nonEmptyTrimmed,
});

/** `POST /versions` — name is required/non-empty; `sourceVersionId` optional. */
export const saveVersionBodySchema = z.object({
  name: nonEmptyTrimmed,
  content: structuredResumeSchema,
  sourceVersionId: z.string().uuid().optional(),
});

/** Shared `:id` UUID params schema for version sub-resources. */
export const versionIdParamsSchema = z.object({
  id: uuidParam,
});

/**
 * `PATCH /versions/:id` — rename body. The new name must be non-empty after
 * trimming, so whitespace-only names are rejected (Requirement 9.2).
 */
export const renameVersionBodySchema = z.object({
  name: nonEmptyTrimmed,
});

/**
 * `POST /match` — semantic match. Job description is REQUIRED and non-empty
 * (Requirement 6.3).
 */
export const matchBodySchema = z.object({
  content: structuredResumeSchema,
  jobDescription: nonEmptyTrimmed,
});

/**
 * `POST /bullets` — X-Y-Z bullet generation. The experience text must be
 * non-empty after trimming (Requirement 7.3).
 */
export const bulletsBodySchema = z.object({
  experience: nonEmptyTrimmed,
});
