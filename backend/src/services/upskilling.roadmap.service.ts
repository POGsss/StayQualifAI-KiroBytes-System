/**
 * Roadmap_Service (Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 4.1–4.9, 7.5).
 *
 * Generates a Career_Roadmap from a current role → Target_Role transition via
 * the module-local AI_Provider wrapper ({@link generateJson}) and persists /
 * tracks roadmaps and their Milestones through the per-request, RLS-scoped
 * Supabase client.
 *
 * Generation contract
 * -------------------
 * `generateRoadmap` calls the AI_Provider with a 20-second timeout and validates
 * the returned payload against a strict Zod schema enforcing every roadmap
 * invariant BEFORE anything is persisted (generation is intentionally separate
 * from {@link saveRoadmap}, so a provider failure persists nothing — Requirement
 * 3.6):
 *   - between 3 and 12 Milestones (Requirement 3.1),
 *   - per-Milestone field bounds (Requirement 3.3),
 *   - combined estimated duration in `(0, 156]` weeks (Requirement 3.4).
 * The service then assigns contiguous sequence positions `1..n` (Requirement
 * 3.2). Any schema violation is normalized to {@link AiProviderError} by
 * {@link generateJson}.
 *
 * Persistence contract
 * -------------------
 * `saveRoadmap` inserts the roadmap then its Milestones (completion defaults to
 * not-completed / null timestamp — Requirement 4.2), preserving Milestone count
 * and sequence ordering (Requirement 4.1). Reads/updates/deletes are owner- (or
 * parent-) scoped; a row owned by another user (or a non-existent id) surfaces
 * as {@link NotFoundError} (Requirements 4.8, 7.4), never as an authorization
 * error.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  IGenerateRoadmapInput,
  IMilestone,
  IRoadmap,
  IRoadmapDetail,
  IRoadmapDraft,
  IRoadmapSummary,
} from '../types/upskilling.types.js';
import { InternalError, NotFoundError } from '../utils/errors.js';
import { generateJson } from './upskilling.aiProvider.service.js';

/** Per-call timeout (ms) for roadmap generation (Requirements 3.1, 3.6). */
const ROADMAP_GENERATION_TIMEOUT_MS = 20_000;

/** Roadmap Milestone count bounds (Requirement 3.1). */
const MIN_MILESTONES = 3;
const MAX_MILESTONES = 12;

/** Per-Milestone field bounds (Requirement 3.3). */
const TITLE_MIN_NW = 1;
const TITLE_MAX_NW = 150;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;
const SKILLS_MAX = 10;
const SKILL_MIN_NW = 1;
const SKILL_MAX_NW = 50;
const DURATION_WEEKS_MIN = 1;
const DURATION_WEEKS_MAX = 156;

/** Combined-duration bound, in weeks (Requirement 3.4). */
const TOTAL_WEEKS_MAX = 156;

/** Tables owned by this service. */
const ROADMAPS_TABLE = 'upskilling_roadmaps';
const MILESTONES_TABLE = 'upskilling_milestones';

/** Columns selected for a persisted roadmap row. */
const ROADMAP_COLUMNS =
  'id, current_role, target_role, target_duration_months, created_at';

/** Columns selected for a persisted milestone row. */
const MILESTONE_COLUMNS =
  'id, sequence, title, description, skills, estimated_duration_weeks, completed, completed_at';

/** Count of non-whitespace characters in a string. */
function nonWhitespaceLength(value: string): number {
  return value.replace(/\s/g, '').length;
}

/**
 * Strict schema the parsed Gemini JSON response must satisfy. Field bounds and
 * the array-count / total-duration invariants are enforced here so any
 * out-of-bounds AI output is rejected uniformly as an {@link AiProviderError}
 * (Requirements 3.1, 3.3, 3.4) and never persisted. Sequence positions are NOT
 * taken from the model — the service assigns contiguous `1..n` (Requirement
 * 3.2).
 */
export const roadmapSchema = z
  .object({
    milestones: z
      .array(
        z
          .object({
            title: z.string(),
            description: z.string(),
            skills: z.array(z.string()),
            estimatedDurationWeeks: z.number(),
          })
          .superRefine((milestone, ctx) => {
            const titleNw = nonWhitespaceLength(milestone.title);
            if (titleNw < TITLE_MIN_NW || titleNw > TITLE_MAX_NW) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `title must be ${TITLE_MIN_NW}-${TITLE_MAX_NW} non-whitespace characters`,
                path: ['title'],
              });
            }

            const descriptionLength = milestone.description.length;
            if (
              descriptionLength < DESCRIPTION_MIN ||
              descriptionLength > DESCRIPTION_MAX
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters`,
                path: ['description'],
              });
            }

            if (milestone.skills.length > SKILLS_MAX) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `skills must contain at most ${SKILLS_MAX} entries`,
                path: ['skills'],
              });
            }

            const seenSkills = new Set<string>();
            for (const skill of milestone.skills) {
              const skillNw = nonWhitespaceLength(skill);
              if (skillNw < SKILL_MIN_NW || skillNw > SKILL_MAX_NW) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `each skill must be ${SKILL_MIN_NW}-${SKILL_MAX_NW} non-whitespace characters`,
                  path: ['skills'],
                });
              }
              const normalized = skill.trim().toLowerCase();
              if (seenSkills.has(normalized)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'skills must be unique',
                  path: ['skills'],
                });
              }
              seenSkills.add(normalized);
            }

            if (
              !Number.isInteger(milestone.estimatedDurationWeeks) ||
              milestone.estimatedDurationWeeks < DURATION_WEEKS_MIN ||
              milestone.estimatedDurationWeeks > DURATION_WEEKS_MAX
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `estimatedDurationWeeks must be a whole number in ${DURATION_WEEKS_MIN}-${DURATION_WEEKS_MAX}`,
                path: ['estimatedDurationWeeks'],
              });
            }
          })
      )
      .min(MIN_MILESTONES)
      .max(MAX_MILESTONES),
  })
  .superRefine((roadmap, ctx) => {
    const totalWeeks = roadmap.milestones.reduce(
      (sum, milestone) => sum + milestone.estimatedDurationWeeks,
      0
    );
    if (totalWeeks <= 0 || totalWeeks > TOTAL_WEEKS_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `combined milestone duration must be greater than 0 and at most ${TOTAL_WEEKS_MAX} weeks`,
        path: ['milestones'],
      });
    }
  });

/** Raw `upskilling_roadmaps` row shape (snake_case). */
interface RoadmapRow {
  id: string;
  current_role: string;
  target_role: string;
  target_duration_months: number;
  created_at: string;
}

/** Raw `upskilling_milestones` row shape (snake_case). */
interface MilestoneRow {
  id: string;
  sequence: number;
  title: string;
  description: string;
  skills: string[] | null;
  estimated_duration_weeks: number;
  completed: boolean;
  completed_at: string | null;
}

/**
 * Generate a Career_Roadmap for the requested transition (Requirements 3.1–3.4,
 * 3.6). The result is a draft only — it is not persisted. Contiguous sequence
 * positions `1..n` are assigned by the service (Requirement 3.2).
 *
 * @throws {AiProviderError} when generation fails, times out, or the output
 *   violates any roadmap invariant; nothing is persisted (Requirement 3.6).
 */
export async function generateRoadmap(
  input: IGenerateRoadmapInput
): Promise<IRoadmapDraft> {
  const systemInstruction: string = buildSystemInstruction();
  const prompt: string = buildPrompt(input);

  const result = await generateJson({
    prompt,
    schema: roadmapSchema,
    systemInstruction,
    timeoutMs: ROADMAP_GENERATION_TIMEOUT_MS,
  });

  // Assign contiguous sequence positions 1..n (Requirement 3.2). The model is
  // never trusted to number its own milestones.
  const milestones: IRoadmapDraft['milestones'] = result.milestones.map(
    (milestone, index) => ({
      sequence: index + 1,
      title: milestone.title,
      description: milestone.description,
      skills: milestone.skills,
      estimatedDurationWeeks: milestone.estimatedDurationWeeks,
    })
  );

  return {
    currentRole: input.currentRole,
    targetRole: input.targetRole,
    targetDurationMonths: input.targetDurationMonths,
    milestones,
  };
}

/**
 * Persist a generated Career_Roadmap and its Milestones as records owned by the
 * requesting user (Requirements 4.1, 4.2, 7.5). Milestone completion defaults
 * to not-completed with a null completion timestamp; count and sequence
 * ordering are preserved.
 *
 * If the Milestone insert fails the just-created roadmap is removed so no
 * partial roadmap survives.
 */
export async function saveRoadmap(
  supabase: SupabaseClient,
  userId: string,
  draft: IRoadmapDraft
): Promise<IRoadmap> {
  const { data: roadmapRow, error: roadmapError } = await supabase
    .from(ROADMAPS_TABLE)
    .insert({
      user_id: userId,
      current_role: draft.currentRole,
      target_role: draft.targetRole,
      target_duration_months: draft.targetDurationMonths,
    })
    .select(ROADMAP_COLUMNS)
    .single<RoadmapRow>();

  if (roadmapError !== null || roadmapRow === null) {
    throw new InternalError(
      'Failed to persist the roadmap.',
      roadmapError?.message
    );
  }

  const milestoneRows = draft.milestones.map((milestone) => ({
    roadmap_id: roadmapRow.id,
    sequence: milestone.sequence,
    title: milestone.title,
    description: milestone.description,
    skills: milestone.skills,
    estimated_duration_weeks: milestone.estimatedDurationWeeks,
  }));

  const { data: milestoneData, error: milestoneError } = await supabase
    .from(MILESTONES_TABLE)
    .insert(milestoneRows)
    .select(MILESTONE_COLUMNS)
    .returns<MilestoneRow[]>();

  if (
    milestoneError !== null ||
    milestoneData === null ||
    milestoneData.length !== milestoneRows.length
  ) {
    // Roll back the roadmap so no partial record survives.
    await supabase
      .from(ROADMAPS_TABLE)
      .delete()
      .eq('id', roadmapRow.id)
      .eq('user_id', userId);
    throw new InternalError(
      'Failed to persist the roadmap milestones.',
      milestoneError?.message
    );
  }

  const milestones: IMilestone[] = milestoneData
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(mapMilestoneRow);

  return mapRoadmapRow(roadmapRow, milestones);
}

/**
 * List the requesting user's saved Career_Roadmaps, ordered by creation
 * timestamp descending, each with its completed / total Milestone counts
 * (Requirements 4.3, 4.7). Returns an empty list when the user owns none.
 */
export async function listRoadmaps(
  supabase: SupabaseClient,
  userId: string
): Promise<IRoadmapSummary[]> {
  const { data, error } = await supabase
    .from(ROADMAPS_TABLE)
    .select(`${ROADMAP_COLUMNS}, ${MILESTONES_TABLE}(completed)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error !== null) {
    throw new InternalError('Failed to fetch roadmaps.', error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const milestones =
      (row[MILESTONES_TABLE] as Array<{ completed: boolean }> | null) ?? [];
    const totalCount = milestones.length;
    const completedCount = milestones.filter(
      (milestone) => milestone.completed
    ).length;

    return {
      id: row.id as string,
      currentRole: row.current_role as string,
      targetRole: row.target_role as string,
      targetDurationMonths: row.target_duration_months as number,
      createdAt: row.created_at as string,
      completedCount,
      totalCount,
    };
  });
}

/**
 * Fetch a single owned Career_Roadmap with its Milestones (ordered by sequence)
 * plus completed / total Milestone counts (Requirements 4.7, 4.8). A roadmap
 * owned by another user (or a non-existent id) surfaces as {@link NotFoundError}
 * (Requirement 7.4).
 */
export async function getRoadmap(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<IRoadmapDetail> {
  const { data, error } = await supabase
    .from(ROADMAPS_TABLE)
    .select(`${ROADMAP_COLUMNS}, ${MILESTONES_TABLE}(${MILESTONE_COLUMNS})`)
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error !== null || data === null) {
    throw new NotFoundError('Roadmap not found.');
  }

  const row = data as Record<string, unknown>;
  const roadmapRow: RoadmapRow = {
    id: row.id as string,
    current_role: row.current_role as string,
    target_role: row.target_role as string,
    target_duration_months: row.target_duration_months as number,
    created_at: row.created_at as string,
  };

  const milestoneRows = (row[MILESTONES_TABLE] as MilestoneRow[] | null) ?? [];
  const milestones: IMilestone[] = milestoneRows
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(mapMilestoneRow);

  const totalCount = milestones.length;
  const completedCount = milestones.filter(
    (milestone) => milestone.completed
  ).length;

  return {
    ...mapRoadmapRow(roadmapRow, milestones),
    completedCount,
    totalCount,
  };
}

/**
 * Set the completion state of an owned Milestone (Requirements 4.4, 4.5, 4.6,
 * 4.8). The operation is idempotent: when the requested state already matches
 * the stored state nothing is written, so completing an already-complete
 * Milestone leaves its completion timestamp unchanged (Requirement 4.5).
 * Uncompleting clears the timestamp (Requirement 4.6).
 *
 * Ownership is enforced via the parent roadmap (RLS plus an explicit owner
 * check); a Milestone under another user's roadmap (or a non-existent id)
 * surfaces as {@link NotFoundError} (Requirement 7.4).
 */
export async function setMilestoneCompletion(
  supabase: SupabaseClient,
  userId: string,
  roadmapId: string,
  milestoneId: string,
  completed: boolean
): Promise<IMilestone> {
  // Verify the parent roadmap is owned by the requesting user. A non-owned or
  // missing roadmap is reported as not-found (Requirement 7.4).
  const { data: roadmap, error: roadmapError } = await supabase
    .from(ROADMAPS_TABLE)
    .select('id')
    .eq('id', roadmapId)
    .eq('user_id', userId)
    .single();

  if (roadmapError !== null || roadmap === null) {
    throw new NotFoundError('Roadmap not found.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from(MILESTONES_TABLE)
    .select(MILESTONE_COLUMNS)
    .eq('id', milestoneId)
    .eq('roadmap_id', roadmapId)
    .single<MilestoneRow>();

  if (fetchError !== null || existing === null) {
    throw new NotFoundError('Milestone not found.');
  }

  // Idempotent: when the state already matches, leave the row (and its
  // completion timestamp) untouched (Requirement 4.5).
  if (existing.completed === completed) {
    return mapMilestoneRow(existing);
  }

  const completedAt: string | null = completed
    ? new Date().toISOString()
    : null;

  const { data: updated, error: updateError } = await supabase
    .from(MILESTONES_TABLE)
    .update({ completed, completed_at: completedAt })
    .eq('id', milestoneId)
    .eq('roadmap_id', roadmapId)
    .select(MILESTONE_COLUMNS)
    .single<MilestoneRow>();

  if (updateError !== null || updated === null) {
    throw new NotFoundError('Milestone not found.');
  }

  return mapMilestoneRow(updated);
}

/**
 * Delete an owned Career_Roadmap; its Milestones are removed by the FK
 * `ON DELETE CASCADE` (Requirement 4.9). A roadmap owned by another user (or a
 * non-existent id) surfaces as {@link NotFoundError} (Requirements 4.8, 7.4).
 */
export async function deleteRoadmap(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from(ROADMAPS_TABLE)
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError !== null || existing === null) {
    throw new NotFoundError('Roadmap not found.');
  }

  const { error: deleteError } = await supabase
    .from(ROADMAPS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (deleteError !== null) {
    throw new InternalError(
      'Failed to delete the roadmap.',
      deleteError.message
    );
  }
}

/** Build the system instruction steering roadmap generation. */
function buildSystemInstruction(): string {
  return [
    'You are an expert career coach who designs step-by-step upskilling',
    'roadmaps for professionals transitioning between roles.',
    `Produce between ${MIN_MILESTONES} and ${MAX_MILESTONES} ordered milestones`,
    'that progress logically from the current role toward the target role.',
    `Each milestone title must be concise (${TITLE_MIN_NW}-${TITLE_MAX_NW} characters),`,
    `each description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters,`,
    `each milestone lists 0-${SKILLS_MAX} unique skills (each ${SKILL_MIN_NW}-${SKILL_MAX_NW} characters),`,
    `and each milestone has a whole-number duration of ${DURATION_WEEKS_MIN}-${DURATION_WEEKS_MAX} weeks.`,
    `The combined duration of all milestones must not exceed ${TOTAL_WEEKS_MAX} weeks.`,
    'List the milestones in the order they should be completed. Respond ONLY',
    'with a JSON object of the shape',
    '{ "milestones": [{ "title": string, "description": string, "skills": string[], "estimatedDurationWeeks": number }] }',
    'and nothing else.',
  ].join(' ');
}

/** Compose the content prompt from the requested transition. */
function buildPrompt(input: IGenerateRoadmapInput): string {
  return [
    `Design a career-transition roadmap from "${input.currentRole}" to`,
    `"${input.targetRole}" over a target horizon of`,
    `${input.targetDurationMonths} month(s).`,
    'Order the milestones from the earliest to the latest step, keeping the',
    `total estimated duration within ${TOTAL_WEEKS_MAX} weeks.`,
  ].join(' ');
}

/** Map a raw roadmap row plus its milestones to the {@link IRoadmap} shape. */
function mapRoadmapRow(row: RoadmapRow, milestones: IMilestone[]): IRoadmap {
  return {
    id: row.id,
    currentRole: row.current_role,
    targetRole: row.target_role,
    targetDurationMonths: row.target_duration_months,
    createdAt: row.created_at,
    milestones,
  };
}

/** Map a raw milestone row (snake_case) to the {@link IMilestone} shape. */
function mapMilestoneRow(row: MilestoneRow): IMilestone {
  return {
    id: row.id,
    sequence: row.sequence,
    title: row.title,
    description: row.description,
    skills: row.skills ?? [],
    estimatedDurationWeeks: row.estimated_duration_weeks,
    completed: row.completed,
    completedAt: row.completed_at,
  };
}
