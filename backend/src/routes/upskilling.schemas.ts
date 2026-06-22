/**
 * Zod request schemas for the Upskilling module routes
 * (Career Roadmap & Learning Engine).
 *
 * These schemas validate request bodies, params, and query strings before any
 * controller/service logic runs, backing the shared per-route validation
 * middleware (`middleware/validate.ts`). Malformed requests are rejected with a
 * structured `ValidationError`; every bound below produces a message that
 * identifies the offending field and its accepted value or range so the
 * centralized error middleware can relay it to the caller
 * (Requirements 1.4, 1.5, 2.6, 3.5, 5.6, 6.2).
 *
 * Non-whitespace length checks use `.trim()` semantics consistent with the
 * jobsearch and interview modules: the value is trimmed first, then the
 * resulting length is bounds-checked, so leading/trailing whitespace can never
 * satisfy a minimum length.
 *
 * Named exports only. No `any`.
 */
import { z } from 'zod';

import type {
  CostClassification,
  DifficultyLevel,
} from '../types/upskilling.types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A UUID string (for route params and body references). */
const uuidParam = z.string().uuid();

/** Difficulty_Level enum values (Requirement 1.2). */
const difficultyEnum: z.ZodType<DifficultyLevel> = z.enum([
  'Beginner',
  'Intermediate',
  'Advanced',
]);

/** Cost classification enum values (Requirements 5.2, 6.1). */
const costEnum: z.ZodType<CostClassification> = z.enum(['Free', 'Paid']);

/**
 * Builds a trimmed string schema bounded to `[min, max]` characters with
 * messages that name the field and its accepted range. Used for the
 * "non-whitespace character" bounds in the design.
 */
function boundedString(field: string, min: number, max: number) {
  return z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a string`,
    })
    .trim()
    .min(min, `${field} must be at least ${min} characters`)
    .max(max, `${field} must not exceed ${max} characters`);
}

/** A single skill string: 1..50 non-whitespace characters. */
const skillString = boundedString('Each skill', 1, 50);

/**
 * Builds a skills-array schema bounded to `[minItems, maxItems]` unique,
 * non-empty entries (each 1..50 non-whitespace characters). Uniqueness is
 * enforced over the trimmed values.
 */
function skillsArray(field: string, minItems: number, maxItems: number) {
  return z
    .array(skillString)
    .min(minItems, `${field} must contain at least ${minItems} skill(s)`)
    .max(maxItems, `${field} must not contain more than ${maxItems} skill(s)`)
    .refine((skills) => new Set(skills).size === skills.length, {
      message: `${field} must not contain duplicate skills`,
    });
}

/**
 * HTTPS URL string bounded to `maxLength` characters. Rejects non-HTTPS schemes
 * with a message naming the accepted scheme (Requirements 5.2, 6.1, 6.2).
 */
function httpsUrl(maxLength: number) {
  return z
    .string({
      required_error: 'url is required',
      invalid_type_error: 'url must be a string',
    })
    .trim()
    .url('url must be a valid URL')
    .max(maxLength, `url must not exceed ${maxLength} characters`)
    .refine((value) => value.toLowerCase().startsWith('https://'), {
      message: 'url must use the HTTPS scheme',
    });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * `POST /projects/generate` — generate project suggestions.
 *
 *  - 1.4  `targetRole` must be 2..100 non-whitespace characters.
 *  - 1.5  optional `focusSkills` is 1..10 entries, each 1..50 non-whitespace
 *         characters (and unique).
 */
export const generateProjectsBodySchema = z.object({
  targetRole: boundedString('target_role', 2, 100),
  focusSkills: skillsArray('focus_skills', 1, 10).optional(),
});

/**
 * `POST /projects` — save a project suggestion.
 *
 *  - 2.6  Every field is bounded per Requirement 1.2; an out-of-bounds field is
 *         rejected with a message naming the field and its accepted range.
 */
export const saveProjectBodySchema = z.object({
  targetRole: boundedString('target_role', 2, 100),
  title: boundedString('title', 3, 150),
  description: boundedString('description', 50, 1000),
  demonstratedSkills: skillsArray('demonstrated_skills', 1, 10),
  difficulty: difficultyEnum,
  estimatedEffortHours: z
    .number({
      required_error: 'estimated_effort_hours is required',
      invalid_type_error: 'estimated_effort_hours must be a number',
    })
    .int('estimated_effort_hours must be a whole number of hours')
    .min(1, 'estimated_effort_hours must be between 1 and 500')
    .max(500, 'estimated_effort_hours must be between 1 and 500'),
});

// ---------------------------------------------------------------------------
// Roadmaps
// ---------------------------------------------------------------------------

/**
 * `POST /roadmaps/generate` — generate a career roadmap.
 *
 *  - 3.5  `currentRole`/`targetRole` are 2..100 non-whitespace characters;
 *         `targetDurationMonths` is a whole number in 1..36.
 */
export const generateRoadmapBodySchema = z.object({
  currentRole: boundedString('current_role', 2, 100),
  targetRole: boundedString('target_role', 2, 100),
  targetDurationMonths: z
    .number({
      required_error: 'target_duration_months is required',
      invalid_type_error: 'target_duration_months must be a number',
    })
    .int('target_duration_months must be a whole number of months')
    .min(1, 'target_duration_months must be between 1 and 36')
    .max(36, 'target_duration_months must be between 1 and 36'),
});

/**
 * A single milestone within a saved roadmap draft
 * (`Omit<IMilestone, 'id' | 'completed' | 'completedAt'>`). Each field is
 * bounded per Requirement 3.3.
 */
const milestoneDraftSchema = z.object({
  sequence: z
    .number({
      required_error: 'sequence is required',
      invalid_type_error: 'sequence must be a number',
    })
    .int('sequence must be a whole number')
    .min(1, 'sequence must be at least 1'),
  title: boundedString('title', 1, 150),
  description: boundedString('description', 20, 1000),
  skills: skillsArray('skills', 0, 10),
  estimatedDurationWeeks: z
    .number({
      required_error: 'estimated_duration_weeks is required',
      invalid_type_error: 'estimated_duration_weeks must be a number',
    })
    .int('estimated_duration_weeks must be a whole number of weeks')
    .min(1, 'estimated_duration_weeks must be between 1 and 156')
    .max(156, 'estimated_duration_weeks must be between 1 and 156'),
});

/**
 * `POST /roadmaps` — save a generated roadmap draft.
 *
 * Validates the draft shape: `currentRole`/`targetRole` (2..100 non-whitespace),
 * `targetDurationMonths` (whole 1..36), and a `milestones` array of 3..12
 * bounded milestone drafts (Requirements 4.1, 3.1, 3.3).
 */
export const saveRoadmapBodySchema = z.object({
  currentRole: boundedString('current_role', 2, 100),
  targetRole: boundedString('target_role', 2, 100),
  targetDurationMonths: z
    .number({
      required_error: 'target_duration_months is required',
      invalid_type_error: 'target_duration_months must be a number',
    })
    .int('target_duration_months must be a whole number of months')
    .min(1, 'target_duration_months must be between 1 and 36')
    .max(36, 'target_duration_months must be between 1 and 36'),
  milestones: z
    .array(milestoneDraftSchema)
    .min(3, 'milestones must contain at least 3 milestones')
    .max(12, 'milestones must not contain more than 12 milestones'),
});

/**
 * `PATCH /roadmaps/:roadmapId/milestones/:milestoneId` — params for milestone
 * completion updates.
 */
export const milestoneParamsSchema = z.object({
  roadmapId: uuidParam,
  milestoneId: uuidParam,
});

/**
 * `PATCH /roadmaps/:roadmapId/milestones/:milestoneId` — body toggling a
 * milestone's completion state (Requirements 4.4, 4.5, 4.6).
 */
export const updateMilestoneBodySchema = z.object({
  completed: z.boolean({
    required_error: 'completed is required',
    invalid_type_error: 'completed must be a boolean',
  }),
});

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/**
 * `GET /courses/search` — course search query params.
 *
 *  - 5.6  `query` must be 2..100 non-whitespace characters.
 *  - optional `cost` filter is one of Free or Paid (Requirement 5.3).
 */
export const searchCoursesQuerySchema = z.object({
  query: boundedString('query', 2, 100),
  cost: costEnum.optional(),
});

/**
 * `POST /courses/saved` — save a course bookmark.
 *
 *  - 6.2  `title` (1..150), `provider` (1..100), `url` (HTTPS, <=2048 chars),
 *         and `cost` (Free|Paid) are each bounded; an invalid field is rejected
 *         with a message naming the field and its accepted value or range.
 */
export const saveCourseBodySchema = z.object({
  title: boundedString('title', 1, 150),
  provider: boundedString('provider', 1, 100),
  url: httpsUrl(2048),
  cost: costEnum,
});

// ---------------------------------------------------------------------------
// Shared id params
// ---------------------------------------------------------------------------

/**
 * Route params schema for endpoints that take a single `:id` UUID
 * (project delete, roadmap get/delete, saved-course delete).
 */
export const idParamsSchema = z.object({
  id: uuidParam,
});
