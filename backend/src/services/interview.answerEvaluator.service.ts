/**
 * Answer_Evaluator (Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6).
 *
 * Produces an {@link IAnswerEvaluation} for a single `Interview_Question` that
 * already carries a stored `Candidate_Answer`, by calling the module-local
 * AI_Provider wrapper ({@link generateJson}) with the question text and the
 * stored answer, validating the response against {@link evaluationSchema}, and
 * — only on success — persisting the evaluation embedded on the question row,
 * overwriting any previously stored evaluation for that question (Requirement
 * 4.2).
 *
 * Guards enforced HERE (before the AI call):
 *   - The question has a stored `Candidate_Answer` (Requirement 4.3); a
 *     question with no answer is rejected with a {@link ValidationError}.
 *   - The stored answer does not exceed 5 000 characters (Requirement 4.6);
 *     an oversized answer is rejected with a {@link ValidationError} before the
 *     AI_Provider is contacted.
 *   - Defensively, the owning session is in `COMPLETED` or `SCORED` state
 *     (Requirement 4.4). The service facade (task 10.1) is the PRIMARY enforcer
 *     of this lifecycle guard — it loads the session, validates its state, and
 *     maps RLS no-rows to {@link NotFoundError} — but because this function is
 *     handed the already-loaded session it re-checks the state so the
 *     invariant cannot be bypassed.
 *
 * Failure contract (Requirement 4.5): any AI_Provider failure (unavailable,
 * error, timeout, empty/invalid/mis-shaped response) is normalized to
 * {@link AiProviderError} by {@link generateJson}. Because persistence happens
 * strictly AFTER a successful, schema-valid response, an AI failure persists
 * nothing — the prior evaluation (if any) is left untouched.
 *
 * Module isolation: this file imports NO Resume module code and reaches Gemini
 * only through the Interview module-local wrapper (design "Module Isolation").
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  IAnswerEvaluation,
  IInterviewQuestion,
  IInterviewSession,
} from '../types/interview.types.js';
import {
  AiProviderError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { generateJson } from './interview.aiProvider.service.js';

/** Per-call timeout (ms) for answer evaluation (Requirement 4.5). */
const EVALUATION_TIMEOUT_MS = 30_000;

/** Table holding the `Interview_Questions` with embedded evaluation columns. */
const QUESTIONS_TABLE = 'interview_questions';

/** Maximum accepted answer length before the AI call (Requirement 4.6). */
const MAX_ANSWER_LENGTH = 5000;

/** Session states in which evaluation is permitted (Requirement 4.4). */
const EVALUABLE_STATES: ReadonlySet<IInterviewSession['state']> = new Set([
  'COMPLETED',
  'SCORED',
]);

/**
 * Schema the parsed Gemini JSON response must satisfy (design
 * "Answer_Evaluator"). `qualityScore`/`grammarScore` are integers in [0, 100];
 * `feedbackComment` is a non-empty string of at most 2 000 characters.
 */
export const evaluationSchema = z.object({
  qualityScore: z.number().int().min(0).max(100),
  grammarScore: z.number().int().min(0).max(100),
  feedbackComment: z.string().min(1).max(2000),
});

/**
 * Evaluate a single answered `Interview_Question` and persist the resulting
 * evaluation, overwriting any prior evaluation for that question (Requirements
 * 4.1, 4.2).
 *
 * The caller (the service facade) is responsible for loading the session and
 * the question RLS-scoped to the requesting user and for mapping RLS no-rows to
 * {@link NotFoundError}; this function enforces the answer-present (4.3) and
 * answer-length (4.6) guards, defensively re-checks the lifecycle state (4.4),
 * performs the AI call, and persists the result on success only.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param session  The owning session (used for the lifecycle guard and the
 *   `user_id` persistence filter). Expected to be `COMPLETED`/`SCORED`.
 * @param question The question to evaluate; must carry a stored answer.
 * @returns The persisted {@link IAnswerEvaluation}.
 * @throws {ValidationError} when the question has no stored answer (4.3) or the
 *   stored answer exceeds 5 000 characters (4.6), or — defensively — when the
 *   session is not in an evaluable state (4.4).
 * @throws {AiProviderError} when the AI_Provider fails; nothing is persisted
 *   and any prior evaluation is left untouched (4.5).
 * @throws {NotFoundError} when the question row cannot be found for the owner
 *   during persistence.
 * @throws {InternalError} when persistence fails for a system reason.
 */
export async function evaluateAnswer(
  supabase: SupabaseClient,
  session: IInterviewSession,
  question: IInterviewQuestion
): Promise<IAnswerEvaluation> {
  // Guard 4.4 (defensive — the facade is the primary enforcer): only
  // COMPLETED/SCORED sessions may be evaluated; reject naming the current state.
  if (!EVALUABLE_STATES.has(session.state)) {
    throw new ValidationError(
      `The session must be completed before evaluations can be requested. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  // Guard 4.3: the question must have a stored Candidate_Answer.
  const answerText: string | null = question.answerText;
  if (answerText === null || answerText.length === 0) {
    throw new ValidationError(
      'No answer has been submitted for that question.',
      { questionId: question.id }
    );
  }

  // Guard 4.6: reject answers over 5 000 chars BEFORE contacting the AI provider.
  if (answerText.length > MAX_ANSWER_LENGTH) {
    throw new ValidationError(
      `The answer exceeds the maximum length of ${MAX_ANSWER_LENGTH} characters.`,
      { length: answerText.length, max: MAX_ANSWER_LENGTH }
    );
  }

  // AI call — any failure is already normalized to AiProviderError by
  // generateJson, so nothing below this line runs on failure (Requirement 4.5).
  const evaluation: IAnswerEvaluation = await generateJson({
    prompt: buildPrompt(question.text, answerText),
    schema: evaluationSchema,
    systemInstruction: buildSystemInstruction(),
    timeoutMs: EVALUATION_TIMEOUT_MS,
  });

  return persistEvaluation(supabase, session.userId, question.id, evaluation);
}

/**
 * Persist the evaluation embedded on the question row, overwriting any prior
 * evaluation for that question (Requirement 4.2). The update is filtered by the
 * question id and the owning `user_id`; a returned-zero-rows result is mapped to
 * {@link NotFoundError}, and any database error to {@link InternalError}.
 */
async function persistEvaluation(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
  evaluation: IAnswerEvaluation
): Promise<IAnswerEvaluation> {
  const { data, error } = await supabase
    .from(QUESTIONS_TABLE)
    .update({
      quality_score: evaluation.qualityScore,
      grammar_score: evaluation.grammarScore,
      feedback_comment: evaluation.feedbackComment,
    })
    .eq('id', questionId)
    .eq('user_id', userId)
    .select('quality_score, grammar_score, feedback_comment')
    .returns<
      Array<{
        quality_score: number;
        grammar_score: number;
        feedback_comment: string;
      }>
    >();

  if (error !== null) {
    throw new InternalError(
      'Failed to persist the answer evaluation.',
      error.message
    );
  }
  if (data === null || data.length === 0) {
    throw new NotFoundError('The interview question could not be found.');
  }

  const row = data[0];
  if (row === undefined) {
    throw new NotFoundError('The interview question could not be found.');
  }
  return {
    qualityScore: row.quality_score,
    grammarScore: row.grammar_score,
    feedbackComment: row.feedback_comment,
  };
}

/**
 * Build the system instruction steering Gemini to act as an interview coach and
 * to return only the agreed evaluation JSON shape.
 */
function buildSystemInstruction(): string {
  return [
    'You are an expert interview coach evaluating a candidate\'s answer to a',
    'single interview question. Assess the substantive quality of the answer',
    'and the grammar/communication separately, and write concise, actionable',
    'feedback. Respond ONLY with a JSON object of the shape',
    '{ "qualityScore": integer 0-100, "grammarScore": integer 0-100,',
    '"feedbackComment": string } and nothing else.',
  ].join(' ');
}

/**
 * Compose the evaluation prompt from the question text and the candidate's
 * stored answer.
 */
function buildPrompt(questionText: string, answerText: string): string {
  return [
    'Evaluate the following candidate answer to an interview question.',
    '',
    'Question:',
    questionText,
    '',
    'Candidate answer:',
    answerText,
    '',
    'Score answer quality (0-100), grammar and communication (0-100), and',
    'provide a non-empty feedback comment (at most 2000 characters) in the',
    'agreed JSON shape.',
  ].join('\n');
}
