/**
 * Interview service facade (Requirements 1.x–6.x, plus the STAR passthroughs).
 *
 * A thin orchestration layer the controller calls. It exposes a single,
 * cohesive surface for the Interview module and delegates every operation to
 * the focused component services that own the heavy business logic:
 *
 *   - Question_Generator → {@link startSession} via {@link generateQuestions}
 *   - Answer_Evaluator   → {@link evaluateAnswer} via {@link evaluateAnswerImpl}
 *   - Scorecard_Engine   → {@link computeScorecard} via {@link computeScorecardImpl}
 *                          / {@link fetchCachedScorecard}
 *   - STAR_Organizer     → {@link createStory}, {@link listStories},
 *                          {@link getStory}, {@link updateStory},
 *                          {@link deleteStory}
 *
 * Beyond delegation the facade owns the **session lifecycle state machine**
 * (`PENDING → ACTIVE → COMPLETED → SCORED`). Every state-sensitive operation
 * loads the session RLS-scoped to the caller, validates the current
 * `Lifecycle_State` BEFORE acting, and rejects an out-of-state request with a
 * typed {@link ValidationError} that names the current state (Requirements 2.5,
 * 3.5, 4.4, 5.9). It also performs the `ACTIVE → COMPLETED` transition once the
 * last answer is submitted (Requirement 3.7).
 *
 * Authentication and tenancy: every operation threads the per-request,
 * RLS-scoped Supabase client and the authenticated `userId`. Row Level Security
 * is the source of truth for ownership; a no-rows outcome is mapped to
 * {@link NotFoundError} so the API never leaks the existence of other users'
 * data (Requirements 6.3, 12.4).
 *
 * Module isolation: this file imports NO Resume (Module 1) code. The optional
 * resume reference is verified by reading the `resume_versions` table through
 * the RLS-scoped client only (design "Module Isolation").
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IAnswerEvaluation,
  ICreateSessionInput,
  ICreateStarInput,
  IInterviewQuestion,
  IInterviewSession,
  IInterviewSessionDetail,
  IInterviewSessionSummary,
  IPerformanceScorecard,
  IStarStory,
  ISubmitAnswerInput,
  IUpdateStarInput,
  LifecycleState,
  PassFailTier,
} from '../types/interview.types.js';
import {
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

import { evaluateAnswer as evaluateAnswerImpl } from './interview.answerEvaluator.service.js';
import { generateQuestions } from './interview.questionGenerator.service.js';
import {
  computeScorecard as computeScorecardImpl,
  fetchCachedScorecard,
} from './interview.scorecard.service.js';
import {
  createStory as createStoryImpl,
  deleteStory as deleteStoryImpl,
  getStory as getStoryImpl,
  listStories as listStoriesImpl,
  updateStory as updateStoryImpl,
} from './interview.starOrganizer.service.js';

/** Table holding the `Interview_Sessions`. */
const SESSIONS_TABLE = 'interview_sessions';

/** Table holding the `Interview_Questions` with embedded evaluation columns. */
const QUESTIONS_TABLE = 'interview_questions';

/** Table holding the referenced (Module 1) resume versions. */
const RESUME_VERSIONS_TABLE = 'resume_versions';

/** Columns selected/returned for a persisted session row. */
const SESSION_COLUMNS =
  'id, user_id, state, difficulty_tier, job_description, question_count, resume_version_id, created_at';

/** Columns selected/returned for a persisted question row. */
const QUESTION_COLUMNS =
  'id, user_id, session_id, position, text, answer_text, response_latency_seconds, quality_score, grammar_score, feedback_comment, created_at';

/** Session states in which an answer may be submitted (Requirement 3.5). */
const ANSWERABLE_STATE: LifecycleState = 'ACTIVE';

/** Session states in which evaluation / scoring is permitted (Req 4.4, 5.9). */
const SCOREABLE_STATES: ReadonlySet<LifecycleState> = new Set<LifecycleState>([
  'COMPLETED',
  'SCORED',
]);

/**
 * The raw `interview_sessions` row shape as returned by Supabase
 * (`snake_case`).
 */
interface InterviewSessionRow {
  id: string;
  user_id: string;
  state: LifecycleState;
  difficulty_tier: IInterviewSession['difficultyTier'];
  job_description: string;
  question_count: number;
  resume_version_id: string | null;
  created_at: string;
}

/**
 * The raw `interview_questions` row shape as returned by Supabase
 * (`snake_case`). Score columns are `null` until an evaluation is persisted.
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
 * The `interview_sessions` row joined with the (optional) scorecard summary
 * columns, used by {@link listSessions} (Requirement 6.1).
 */
interface InterviewSessionSummaryRow {
  id: string;
  state: LifecycleState;
  difficulty_tier: IInterviewSession['difficultyTier'];
  created_at: string;
  interview_scorecards:
    | Array<{ overall_score: number; pass_fail_tier: PassFailTier }>
    | { overall_score: number; pass_fail_tier: PassFailTier }
    | null;
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Create a new `Interview_Session` in `PENDING` state (Requirements 1.1, 1.2,
 * 1.9).
 *
 * When a `resumeVersionId` is supplied it is verified to exist and be owned by
 * the caller (RLS scopes the read); an absent/unowned reference surfaces as a
 * {@link NotFoundError} naming the invalid resume reference (Requirement 1.9).
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @param input    The validated session-creation payload.
 * @returns The created session mapped to {@link IInterviewSession}.
 * @throws {NotFoundError} when the supplied resume reference is invalid (1.9).
 * @throws {InternalError} when persistence fails for a system reason.
 */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  input: ICreateSessionInput
): Promise<IInterviewSession> {
  const resumeVersionId: string | null = input.resumeVersionId ?? null;

  // Verify the optional resume reference exists and is owned (Requirement 1.2,
  // 1.9). RLS already scopes the read to the caller; a no-rows outcome means
  // the reference is invalid for this user.
  if (resumeVersionId !== null) {
    await assertResumeVersionOwned(supabase, resumeVersionId);
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .insert({
      user_id: userId,
      state: 'PENDING',
      difficulty_tier: input.difficultyTier,
      job_description: input.jobDescription,
      question_count: input.questionCount,
      resume_version_id: resumeVersionId,
    })
    .select(SESSION_COLUMNS)
    .returns<InterviewSessionRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to create the interview session.',
      error.message
    );
  }

  const row: InterviewSessionRow | undefined =
    data !== null ? data[0] : undefined;
  if (row === undefined) {
    throw new InternalError(
      'The interview session was not returned after creation.'
    );
  }

  return mapSessionRow(row);
}

/**
 * Start a `PENDING` session: generate, persist, and order its questions and
 * transition the session to `ACTIVE` (Requirements 2.2, 2.5).
 *
 * The session is loaded RLS-scoped to the caller (no-rows → {@link NotFoundError}),
 * and its state is validated to be `PENDING`; any other state is rejected with
 * a {@link ValidationError} naming the current state (Requirement 2.5). The
 * generation, invariant enforcement, persistence, and `PENDING → ACTIVE`
 * transition are owned by {@link generateQuestions}.
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id.
 * @param sessionId The session to start.
 * @returns The generated questions ordered by 1-based position.
 * @throws {NotFoundError} when the session is absent/unowned.
 * @throws {ValidationError} when the session is not `PENDING` (2.5).
 * @throws {AiProviderError} when question generation fails.
 */
export async function startSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IInterviewQuestion[]> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  if (session.state !== 'PENDING') {
    throw new ValidationError(
      `The session cannot be started because it is not pending. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  return generateQuestions(supabase, session);
}

/**
 * Submit a `Candidate_Answer` to a question in an `ACTIVE` session
 * (Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 3.7).
 *
 * Flow: load the session (no-rows → {@link NotFoundError}); reject unless it is
 * `ACTIVE`, naming the current state (Requirement 3.5); load the question
 * scoped to the session + user (no-rows → {@link NotFoundError}, Requirement
 * 3.6); reject with a {@link ConflictError} when the question already carries an
 * answer (Requirement 3.4); persist the answer text + response latency
 * (Requirement 3.1); when this submission answers the LAST unanswered question,
 * transition the session to `COMPLETED` (Requirement 3.7); return the updated
 * question (Requirement 3.2).
 *
 * @param supabase   Per-request, RLS-scoped Supabase client.
 * @param userId     Owning user id.
 * @param sessionId  The owning session.
 * @param questionId The question being answered.
 * @param input      The validated answer payload (text + latency).
 * @returns The updated question mapped to {@link IInterviewQuestion}.
 * @throws {NotFoundError} when the session or question is absent/unowned.
 * @throws {ValidationError} when the session is not `ACTIVE` (3.5).
 * @throws {ConflictError} when the question is already answered (3.4).
 * @throws {InternalError} when persistence or the transition fails.
 */
export async function submitAnswer(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  questionId: string,
  input: ISubmitAnswerInput
): Promise<IInterviewQuestion> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  // Guard 3.5: only ACTIVE sessions accept answers; name the current state.
  if (session.state !== ANSWERABLE_STATE) {
    throw new ValidationError(
      `The session must be active to accept answers. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  // Load the question scoped to the session + user (Requirement 3.6).
  const question: IInterviewQuestion = await loadQuestion(
    supabase,
    userId,
    sessionId,
    questionId
  );

  // Guard 3.4: reject a re-answer of an already-answered question.
  if (question.answerText !== null) {
    throw new ConflictError(
      'This question has already been answered.',
      { questionId }
    );
  }

  // Persist the answer text + response latency (Requirement 3.1).
  const updated: IInterviewQuestion = await persistAnswer(
    supabase,
    userId,
    sessionId,
    questionId,
    input
  );

  // Requirement 3.7: when the last answer is submitted, transition to
  // COMPLETED. A transition failure leaves the session ACTIVE and surfaces an
  // error indicating the transition could not be completed.
  await maybeCompleteSession(supabase, userId, sessionId);

  return updated;
}

/**
 * Evaluate one answered question of a `COMPLETED`/`SCORED` session
 * (Requirement 4.4).
 *
 * The session is loaded (no-rows → {@link NotFoundError}) and rejected unless it
 * is `COMPLETED` or `SCORED`, naming the current state (Requirement 4.4); the
 * question is loaded scoped to the session + user (no-rows →
 * {@link NotFoundError}); the per-answer evaluation, the answer-present (4.3)
 * and answer-length (4.6) guards, and persistence are owned by
 * {@link evaluateAnswerImpl}.
 *
 * @param supabase   Per-request, RLS-scoped Supabase client.
 * @param userId     Owning user id.
 * @param sessionId  The owning session.
 * @param questionId The question to evaluate.
 * @returns The persisted {@link IAnswerEvaluation}.
 * @throws {NotFoundError} when the session or question is absent/unowned.
 * @throws {ValidationError} when the session is not completed (4.4).
 * @throws {AiProviderError} when evaluation fails.
 */
export async function evaluateAnswer(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  questionId: string
): Promise<IAnswerEvaluation> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  if (!SCOREABLE_STATES.has(session.state)) {
    throw new ValidationError(
      `The session must be completed before evaluations can be requested. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  const question: IInterviewQuestion = await loadQuestion(
    supabase,
    userId,
    sessionId,
    questionId
  );

  return evaluateAnswerImpl(supabase, session, question);
}

/**
 * Compute (or return the cached) {@link IPerformanceScorecard} for a
 * `COMPLETED`/`SCORED` session (Requirement 5.9).
 *
 * The session is loaded (no-rows → {@link NotFoundError}) and rejected unless it
 * is `COMPLETED` or `SCORED`, naming the current state (Requirement 5.9); the
 * session's questions are loaded ordered by position; the aggregation, the
 * Pressure AI call, the cached-scorecard short-circuit (5.11), and the
 * all-or-nothing persistence + `→ SCORED` transition are owned by
 * {@link computeScorecardImpl}.
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id.
 * @param sessionId The owning session.
 * @returns The computed (or cached) {@link IPerformanceScorecard}.
 * @throws {NotFoundError} when the session is absent/unowned.
 * @throws {ValidationError} when the session is not completed (5.9).
 * @throws {AiProviderError} when evaluation or the Pressure call fails.
 */
export async function computeScorecard(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IPerformanceScorecard> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  if (!SCOREABLE_STATES.has(session.state)) {
    throw new ValidationError(
      `The session must be completed before scoring. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  const questions: IInterviewQuestion[] = await loadQuestions(
    supabase,
    userId,
    sessionId
  );

  return computeScorecardImpl(supabase, session, questions);
}

/**
 * List the caller's `Interview_Sessions` newest-first, joining the
 * `Overall_Score` and `Pass_Fail_Tier` from the associated scorecard where one
 * exists (Requirement 6.1). Returns an empty array when the user has none.
 *
 * @param supabase Per-request, RLS-scoped Supabase client.
 * @param userId   Owning user id.
 * @returns The user's session summaries, newest first (possibly empty).
 * @throws {InternalError} when the lookup fails for a system reason.
 */
export async function listSessions(
  supabase: SupabaseClient,
  userId: string
): Promise<IInterviewSessionSummary[]> {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(
      'id, state, difficulty_tier, created_at, interview_scorecards(overall_score, pass_fail_tier)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<InterviewSessionSummaryRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to list the interview sessions.',
      error.message
    );
  }

  return (data ?? []).map(mapSummaryRow);
}

/**
 * Retrieve a full {@link IInterviewSessionDetail}: the session configuration,
 * its questions (ordered by position, with answers/latencies/evaluations where
 * present), and the scorecard if present (Requirements 6.2, 6.3).
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id.
 * @param sessionId The session to retrieve.
 * @returns The full session detail.
 * @throws {NotFoundError} when the session is absent/unowned (6.3).
 * @throws {InternalError} when a lookup fails for a system reason.
 */
export async function getSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IInterviewSessionDetail> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  const [questions, scorecard]: [
    IInterviewQuestion[],
    IPerformanceScorecard | null,
  ] = await Promise.all([
    loadQuestions(supabase, userId, sessionId),
    fetchCachedScorecard(supabase, userId, sessionId),
  ]);

  return { ...session, questions, scorecard };
}

/**
 * Delete an `Interview_Session` owned by the caller. The session is deleted
 * RLS-scoped to the owning user; the `interview_questions` and
 * `interview_scorecards` child rows are removed automatically by the
 * `ON DELETE CASCADE` foreign keys. A no-rows outcome (absent or unowned)
 * surfaces as {@link NotFoundError} so the API never reveals another user's
 * data.
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id.
 * @param sessionId The session to delete.
 * @throws {NotFoundError} when the session is absent/unowned.
 * @throws {InternalError} when the deletion fails for a system reason.
 */
export async function deleteSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('id')
    .returns<Array<{ id: string }>>();

  if (error !== null) {
    throw new InternalError(
      'Failed to delete the interview session.',
      error.message
    );
  }

  if (data === null || data.length === 0) {
    throw new NotFoundError('The requested interview session was not found.');
  }
}

/**
 * Force-end an `ACTIVE` session: fill every unanswered question with
 * `"I don't know"` and `responseLatencySeconds: 0`, then transition the
 * session to `COMPLETED`. Used when the user presses the "end call" button
 * mid-interview.
 *
 * @param supabase  Per-request, RLS-scoped Supabase client.
 * @param userId    Owning user id.
 * @param sessionId The session to force-end.
 * @returns The full session detail after force-ending.
 * @throws {NotFoundError} when the session is absent/unowned.
 * @throws {ValidationError} when the session is not `ACTIVE`.
 * @throws {InternalError} when persistence or the transition fails.
 */
export async function forceEndSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IInterviewSessionDetail> {
  const session: IInterviewSession = await loadSession(
    supabase,
    userId,
    sessionId
  );

  if (session.state !== ANSWERABLE_STATE) {
    throw new ValidationError(
      `The session must be active to force-end. Current state: ${session.state}.`,
      { currentState: session.state }
    );
  }

  // Load all questions for this session.
  const questions: IInterviewQuestion[] = await loadQuestions(
    supabase,
    userId,
    sessionId
  );

  // Fill every unanswered question with "I don't know".
  const unanswered = questions.filter((q) => q.answerText === null);
  for (const q of unanswered) {
    await persistAnswer(supabase, userId, sessionId, q.id, {
      answerText: "I don't know",
      responseLatencySeconds: 0,
    });
  }

  // Transition to COMPLETED.
  const { error: transitionError } = await supabase
    .from(SESSIONS_TABLE)
    .update({ state: 'COMPLETED' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('state', ANSWERABLE_STATE);

  if (transitionError !== null) {
    throw new InternalError(
      'The session could not be transitioned to completed.',
      transitionError.message
    );
  }

  // Return the full session detail (now COMPLETED with all questions answered).
  return getSession(supabase, userId, sessionId);
}

// ---------------------------------------------------------------------------
// STAR_Organizer passthroughs
// ---------------------------------------------------------------------------

/**
 * Create a new `STAR_Story` for the caller (Requirements 7.1, 7.5). Delegates
 * to the STAR_Organizer.
 */
export async function createStory(
  supabase: SupabaseClient,
  userId: string,
  input: ICreateStarInput
): Promise<IStarStory> {
  return createStoryImpl(supabase, userId, input);
}

/**
 * List the caller's `STAR_Stories` newest-first (Requirement 8.1). Delegates to
 * the STAR_Organizer.
 */
export async function listStories(
  supabase: SupabaseClient,
  userId: string
): Promise<IStarStory[]> {
  return listStoriesImpl(supabase, userId);
}

/**
 * Fetch a single `STAR_Story` by id (Requirements 8.2, 8.3). Delegates to the
 * STAR_Organizer.
 */
export async function getStory(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<IStarStory> {
  return getStoryImpl(supabase, userId, id);
}

/**
 * Update a `STAR_Story`, mutating only the supplied fields (Requirements 9.1,
 * 9.5). Delegates to the STAR_Organizer.
 */
export async function updateStory(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: IUpdateStarInput
): Promise<IStarStory> {
  return updateStoryImpl(supabase, userId, id, input);
}

/**
 * Delete a `STAR_Story` by id (Requirements 10.1, 10.3). Delegates to the
 * STAR_Organizer.
 */
export async function deleteStory(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<void> {
  return deleteStoryImpl(supabase, userId, id);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load a session by id RLS-scoped to the owning user and map it to
 * {@link IInterviewSession}. A no-rows outcome (absent or unowned) surfaces as
 * {@link NotFoundError} (Requirements 6.3, 12.4).
 */
async function loadSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IInterviewSession> {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<InterviewSessionRow>();

  if (error !== null) {
    throw new InternalError(
      'Failed to load the interview session.',
      error.message
    );
  }
  if (data === null) {
    throw new NotFoundError('The requested interview session was not found.');
  }

  return mapSessionRow(data);
}

/**
 * Load every question for a session RLS-scoped to the owning user, ordered by
 * 1-based position, mapping each row (with its embedded evaluation when
 * present) to {@link IInterviewQuestion}.
 */
async function loadQuestions(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<IInterviewQuestion[]> {
  const { data, error } = await supabase
    .from(QUESTIONS_TABLE)
    .select(QUESTION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .returns<InterviewQuestionRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to load the interview questions.',
      error.message
    );
  }

  return (data ?? []).map(mapQuestionRow);
}

/**
 * Load a single question scoped to the session + owning user, mapping a no-rows
 * outcome to {@link NotFoundError} (Requirement 3.6).
 */
async function loadQuestion(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  questionId: string
): Promise<IInterviewQuestion> {
  const { data, error } = await supabase
    .from(QUESTIONS_TABLE)
    .select(QUESTION_COLUMNS)
    .eq('id', questionId)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<InterviewQuestionRow>();

  if (error !== null) {
    throw new InternalError(
      'Failed to load the interview question.',
      error.message
    );
  }
  if (data === null) {
    throw new NotFoundError('The requested interview question was not found.');
  }

  return mapQuestionRow(data);
}

/**
 * Persist the answer text + response latency on the question row, scoped to the
 * session + owning user, and return the updated question (Requirements 3.1,
 * 3.2). A no-rows outcome surfaces as {@link NotFoundError}.
 */
async function persistAnswer(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  questionId: string,
  input: ISubmitAnswerInput
): Promise<IInterviewQuestion> {
  const { data, error } = await supabase
    .from(QUESTIONS_TABLE)
    .update({
      answer_text: input.answerText,
      response_latency_seconds: input.responseLatencySeconds,
    })
    .eq('id', questionId)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .select(QUESTION_COLUMNS)
    .returns<InterviewQuestionRow[]>();

  if (error !== null) {
    throw new InternalError(
      'Failed to persist the candidate answer.',
      error.message
    );
  }

  const row: InterviewQuestionRow | undefined =
    data !== null ? data[0] : undefined;
  if (row === undefined) {
    throw new NotFoundError('The requested interview question was not found.');
  }

  return mapQuestionRow(row);
}

/**
 * Transition the session `ACTIVE → COMPLETED` when no unanswered questions
 * remain (Requirement 3.7). When one or more questions still lack an answer the
 * session is left `ACTIVE`. A transition failure throws an {@link InternalError}
 * indicating the transition could not be completed, leaving the session
 * `ACTIVE`.
 */
async function maybeCompleteSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<void> {
  const { count, error } = await supabase
    .from(QUESTIONS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('answer_text', null);

  if (error !== null) {
    throw new InternalError(
      'Failed to determine the interview completion state.',
      error.message
    );
  }

  // Questions still awaiting an answer → remain ACTIVE.
  if ((count ?? 0) > 0) {
    return;
  }

  const { error: transitionError } = await supabase
    .from(SESSIONS_TABLE)
    .update({ state: 'COMPLETED' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('state', ANSWERABLE_STATE);

  if (transitionError !== null) {
    throw new InternalError(
      'The session could not be transitioned to completed.',
      transitionError.message
    );
  }
}

/**
 * Assert that the referenced resume version exists and is owned by the caller
 * (RLS scopes the read). A no-rows outcome surfaces as {@link NotFoundError}
 * naming the invalid resume reference (Requirement 1.9).
 */
async function assertResumeVersionOwned(
  supabase: SupabaseClient,
  resumeVersionId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(RESUME_VERSIONS_TABLE)
    .select('id')
    .eq('id', resumeVersionId)
    .maybeSingle<{ id: string }>();

  if (error !== null) {
    throw new InternalError(
      'Failed to verify the resume reference.',
      error.message
    );
  }
  if (data === null) {
    throw new NotFoundError(
      `The referenced resume version was not found: ${resumeVersionId}.`,
      { resumeVersionId }
    );
  }
}

/**
 * Map a raw `interview_sessions` row (`snake_case`) to the camelCase
 * {@link IInterviewSession} domain object.
 */
function mapSessionRow(row: InterviewSessionRow): IInterviewSession {
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state,
    difficultyTier: row.difficulty_tier,
    jobDescription: row.job_description,
    questionCount: row.question_count,
    resumeVersionId: row.resume_version_id,
    createdAt: row.created_at,
  };
}

/**
 * Map a raw `interview_questions` row (`snake_case`) to the camelCase
 * {@link IInterviewQuestion} domain object, embedding the {@link IAnswerEvaluation}
 * only when every score column is present.
 */
function mapQuestionRow(row: InterviewQuestionRow): IInterviewQuestion {
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

/**
 * Map a joined `interview_sessions` + scorecard row to the camelCase
 * {@link IInterviewSessionSummary}, surfacing the `Overall_Score` and
 * `Pass_Fail_Tier` from the associated scorecard where present (Requirement
 * 6.1). The embedded scorecard relation may arrive as an array or a single
 * object depending on the join shape; both are normalized here.
 */
function mapSummaryRow(
  row: InterviewSessionSummaryRow
): IInterviewSessionSummary {
  const scorecard = Array.isArray(row.interview_scorecards)
    ? (row.interview_scorecards[0] ?? null)
    : row.interview_scorecards;

  return {
    id: row.id,
    state: row.state,
    difficultyTier: row.difficulty_tier,
    createdAt: row.created_at,
    overallScore: scorecard !== null ? scorecard.overall_score : null,
    passFailTier: scorecard !== null ? scorecard.pass_fail_tier : null,
  };
}
