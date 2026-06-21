/**
 * Zod request schemas for the Interview module routes.
 *
 * SCOPE (task 9.3): this file currently provides ONLY the STAR-story input
 * validation schemas — {@link createStarSchema} (`POST /stories`) and
 * {@link updateStarSchema} (`PATCH /stories/:id`). Task 10.4 extends this file
 * with the session/answer schemas (session-create constraints, answer
 * constraints) and wires every schema into the route validation middleware.
 *
 * These schemas back the shared per-route validation middleware
 * (`middleware/validate.ts`): malformed STAR requests are rejected before
 * reaching the controller/service, and each invalid field is surfaced via a
 * Zod issue whose `path` identifies the offending field (Requirement 12.6).
 *
 * STAR validation rules implemented here:
 *  - 7.2  Create requires all five fields (`title`, `situation`, `task`,
 *         `action`, `result`) to be present AND non-blank; every missing or
 *         blank field is identified.
 *  - 7.3  A `title` longer than 200 characters STOPS validation first: the
 *         request is rejected with ONLY the title max-length error and the
 *         remaining fields are not checked.
 *  - 7.4  Each of the four STAR fields (`situation`, `task`, `action`,
 *         `result`) must not exceed 2 000 characters; every over-limit field
 *         is identified.
 *  - 9.2  On update, any SUPPLIED field that is blank (empty or whitespace
 *         only) is rejected; every blank supplied field is identified.
 *  - 9.3  On update, a supplied `title` longer than 200 characters is rejected.
 *  - 9.4  On update, any supplied STAR field longer than 2 000 characters is
 *         rejected; every over-limit field is identified.
 *  - 9.6  An update supplying none of the five fields is rejected.
 *
 * Named exports only. No `any`.
 */
import { z } from 'zod';

import type {
  ICreateStarInput,
  IUpdateStarInput,
} from '../types/interview.types.js';

/** Maximum length of a STAR_Story `title` (Requirements 7.3, 9.3). */
export const TITLE_MAX_LENGTH = 200;

/**
 * Maximum length of each of the four STAR content fields (`situation`, `task`,
 * `action`, `result`) (Requirements 7.4, 9.4).
 */
export const STAR_FIELD_MAX_LENGTH = 2000;

/** The four STAR content fields, in canonical order. */
const STAR_CONTENT_FIELDS = ['situation', 'task', 'action', 'result'] as const;

/** All five updatable STAR fields, in canonical order. */
const ALL_STAR_FIELDS = [
  'title',
  'situation',
  'task',
  'action',
  'result',
] as const;

type StarFieldName = (typeof ALL_STAR_FIELDS)[number];

/**
 * A value is "blank" when it is not a non-empty (after-trim) string. Missing
 * fields (`undefined`) and non-string values are therefore treated as blank,
 * so they are reported alongside whitespace-only strings (Requirements 7.2,
 * 9.2).
 */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/** Add a "required / blank" issue for a field (Requirements 7.2, 9.2). */
function addBlankIssue(
  ctx: z.RefinementCtx,
  field: StarFieldName,
  message: string
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    message,
    params: { rule: 'blank', field },
  });
}

/** Add a "max length exceeded" issue for a field (Requirements 7.3/7.4/9.3/9.4). */
function addMaxLengthIssue(
  ctx: z.RefinementCtx,
  field: StarFieldName,
  max: number
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    message: `${field} must not exceed ${max} characters`,
    params: { rule: 'maxLength', field, max },
  });
}

/**
 * Raw object shape used by both STAR schemas. Each field is accepted as an
 * `unknown` value so the ordered/first-stop validation logic in `superRefine`
 * has full control over which issues are reported and in what order
 * (Requirement 7.3 requires title-length to short-circuit the rest).
 */
const rawStarObject = z.object({
  title: z.unknown(),
  situation: z.unknown(),
  task: z.unknown(),
  action: z.unknown(),
  result: z.unknown(),
});

/**
 * `POST /stories` — create a STAR_Story.
 *
 * Validation order (Requirement 7.3 mandates the first-stop behaviour):
 *  1. IF `title` is a string longer than 200 chars → report ONLY that error
 *     and stop (do not check the remaining fields).
 *  2. Otherwise report every missing/blank required field (7.2) AND every
 *     STAR content field that exceeds 2 000 chars (7.4) together.
 *
 * On success the parsed value is narrowed to {@link ICreateStarInput} (all
 * five fields are guaranteed non-blank strings within their length limits).
 */
export const createStarSchema = rawStarObject
  .superRefine((value, ctx) => {
    const record = value as Record<StarFieldName, unknown>;
    const { title } = record;

    // 7.3: a title over the limit stops validation first.
    if (typeof title === 'string' && title.length > TITLE_MAX_LENGTH) {
      addMaxLengthIssue(ctx, 'title', TITLE_MAX_LENGTH);
      return;
    }

    // 7.2: every missing or blank required field is identified.
    for (const field of ALL_STAR_FIELDS) {
      if (isBlank(record[field])) {
        addBlankIssue(ctx, field, `${field} is required and must not be blank`);
      }
    }

    // 7.4: every STAR content field over the limit is identified. (A blank
    // field can never also be over-length, so issues never double up.)
    for (const field of STAR_CONTENT_FIELDS) {
      const fieldValue = record[field];
      if (
        typeof fieldValue === 'string' &&
        fieldValue.length > STAR_FIELD_MAX_LENGTH
      ) {
        addMaxLengthIssue(ctx, field, STAR_FIELD_MAX_LENGTH);
      }
    }
  })
  .transform((value): ICreateStarInput => {
    // Reached only when validation passed, so every field is a valid string.
    const record = value as Record<StarFieldName, string>;
    return {
      title: record.title,
      situation: record.situation,
      task: record.task,
      action: record.action,
      result: record.result,
    };
  });

/**
 * `PATCH /stories/:id` — update a STAR_Story (partial).
 *
 * Validation rules:
 *  - 9.6  At least one of the five fields must be supplied; an empty update is
 *         rejected with a single "at least one field" error.
 *  - 9.2  Any supplied field that is blank (empty/whitespace) is rejected;
 *         every blank supplied field is identified.
 *  - 9.3  A supplied `title` over 200 chars is rejected.
 *  - 9.4  Any supplied STAR content field over 2 000 chars is rejected; every
 *         over-limit field is identified.
 *
 * On success the parsed value is narrowed to {@link IUpdateStarInput}
 * containing ONLY the supplied fields, so the service mutates just those.
 */
export const updateStarSchema = rawStarObject
  .superRefine((value, ctx) => {
    const record = value as Record<StarFieldName, unknown>;
    const suppliedFields = ALL_STAR_FIELDS.filter(
      (field) => record[field] !== undefined
    );

    // 9.6: at least one updatable field must be supplied.
    if (suppliedFields.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one field must be supplied to update a STAR story.',
        params: { rule: 'atLeastOneField' },
      });
      return;
    }

    // 9.2: every supplied-but-blank field is identified.
    for (const field of suppliedFields) {
      if (isBlank(record[field])) {
        addBlankIssue(ctx, field, `${field} must not be blank`);
      }
    }

    // 9.3: a supplied title over the limit is rejected.
    if (typeof record.title === 'string' && record.title.length > TITLE_MAX_LENGTH) {
      addMaxLengthIssue(ctx, 'title', TITLE_MAX_LENGTH);
    }

    // 9.4: every supplied STAR content field over the limit is identified.
    for (const field of STAR_CONTENT_FIELDS) {
      const fieldValue = record[field];
      if (
        typeof fieldValue === 'string' &&
        fieldValue.length > STAR_FIELD_MAX_LENGTH
      ) {
        addMaxLengthIssue(ctx, field, STAR_FIELD_MAX_LENGTH);
      }
    }
  })
  .transform((value): IUpdateStarInput => {
    // Reached only when validation passed; include ONLY supplied fields so the
    // service preserves the rest (Requirement 9.1).
    const record = value as Record<StarFieldName, string | undefined>;
    const patch: IUpdateStarInput = {};
    for (const field of ALL_STAR_FIELDS) {
      const fieldValue = record[field];
      if (fieldValue !== undefined) {
        patch[field] = fieldValue;
      }
    }
    return patch;
  });

// ---------------------------------------------------------------------------
// Session / answer schemas (task 10.4).
//
// These back the per-route validation middleware for the session and answer
// endpoints. Each invalid field is surfaced via a Zod issue whose message
// identifies the offending field, the valid values, or the permitted range so
// the centralized error middleware can relay it to the caller (Requirement
// 12.6).
// ---------------------------------------------------------------------------

/** Maximum length of a session Job_Description (Requirement 1.5). */
export const JOB_DESCRIPTION_MAX_LENGTH = 5000;

/** Maximum length of a Candidate_Answer (Requirement 3.3). */
export const ANSWER_MAX_LENGTH = 5000;

/** Inclusive lower bound for Question_Count (Requirement 1.7). */
export const QUESTION_COUNT_MIN = 5;

/** Inclusive upper bound for Question_Count (Requirement 1.7). */
export const QUESTION_COUNT_MAX = 15;

/** The valid Difficulty_Tier values, in canonical order (Requirement 1.6). */
export const DIFFICULTY_TIERS = ['ENTRY', 'MID', 'SENIOR', 'LEAD'] as const;

/**
 * `difficultyTier` field validator. A missing value is reported as required
 * (Requirement 1.3); any value outside the enum lists the valid values
 * (Requirement 1.6).
 */
const difficultyTierSchema = z.enum(DIFFICULTY_TIERS, {
  errorMap: (issue, ctx) => {
    if (issue.code === 'invalid_type' && ctx.data === undefined) {
      return { message: 'difficulty_tier is required' };
    }
    return {
      message: `difficulty_tier must be one of: ${DIFFICULTY_TIERS.join(', ')}`,
    };
  },
});

/**
 * `POST /sessions` — create an Interview_Session.
 *
 *  - 1.3  `difficultyTier` is required (missing → identified as required).
 *  - 1.6  `difficultyTier` outside the enum → error lists valid values.
 *  - 1.4  `jobDescription` is required and non-empty after trimming.
 *  - 1.5  `jobDescription` must not exceed 5 000 characters.
 *  - 1.7  `questionCount` must be an integer within 5–15 inclusive.
 *  - 1.8  `questionCount` is required (missing → identified as required).
 *  - resumeVersionId is an optional resume reference (UUID).
 *
 * The inferred output is structurally compatible with {@link ICreateSessionInput}.
 */
export const createSessionBodySchema = z.object({
  difficultyTier: difficultyTierSchema,
  jobDescription: z
    .string({
      required_error: 'job_description is required',
      invalid_type_error: 'job_description is required',
    })
    .trim()
    .min(1, { message: 'job_description is required and must not be empty' })
    .max(JOB_DESCRIPTION_MAX_LENGTH, {
      message: `job_description must not exceed ${JOB_DESCRIPTION_MAX_LENGTH} characters`,
    }),
  questionCount: z
    .number({
      required_error: 'question_count is required',
      invalid_type_error: 'question_count is required',
    })
    .int({
      message: `question_count must be an integer between ${QUESTION_COUNT_MIN} and ${QUESTION_COUNT_MAX}`,
    })
    .min(QUESTION_COUNT_MIN, {
      message: `question_count must be between ${QUESTION_COUNT_MIN} and ${QUESTION_COUNT_MAX}`,
    })
    .max(QUESTION_COUNT_MAX, {
      message: `question_count must be between ${QUESTION_COUNT_MIN} and ${QUESTION_COUNT_MAX}`,
    }),
  resumeVersionId: z.string().uuid().optional(),
});

/**
 * `POST /sessions/:id/questions/:qid/answers` — submit a Candidate_Answer.
 *
 *  - 3.3  `answerText` must be non-empty after trimming and at most 5 000 chars.
 *  - `responseLatencySeconds` is a required non-negative number of seconds.
 *
 * The inferred output is structurally compatible with {@link ISubmitAnswerInput}.
 */
export const submitAnswerBodySchema = z.object({
  answerText: z
    .string({
      required_error: 'answer_text is required',
      invalid_type_error: 'answer_text is required',
    })
    .trim()
    .min(1, { message: 'answer_text must not be empty or whitespace only' })
    .max(ANSWER_MAX_LENGTH, {
      message: `answer_text must not exceed ${ANSWER_MAX_LENGTH} characters`,
    }),
  responseLatencySeconds: z
    .number({
      required_error: 'response_latency_seconds is required',
      invalid_type_error: 'response_latency_seconds must be a number',
    })
    .min(0, { message: 'response_latency_seconds must be greater than or equal to 0' }),
});

// ---------------------------------------------------------------------------
// Route param schemas.
// ---------------------------------------------------------------------------

/** A UUID route parameter value (mirrors the resume `versionIdParamsSchema` style). */
const uuidParam = z.string().uuid();

/** `:id` params for session sub-resources (`/sessions/:id/...`). */
export const sessionIdParamsSchema = z.object({
  id: uuidParam,
});

/** `:id` + `:qid` params for question sub-resources (`/sessions/:id/questions/:qid/...`). */
export const sessionQuestionParamsSchema = z.object({
  id: uuidParam,
  qid: uuidParam,
});

/** `:id` params for STAR story sub-resources (`/stories/:id`). */
export const storyIdParamsSchema = z.object({
  id: uuidParam,
});
