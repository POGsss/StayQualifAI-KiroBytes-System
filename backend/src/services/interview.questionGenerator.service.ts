/**
 * Question_Generator (Requirements 2.1, 2.2, 2.3, 2.4, 2.6).
 *
 * Generates a tailored set of `Interview_Questions` for a `PENDING`
 * `Interview_Session` using the module-local AI_Provider wrapper
 * ({@link generateJson}), enforces the post-generation invariants, and — only
 * when every invariant holds — persists the questions (ordered by their 1-based
 * position) and transitions the session to `ACTIVE`.
 *
 * Generation contract
 * -------------------
 * The AI_Provider is called with the `Job_Description`, the `Difficulty_Tier`,
 * the requested `Question_Count`, and (where present) the referenced
 * `Structured_Resume` content. A tier-tailored system instruction steers
 * question depth (Requirement 2.3):
 *   - ENTRY  → foundational concepts
 *   - MID    → applied problem-solving
 *   - SENIOR → systems design and leadership
 *   - LEAD   → strategic decision-making and cross-functional impact
 *
 * The response is validated against {@link questionsSchema}; any provider
 * failure, timeout, empty/invalid response, or schema mismatch is already
 * normalized to {@link AiProviderError} by {@link generateJson} (Requirement
 * 2.4).
 *
 * Post-generation invariants (applied BEFORE any persistence — Requirements
 * 2.1, 2.6):
 *   1. the number of questions equals the requested `Question_Count`,
 *   2. every question text is non-empty after trimming,
 *   3. no two question texts are identical within the session.
 * If any invariant fails the response is treated as an {@link AiProviderError}:
 * nothing is persisted and the session is left in `PENDING` state.
 *
 * Module isolation: the referenced resume is read by reference from the
 * `resume_versions` table through the per-request, RLS-scoped Supabase client;
 * this module imports NO Resume module code (design "Module Isolation").
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  DifficultyTier,
  IInterviewQuestion,
  IInterviewSession,
} from '../types/interview.types.js';
import { AiProviderError, InternalError } from '../utils/errors.js';
import { generateJson } from './interview.aiProvider.service.js';

/** Per-call timeout (ms) for question generation (Requirement 2.4). */
const GENERATION_TIMEOUT_MS = 30_000;

/** Table holding the generated `Interview_Questions`. */
const QUESTIONS_TABLE = 'interview_questions';

/** Table holding the `Interview_Sessions` whose state we transition. */
const SESSIONS_TABLE = 'interview_sessions';

/** Columns selected/returned for a persisted question row. */
const QUESTION_COLUMNS =
  'id, user_id, session_id, position, text, answer_text, response_latency_seconds, quality_score, grammar_score, feedback_comment, created_at';

/**
 * Schema the parsed Gemini JSON response must satisfy (design
 * "Question_Generator"). Each question carries a non-empty `text`.
 */
export const questionsSchema = z.object({
  questions: z.array(z.object({ text: z.string().min(1) })),
});

/**
 * Tier-tailored guidance appended to the system instruction so generated
 * questions match the requested seniority level (Requirement 2.3).
 */
const TIER_GUIDANCE: Readonly<Record<DifficultyTier, string>> = {
  ENTRY:
    'Target foundational concepts: core fundamentals, definitions, and ' +
    'entry-level practical knowledge expected of a junior candidate.',
  MID:
    'Target applied problem-solving: hands-on scenarios, debugging, and ' +
    'practical trade-offs expected of a mid-level individual contributor.',
  SENIOR:
    'Target systems design and leadership: architecture, scalability, ' +
    'technical decision-making, and mentoring expected of a senior engineer.',
  LEAD:
    'Target strategic decision-making and cross-functional impact: ' +
    'organizational strategy, stakeholder alignment, and broad technical ' +
    'leadership expected of a lead.',
};

/**
 * The raw `interview_questions` row shape as returned by Supabase
 * (`snake_case`). Numeric/score columns are `null` immediately after insert.
 */
interface InterviewQuestionRow {
  id: string;
  user_id: string;
  session_id: string;
  position: number;
  text: string;
  answer_text: string | null;
  response_latency_seconds: number | null;
  quality_score: number | null;
  grammar_score: number | null;
  feedback_comment: string | null;
  created_at: string;
}

/**
 * Generate, validate, and persist the `Interview_Questions` for a `PENDING`
 * session, then transition the session to `ACTIVE` (Requirements 2.1, 2.2,
 * 2.3, 2.6).
 *
 * The caller (the service facade) is responsible for verifying the session is
 * in `PENDING` state before invoking this function (Requirement 2.5); this
 * function performs the generation, invariant enforcement, persistence, and
 * state transition.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param session  The `PENDING` session whose questions are generated.
 * @returns The persisted questions ordered by 1-based position.
 * @throws {AiProviderError} when generation fails or any post-generation
 *   invariant is violated; nothing is persisted and the session stays
 *   `PENDING` (Requirements 2.1, 2.4, 2.6).
 * @throws {InternalError} when persistence or the state transition fails; any
 *   partially-inserted questions are removed so the session stays `PENDING`.
 */
export async function generateQuestions(
  supabase: SupabaseClient,
  session: IInterviewSession
): Promise<IInterviewQuestion[]> {
  const resumeContent: string | null = await loadResumeContent(
    supabase,
    session.resumeVersionId
  );

  const systemInstruction: string = buildSystemInstruction(
    session.difficultyTier
  );
  const prompt: string = buildPrompt(
    session.jobDescription,
    session.difficultyTier,
    session.questionCount,
    resumeContent
  );

  const result = await generateJson({
    prompt,
    schema: questionsSchema,
    systemInstruction,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });

  const texts: string[] = assertInvariants(result.questions, session.questionCount);

  return persistAndActivate(supabase, session, texts);
}

/**
 * Enforce the post-generation invariants BEFORE any persistence (Requirements
 * 2.1, 2.6). Returns the trimmed question texts in order when every invariant
 * holds; otherwise throws an {@link AiProviderError} so the caller persists
 * nothing and leaves the session `PENDING`.
 */
function assertInvariants(
  questions: ReadonlyArray<{ text: string }>,
  requestedCount: number
): string[] {
  // Invariant 1: count equals the requested Question_Count (Requirement 2.1).
  if (questions.length !== requestedCount) {
    throw new AiProviderError(
      'The AI provider returned a number of questions that did not match the requested count.',
      { requested: requestedCount, received: questions.length }
    );
  }

  const texts: string[] = [];
  const seen = new Set<string>();

  for (const question of questions) {
    const trimmed: string = question.text.trim();

    // Invariant 2: every text is non-empty after trimming (Requirement 2.6).
    if (trimmed.length === 0) {
      throw new AiProviderError(
        'The AI provider returned an empty question text.'
      );
    }

    // Invariant 3: no two texts are identical within the session (Requirement 2.6).
    if (seen.has(trimmed)) {
      throw new AiProviderError(
        'The AI provider returned duplicate question texts.'
      );
    }

    seen.add(trimmed);
    texts.push(trimmed);
  }

  return texts;
}

/**
 * Persist the validated questions (ordered by 1-based position) and transition
 * the session `PENDING → ACTIVE` (Requirement 2.2). The batch insert is a
 * single atomic statement; if the subsequent state transition fails, the
 * inserted questions are removed so the session is left `PENDING` with nothing
 * persisted.
 */
async function persistAndActivate(
  supabase: SupabaseClient,
  session: IInterviewSession,
  texts: string[]
): Promise<IInterviewQuestion[]> {
  const rows = texts.map((text: string, index: number) => ({
    user_id: session.userId,
    session_id: session.id,
    position: index + 1, // 1-based position index
    text,
  }));

  const { data, error } = await supabase
    .from(QUESTIONS_TABLE)
    .insert(rows)
    .select(QUESTION_COLUMNS)
    .returns<InterviewQuestionRow[]>();

  if (error !== null) {
    throw new InternalError('Failed to persist interview questions.', error.message);
  }
  if (data === null || data.length !== texts.length) {
    throw new InternalError(
      'Interview questions were not returned after persistence.'
    );
  }

  const { error: transitionError } = await supabase
    .from(SESSIONS_TABLE)
    .update({ state: 'ACTIVE' })
    .eq('id', session.id)
    .eq('user_id', session.userId)
    .eq('state', 'PENDING');

  if (transitionError !== null) {
    // Roll back the inserted questions so the session stays PENDING with
    // nothing persisted (Requirement 2.4 spirit for the persistence path).
    await supabase.from(QUESTIONS_TABLE).delete().eq('session_id', session.id);
    throw new InternalError(
      'Failed to activate the interview session.',
      transitionError.message
    );
  }

  return data
    .slice()
    .sort((a: InterviewQuestionRow, b: InterviewQuestionRow) => a.position - b.position)
    .map(mapRow);
}

/**
 * Load the referenced `Structured_Resume` content by reference (no Resume
 * module imports). The raw stored `content` is read RLS-scoped to the caller
 * and serialized to a compact JSON string for inclusion in the prompt. A
 * missing reference, an absent/unowned row, or unreadable content yields
 * `null` so generation proceeds without resume context (the resume reference is
 * optional — Requirement 2.1).
 */
async function loadResumeContent(
  supabase: SupabaseClient,
  resumeVersionId: string | null
): Promise<string | null> {
  if (resumeVersionId === null) {
    return null;
  }

  const { data, error } = await supabase
    .from('resume_versions')
    .select('content')
    .eq('id', resumeVersionId)
    .maybeSingle<{ content: unknown }>();

  if (error !== null || data === null || data.content === null) {
    return null;
  }

  try {
    return JSON.stringify(data.content);
  } catch {
    return null;
  }
}

/**
 * Build the tier-tailored system instruction (Requirement 2.3). The model is
 * told to act as an interviewer, to match the requested seniority level, and to
 * return only the agreed JSON shape.
 */
function buildSystemInstruction(tier: DifficultyTier): string {
  return [
    'You are an expert technical interviewer generating interview questions',
    'tailored to a specific role and seniority level.',
    TIER_GUIDANCE[tier],
    'Each question must be unique and self-contained. Respond ONLY with a JSON',
    'object of the shape { "questions": [{ "text": string }] } and nothing else.',
  ].join(' ');
}

/**
 * Compose the content prompt from the job description, difficulty tier,
 * requested question count, and (where present) the referenced resume content.
 */
function buildPrompt(
  jobDescription: string,
  tier: DifficultyTier,
  questionCount: number,
  resumeContent: string | null
): string {
  const lines: string[] = [
    `Generate exactly ${questionCount} interview questions for a ${tier} level candidate.`,
    'The questions must be relevant to the following job description.',
    '',
    'Job description:',
    jobDescription,
  ];

  if (resumeContent !== null) {
    lines.push(
      '',
      "Candidate's structured resume (JSON) — tailor questions to this background:",
      resumeContent
    );
  }

  lines.push(
    '',
    `Return exactly ${questionCount} unique, non-empty questions in the agreed JSON shape.`
  );

  return lines.join('\n');
}

/**
 * Map a raw `interview_questions` row (`snake_case`) to the camelCase
 * {@link IInterviewQuestion} domain object. Newly-inserted questions carry no
 * answer or evaluation yet.
 */
function mapRow(row: InterviewQuestionRow): IInterviewQuestion {
  return {
    id: row.id,
    sessionId: row.session_id,
    position: row.position,
    text: row.text,
    answerText: row.answer_text,
    responseLatencySeconds: row.response_latency_seconds,
    evaluation:
      row.quality_score !== null &&
      row.grammar_score !== null &&
      row.feedback_comment !== null
        ? {
            qualityScore: row.quality_score,
            grammarScore: row.grammar_score,
            feedbackComment: row.feedback_comment,
          }
        : null,
  };
}
