/**
 * Project_Generator_Service (Requirements 1.1, 1.2, 1.3, 1.6, 2.1, 2.2, 2.3,
 * 2.4, 2.5, 2.7, 7.5).
 *
 * Owns the Role-Based Project Generator sub-feature of the Upskilling module:
 *
 *   - {@link generateProjects} — builds a Gemini prompt (incorporating any
 *     optional focus skills), calls the module-local AI_Provider
 *     ({@link generateJson}) with a strict project Zod schema at a 20-second
 *     timeout, and returns between 3 and 5 bounded `Project_Suggestion`s. All
 *     per-suggestion field bounds (Requirement 1.2) are enforced by the schema,
 *     so any out-of-bounds AI output surfaces as an {@link AiProviderError}
 *     rather than being returned. Focus-skill coverage (Requirement 1.3) is
 *     enforced as a post-generation invariant.
 *   - {@link saveProject} — persists a suggestion owned by the requesting user
 *     through the per-request, RLS-scoped Supabase client (Requirements 2.1,
 *     2.7, 7.5).
 *   - {@link listProjects} — returns the user's suggestions ordered by
 *     `created_at` DESC, then `id` ASC (Requirements 2.2, 2.3).
 *   - {@link deleteProject} — deletes an owned suggestion; a delete that
 *     affects zero rows (absent or owned by another user under RLS) surfaces as
 *     a {@link NotFoundError} (Requirements 2.4, 2.5).
 *
 * Module isolation: this service talks to Gemini ONLY through the module-local
 * {@link generateJson} wrapper and imports no other module's code.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  DifficultyLevel,
  IGenerateProjectsInput,
  IProjectSuggestion,
} from '../types/upskilling.types.js';
import {
  AiProviderError,
  InternalError,
  NotFoundError,
} from '../utils/errors.js';
import { generateJson } from './upskilling.aiProvider.service.js';

/** Per-call timeout (ms) for project generation (Requirement 1.1). */
const GENERATION_TIMEOUT_MS = 20_000;

/** Table holding persisted `Project_Suggestion`s. */
const SUGGESTIONS_TABLE = 'upskilling_project_suggestions';

/** Columns selected/returned for a persisted suggestion row. */
const SUGGESTION_COLUMNS =
  'id, user_id, target_role, title, description, demonstrated_skills, difficulty, estimated_effort_hours, created_at';

/** Minimum / maximum number of suggestions returned per generation. */
const MIN_SUGGESTIONS = 3;
const MAX_SUGGESTIONS = 5;

/**
 * The fields required to persist a `Project_Suggestion`. The `id` and
 * `createdAt` are assigned by the database on insert.
 */
export type ISaveProjectInput = Omit<IProjectSuggestion, 'id' | 'createdAt'>;

/**
 * A single non-whitespace-bounded skill string: trimmed length must be within
 * `[1, 50]` (Requirements 1.2, 1.3). Purely-whitespace entries are rejected.
 */
const skillSchema = z
  .string()
  .refine((value: string): boolean => {
    const trimmed = value.trim();
    return trimmed.length >= 1 && trimmed.length <= 50;
  }, 'Each skill must be 1 to 50 non-whitespace characters.');

/**
 * Schema for a single generated `Project_Suggestion`. Every per-suggestion
 * bound from Requirement 1.2 is enforced here so out-of-bounds AI output is
 * treated as a provider failure (Requirement 1.6) by {@link generateJson}.
 */
const suggestionSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(50).max(1000),
  demonstratedSkills: z
    .array(skillSchema)
    .min(1)
    .max(10)
    .refine((skills: string[]): boolean => {
      const normalized = skills.map((s: string): string =>
        s.trim().toLowerCase()
      );
      return new Set(normalized).size === normalized.length;
    }, 'Demonstrated skills must be unique.'),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  estimatedEffortHours: z.number().int().min(1).max(500),
});

/**
 * Schema the parsed Gemini JSON response must satisfy: between 3 and 5
 * suggestions (Requirement 1.1), each satisfying {@link suggestionSchema}.
 */
const generationSchema = z.object({
  suggestions: z.array(suggestionSchema).min(MIN_SUGGESTIONS).max(MAX_SUGGESTIONS),
});

type GeneratedSuggestion = z.infer<typeof suggestionSchema>;

/**
 * Generate between 3 and 5 portfolio `Project_Suggestion`s tailored to the
 * supplied `Target_Role` (and optional focus skills). The result is validated
 * against {@link generationSchema}; any provider failure, timeout, empty/invalid
 * response, or schema mismatch is normalized to an {@link AiProviderError} by
 * {@link generateJson} (Requirement 1.6).
 *
 * When focus skills are supplied, the union of demonstrated skills across the
 * returned suggestions must include at least one of them; otherwise the output
 * is treated as a provider failure so the caller can retry (Requirement 1.3).
 *
 * The returned suggestions are NOT persisted: their `id` and `createdAt` are
 * empty until {@link saveProject} stores them.
 *
 * @param input The validated generation request (role + optional focus skills).
 * @returns 3–5 generated, bounds-satisfying suggestions.
 * @throws {AiProviderError} on any generation failure or unmet focus coverage.
 */
export async function generateProjects(
  input: IGenerateProjectsInput
): Promise<IProjectSuggestion[]> {
  const focusSkills: string[] = (input.focusSkills ?? [])
    .map((s: string): string => s.trim())
    .filter((s: string): boolean => s.length > 0);

  const systemInstruction: string = buildSystemInstruction();
  const prompt: string = buildPrompt(input.targetRole, focusSkills);

  const result = await generateJson({
    prompt,
    schema: generationSchema,
    systemInstruction,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });

  assertFocusCoverage(result.suggestions, focusSkills);

  return result.suggestions.map(
    (suggestion: GeneratedSuggestion): IProjectSuggestion =>
      toSuggestion(input.targetRole, suggestion)
  );
}

/**
 * Enforce focus-skill coverage (Requirement 1.3): when focus skills are
 * supplied, the union of demonstrated skills across all returned suggestions
 * must include at least one focus skill (case-insensitive). A miss is treated
 * as a provider failure so the request can be retried.
 */
function assertFocusCoverage(
  suggestions: ReadonlyArray<GeneratedSuggestion>,
  focusSkills: string[]
): void {
  if (focusSkills.length === 0) {
    return;
  }

  const demonstrated = new Set<string>();
  for (const suggestion of suggestions) {
    for (const skill of suggestion.demonstratedSkills) {
      demonstrated.add(skill.trim().toLowerCase());
    }
  }

  const covered: boolean = focusSkills.some((focus: string): boolean =>
    demonstrated.has(focus.toLowerCase())
  );

  if (!covered) {
    throw new AiProviderError(
      'The AI provider returned suggestions that did not cover any of the requested focus skills.',
      { focusSkills }
    );
  }
}

/**
 * Persist a `Project_Suggestion` as a record owned by the requesting user
 * (Requirements 2.1, 2.7, 7.5). The `user_id` is set explicitly and enforced by
 * RLS through the JWT-scoped client.
 *
 * @returns The persisted record including its generated `id` and `createdAt`.
 * @throws {InternalError} when persistence fails.
 */
export async function saveProject(
  supabase: SupabaseClient,
  userId: string,
  input: ISaveProjectInput
): Promise<IProjectSuggestion> {
  const { data, error } = await supabase
    .from(SUGGESTIONS_TABLE)
    .insert({
      user_id: userId,
      target_role: input.targetRole,
      title: input.title,
      description: input.description,
      demonstrated_skills: input.demonstratedSkills,
      difficulty: input.difficulty,
      estimated_effort_hours: input.estimatedEffortHours,
    })
    .select(SUGGESTION_COLUMNS)
    .single<ProjectSuggestionRow>();

  if (error !== null || data === null) {
    throw new InternalError(
      'Failed to persist the project suggestion.',
      error?.message
    );
  }

  return mapRow(data);
}

/**
 * List the requesting user's saved `Project_Suggestion`s, ordered by
 * `created_at` DESC then `id` ASC (Requirements 2.2, 2.3). Returns an empty
 * list when the user owns none.
 */
export async function listProjects(
  supabase: SupabaseClient,
  userId: string
): Promise<IProjectSuggestion[]> {
  const { data, error } = await supabase
    .from(SUGGESTIONS_TABLE)
    .select(SUGGESTION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .returns<ProjectSuggestionRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to list project suggestions.',
      error.message
    );
  }

  return (data ?? []).map(mapRow);
}

/**
 * Delete an owned `Project_Suggestion`. A delete that affects zero rows (the
 * record is absent or owned by another user under RLS) surfaces as a
 * {@link NotFoundError} so the existence of other users' data is never revealed
 * (Requirements 2.4, 2.5).
 */
export async function deleteProject(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  const { data, error } = await supabase
    .from(SUGGESTIONS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .returns<Array<{ id: string }>>();

  if (error !== null) {
    throw new InternalError(
      'Failed to delete the project suggestion.',
      error.message
    );
  }

  if (data === null || data.length === 0) {
    throw new NotFoundError('Project suggestion not found.');
  }
}

/**
 * The raw `upskilling_project_suggestions` row shape as returned by Supabase
 * (`snake_case`).
 */
interface ProjectSuggestionRow {
  id: string;
  user_id: string;
  target_role: string;
  title: string;
  description: string;
  demonstrated_skills: string[];
  difficulty: DifficultyLevel;
  estimated_effort_hours: number;
  created_at: string;
}

/**
 * Map a raw `upskilling_project_suggestions` row (`snake_case`) to the
 * camelCase {@link IProjectSuggestion} domain object.
 */
function mapRow(row: ProjectSuggestionRow): IProjectSuggestion {
  return {
    id: row.id,
    targetRole: row.target_role,
    title: row.title,
    description: row.description,
    demonstratedSkills: row.demonstrated_skills,
    difficulty: row.difficulty,
    estimatedEffortHours: row.estimated_effort_hours,
    createdAt: row.created_at,
  };
}

/**
 * Build a generated (not-yet-persisted) {@link IProjectSuggestion}. The `id`
 * and `createdAt` are empty until the suggestion is saved.
 */
function toSuggestion(
  targetRole: string,
  suggestion: GeneratedSuggestion
): IProjectSuggestion {
  return {
    id: '',
    targetRole,
    title: suggestion.title,
    description: suggestion.description,
    demonstratedSkills: suggestion.demonstratedSkills.map((s: string): string =>
      s.trim()
    ),
    difficulty: suggestion.difficulty,
    estimatedEffortHours: suggestion.estimatedEffortHours,
    createdAt: '',
  };
}

/**
 * System instruction steering Gemini to act as a career mentor and return only
 * the agreed JSON shape with bounds-satisfying suggestions.
 */
function buildSystemInstruction(): string {
  return [
    'You are an expert career mentor generating portfolio project ideas that',
    'demonstrate the skills employers expect for a given target role.',
    `Generate between ${MIN_SUGGESTIONS} and ${MAX_SUGGESTIONS} distinct project`,
    'suggestions. Each suggestion must have: a concise title (3-150 chars); a',
    'description (50-1000 chars); 1-10 unique demonstrated skills, each 1-50',
    'characters; a difficulty of exactly one of Beginner, Intermediate, or',
    'Advanced; and an integer estimatedEffortHours between 1 and 500. Respond',
    'ONLY with a JSON object of the shape { "suggestions": [{ "title": string,',
    '"description": string, "demonstratedSkills": string[], "difficulty":',
    'string, "estimatedEffortHours": number }] } and nothing else.',
  ].join(' ');
}

/**
 * Compose the content prompt from the target role and any optional focus
 * skills. When focus skills are present, the model is told to ensure the
 * suggestions collectively cover at least one of them (Requirement 1.3).
 */
function buildPrompt(targetRole: string, focusSkills: string[]): string {
  const lines: string[] = [
    `Generate portfolio project suggestions for the target role: "${targetRole.trim()}".`,
  ];

  if (focusSkills.length > 0) {
    lines.push(
      '',
      'The candidate wants to focus on the following skills:',
      focusSkills.join(', '),
      '',
      'Across the set of suggestions, the combined demonstrated skills MUST',
      'include at least one of these focus skills.'
    );
  }

  lines.push(
    '',
    `Return between ${MIN_SUGGESTIONS} and ${MAX_SUGGESTIONS} suggestions in the agreed JSON shape.`
  );

  return lines.join('\n');
}
