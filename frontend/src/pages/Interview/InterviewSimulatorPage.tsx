import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { useInterviewStore } from '../../stores/interview.store';
import type {
  DifficultyTier,
  ICreateSessionInput,
  IInterviewQuestion,
} from '../../types/interview.types';

/**
 * InterviewSimulatorPage — the Custom Interview Simulator tab of the Interview
 * module.
 *
 * Flow:
 *  1. Create a session by choosing a difficulty tier, pasting a job
 *     description (1–5000 chars), selecting a question count (5–15), and
 *     optionally referencing a resume version (Req 1.1). On success the created
 *     session is opened in the store so it becomes the active session.
 *  2. Start the session to generate the tailored questions (Req 2.2); the
 *     questions render ordered by their 1-based position.
 *  3. Answer each question with a measured client-side response latency: the
 *     moment a question is first presented is recorded, and the elapsed seconds
 *     are computed at submit time and sent with the answer (Req 3.1).
 *
 * All data flows through the interview Zustand store; this page never calls the
 * service or Supabase directly. `isLoading` disables in-flight controls and any
 * `error` is surfaced in an accessible alert.
 *
 * Validates: Requirements 1.1, 2.2, 3.1
 */

/** Selectable difficulty tiers in presentation order. */
const DIFFICULTY_TIERS: ReadonlyArray<{ value: DifficultyTier; label: string }> = [
  { value: 'ENTRY', label: 'Entry' },
  { value: 'MID', label: 'Mid' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'LEAD', label: 'Lead' },
];

const JOB_DESCRIPTION_MAX = 5000;
const QUESTION_COUNT_MIN = 5;
const QUESTION_COUNT_MAX = 15;
const ANSWER_MAX = 5000;

/** Compute non-negative elapsed seconds from a recorded presentation time. */
function elapsedSeconds(presentedAt: number | undefined): number {
  if (presentedAt === undefined) {
    return 0;
  }
  return Math.max(0, (Date.now() - presentedAt) / 1000);
}

export function InterviewSimulatorPage(): JSX.Element {
  const activeSession = useInterviewStore((state) => state.activeSession);
  const activeQuestions = useInterviewStore((state) => state.activeQuestions);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);

  const createSession = useInterviewStore((state) => state.createSession);
  const openSession = useInterviewStore((state) => state.openSession);
  const startSession = useInterviewStore((state) => state.startSession);
  const submitAnswer = useInterviewStore((state) => state.submitAnswer);

  // Session-creation form state (controlled inputs).
  const [difficultyTier, setDifficultyTier] = useState<DifficultyTier>('ENTRY');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(QUESTION_COUNT_MIN);
  const [resumeVersionId, setResumeVersionId] = useState<string>('');

  // Per-question answer drafts keyed by question id.
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  // Records the moment each question was first presented, for latency (Req 3.1).
  const presentedAtRef = useRef<Map<string, number>>(new Map());

  // Stamp the presentation time for any newly presented, unanswered question.
  useEffect(() => {
    const presented = presentedAtRef.current;
    const now = Date.now();
    for (const question of activeQuestions) {
      if (question.answerText === null && !presented.has(question.id)) {
        presented.set(question.id, now);
      }
    }
  }, [activeQuestions]);

  // Questions ordered by their 1-based position (Req 2.2).
  const orderedQuestions = useMemo<IInterviewQuestion[]>(
    () => [...activeQuestions].sort((a, b) => a.position - b.position),
    [activeQuestions],
  );

  const answeredCount = useMemo<number>(
    () => orderedQuestions.filter((q) => q.answerText !== null).length,
    [orderedQuestions],
  );

  const trimmedJd = jobDescription.trim();
  const canCreate =
    !isLoading &&
    trimmedJd.length >= 1 &&
    trimmedJd.length <= JOB_DESCRIPTION_MAX &&
    Number.isInteger(questionCount) &&
    questionCount >= QUESTION_COUNT_MIN &&
    questionCount <= QUESTION_COUNT_MAX;

  const hasSession = activeSession !== null;
  const hasQuestions = orderedQuestions.length > 0;
  const canStart =
    hasSession && activeSession.state === 'PENDING' && !hasQuestions && !isLoading;

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!canCreate) {
        return;
      }
      const input: ICreateSessionInput = {
        difficultyTier,
        jobDescription: trimmedJd,
        questionCount,
      };
      const trimmedResume = resumeVersionId.trim();
      if (trimmedResume.length > 0) {
        input.resumeVersionId = trimmedResume;
      }
      const created = await createSession(input);
      if (created !== null) {
        // Load the created session as the active session (Req 1.1).
        await openSession(created.id);
      }
    },
    [
      canCreate,
      createSession,
      difficultyTier,
      openSession,
      questionCount,
      resumeVersionId,
      trimmedJd,
    ],
  );

  const handleStart = useCallback(async (): Promise<void> => {
    if (activeSession === null) {
      return;
    }
    // Generate the tailored questions and activate the session (Req 2.2).
    await startSession(activeSession.id);
  }, [activeSession, startSession]);

  const handleSubmitAnswer = useCallback(
    async (question: IInterviewQuestion): Promise<void> => {
      if (activeSession === null) {
        return;
      }
      const draft = (answerDrafts[question.id] ?? '').trim();
      if (draft.length === 0 || draft.length > ANSWER_MAX) {
        return;
      }
      const responseLatencySeconds = elapsedSeconds(
        presentedAtRef.current.get(question.id),
      );
      const updated = await submitAnswer(activeSession.id, question.id, {
        answerText: draft,
        responseLatencySeconds,
      });
      if (updated !== null) {
        // Clear the local draft once the answer is persisted.
        setAnswerDrafts((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
      }
    },
    [activeSession, answerDrafts, submitAnswer],
  );

  return (
    <section
      aria-labelledby="simulator-heading"
      className="mx-auto flex max-w-3xl flex-col gap-8"
    >
      <header className="flex flex-col gap-1">
        <h1 id="simulator-heading" className="text-2xl font-semibold text-primary">
          Interview Simulator
        </h1>
        <p className="text-gray-600">
          Create a tailored mock interview, generate questions, and answer them at
          your own pace.
        </p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-md border border-accent-pink bg-accent-pink/30 px-4 py-3 text-sm text-gray-800"
        >
          {error.message}
        </p>
      ) : null}

      {/* Session creation (Req 1.1) */}
      <form
        onSubmit={(event): void => {
          void handleCreate(event);
        }}
        aria-labelledby="create-session-heading"
        className="flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-panel"
      >
        <h2
          id="create-session-heading"
          className="text-lg font-semibold text-gray-900"
        >
          New session
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="difficulty-tier"
              className="text-sm font-medium text-gray-800"
            >
              Difficulty tier
            </label>
            <select
              id="difficulty-tier"
              value={difficultyTier}
              onChange={(event): void =>
                setDifficultyTier(event.target.value as DifficultyTier)
              }
              disabled={isLoading}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
            >
              {DIFFICULTY_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="question-count"
              className="text-sm font-medium text-gray-800"
            >
              Number of questions (5–15)
            </label>
            <input
              id="question-count"
              type="number"
              min={QUESTION_COUNT_MIN}
              max={QUESTION_COUNT_MAX}
              step={1}
              value={questionCount}
              onChange={(event): void =>
                setQuestionCount(Number.parseInt(event.target.value, 10))
              }
              disabled={isLoading}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="job-description"
            className="text-sm font-medium text-gray-800"
          >
            Job description
          </label>
          <textarea
            id="job-description"
            rows={5}
            maxLength={JOB_DESCRIPTION_MAX}
            value={jobDescription}
            onChange={(event): void => setJobDescription(event.target.value)}
            disabled={isLoading}
            aria-describedby="job-description-hint"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
          />
          <span id="job-description-hint" className="text-xs text-gray-500">
            {trimmedJd.length}/{JOB_DESCRIPTION_MAX} characters
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="resume-version-id"
            className="text-sm font-medium text-gray-800"
          >
            Resume version reference (optional)
          </label>
          <input
            id="resume-version-id"
            type="text"
            value={resumeVersionId}
            onChange={(event): void => setResumeVersionId(event.target.value)}
            disabled={isLoading}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={!canCreate}
          className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Working…' : 'Create session'}
        </button>
      </form>

      {/* Start affordance (Req 2.2) */}
      {hasSession ? (
        <section
          aria-labelledby="start-heading"
          className="flex flex-col gap-3 rounded-2xl bg-surface p-6 shadow-panel"
        >
          <h2 id="start-heading" className="text-lg font-semibold text-gray-900">
            Session ready
          </h2>
          <p className="text-sm text-gray-600">
            Tier {activeSession.difficultyTier} · {activeSession.questionCount}{' '}
            questions · state {activeSession.state}
          </p>
          {canStart ? (
            <button
              type="button"
              onClick={(): void => {
                void handleStart();
              }}
              disabled={isLoading}
              className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Generating…' : 'Start interview'}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Questions + answers (Req 3.1) */}
      {hasQuestions ? (
        <section aria-labelledby="questions-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="questions-heading"
              className="text-lg font-semibold text-gray-900"
            >
              Questions
            </h2>
            <p
              className="text-sm text-gray-600"
              role="status"
              aria-live="polite"
            >
              {answeredCount} of {orderedQuestions.length} answered
            </p>
          </div>

          <ol className="flex flex-col gap-4">
            {orderedQuestions.map((question) => {
              const isAnswered = question.answerText !== null;
              const draft = answerDrafts[question.id] ?? '';
              const textareaId = `answer-${question.id}`;
              const canSubmit =
                !isAnswered && draft.trim().length > 0 && !isLoading;
              return (
                <li
                  key={question.id}
                  className="flex flex-col gap-3 rounded-2xl bg-surface p-6 shadow-panel"
                >
                  <p className="font-medium text-gray-900">
                    <span className="text-primary">Q{question.position}.</span>{' '}
                    {question.text}
                  </p>

                  {isAnswered ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium text-accent-green">
                        Answer submitted
                        {question.responseLatencySeconds !== null
                          ? ` · ${Math.round(question.responseLatencySeconds)}s`
                          : ''}
                      </p>
                      <p className="whitespace-pre-wrap rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                        {question.answerText}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor={textareaId}
                        className="text-sm font-medium text-gray-800"
                      >
                        Your answer
                      </label>
                      <textarea
                        id={textareaId}
                        rows={4}
                        maxLength={ANSWER_MAX}
                        value={draft}
                        onChange={(event): void =>
                          setAnswerDrafts((prev) => ({
                            ...prev,
                            [question.id]: event.target.value,
                          }))
                        }
                        disabled={isLoading}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={(): void => {
                          void handleSubmitAnswer(question);
                        }}
                        disabled={!canSubmit}
                        className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Submit answer
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
