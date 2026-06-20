import { useEffect, useMemo } from 'react';
import type { JSX } from 'react';

import { TierBadge } from '../../components/TierBadge';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  IInterviewSessionDetail,
  IInterviewSessionSummary,
} from '../../types/interview.types';

/**
 * InterviewSessionsPage — the Sessions tab of the Interview module.
 *
 * Lists the authenticated user's past interview sessions (newest first) and
 * lets the user open any session to review its full detail. All data flows
 * through the interview Zustand store (`useInterviewStore`); this page never
 * calls the service or the Supabase client directly.
 *
 * Behaviour:
 *  - On mount, loads the user's session summaries (`loadSessions`).
 *  - Renders the summaries in an accessible table ordered by creation date
 *    descending. Each row shows the lifecycle state, difficulty tier, creation
 *    timestamp, overall score (or "—" when no scorecard exists yet) and — when
 *    a pass/fail tier is present — a `TierBadge` (Req 6.1).
 *  - Each row has a "View detail" control that opens the session
 *    (`openSession`, Req 6.2). When the active session is loaded, its full
 *    detail is rendered below: configuration fields, the ordered questions with
 *    their answers, latencies and evaluations where present, and the scorecard
 *    if present (Req 6.2).
 *  - An empty state is shown when the user has no sessions; `isLoading` surfaces
 *    a status message and any `error` is shown in an accessible alert.
 *
 * Requirements: 6.1, 6.2.
 */

/** Format an ISO timestamp for display, tolerating invalid input. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

/** Format a numeric latency (seconds) for display, tolerating null. */
function formatLatency(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  return `${seconds}s`;
}

export function InterviewSessionsPage(): JSX.Element {
  const sessions = useInterviewStore((state) => state.sessions);
  const activeSession = useInterviewStore((state) => state.activeSession);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);

  const loadSessions = useInterviewStore((state) => state.loadSessions);
  const openSession = useInterviewStore((state) => state.openSession);

  // Load the user's session summaries once on mount.
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Defensive sort: the backend already orders newest-first (Req 6.1), but we
  // sort here too so the table is correct regardless of server ordering.
  const orderedSessions = useMemo<IInterviewSessionSummary[]>(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [sessions],
  );

  const selectedId = activeSession?.id ?? '';

  return (
    <section
      aria-labelledby="sessions-heading"
      className="mx-auto flex max-w-4xl flex-col gap-8"
    >
      <header className="flex flex-col gap-1">
        <h1 id="sessions-heading" className="text-2xl font-semibold text-primary">
          Interview Sessions
        </h1>
        <p className="text-gray-600">
          Review your past interview sessions and open any one to see its
          questions, answers and scorecard.
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

      {isLoading ? (
        <p
          role="status"
          className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600"
        >
          Loading interview sessions…
        </p>
      ) : null}

      {!isLoading && orderedSessions.length === 0 ? (
        <p
          role="status"
          className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600"
        >
          No interview sessions yet. Start a session in the Simulator to see it
          here.
        </p>
      ) : null}

      {orderedSessions.length > 0 ? (
        <section
          aria-labelledby="sessions-list-heading"
          className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-panel"
        >
          <h2
            id="sessions-list-heading"
            className="text-lg font-semibold text-gray-900"
          >
            Past sessions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Your interview sessions, ordered newest first.
              </caption>
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="px-3 py-2 font-medium">
                    State
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Tier
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Created
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Overall score
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Result
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedSessions.map((session) => {
                  const isSelected = session.id === selectedId;
                  return (
                    <tr
                      key={session.id}
                      className={`border-b border-gray-100 ${
                        isSelected ? 'bg-primary-50' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-900">{session.state}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {session.difficultyTier}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {formatTimestamp(session.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {session.overallScore ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        {session.passFailTier !== null ? (
                          <TierBadge tier={session.passFailTier} />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(): void => {
                            void openSession(session.id);
                          }}
                          disabled={isLoading}
                          aria-label={`View detail for the ${
                            session.difficultyTier
                          } session created ${formatTimestamp(session.createdAt)}`}
                          className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          View detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSession !== null ? (
        <SessionDetail session={activeSession} />
      ) : null}
    </section>
  );
}

/** Renders the full detail of the active session (Req 6.2). */
function SessionDetail({
  session,
}: {
  session: IInterviewSessionDetail;
}): JSX.Element {
  const orderedQuestions = useMemo(
    () => [...session.questions].sort((a, b) => a.position - b.position),
    [session.questions],
  );

  return (
    <section
      aria-labelledby="session-detail-heading"
      className="flex flex-col gap-6 rounded-2xl bg-surface p-6 shadow-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="session-detail-heading"
          className="text-lg font-semibold text-gray-900"
        >
          Session detail
        </h2>
        {session.scorecard !== null ? (
          <TierBadge tier={session.scorecard.passFailTier} />
        ) : null}
      </div>

      {/* Configuration fields */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-medium text-gray-500">State</dt>
          <dd className="text-gray-900">{session.state}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-gray-500">Difficulty tier</dt>
          <dd className="text-gray-900">{session.difficultyTier}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-gray-500">Question count</dt>
          <dd className="text-gray-900">{session.questionCount}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-gray-500">Created</dt>
          <dd className="text-gray-900">{formatTimestamp(session.createdAt)}</dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="font-medium text-gray-500">Resume reference</dt>
          <dd className="text-gray-900">{session.resumeVersionId ?? 'None'}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <dt className="font-medium text-gray-500">Job description</dt>
          <dd className="whitespace-pre-wrap text-gray-900">
            {session.jobDescription}
          </dd>
        </div>
      </dl>

      {/* Scorecard (when present) */}
      {session.scorecard !== null ? (
        <section aria-labelledby="detail-scorecard-heading" className="flex flex-col gap-2">
          <h3
            id="detail-scorecard-heading"
            className="text-base font-semibold text-gray-900"
          >
            Scorecard
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
            <div className="flex flex-col">
              <dt className="text-gray-500">Answer quality</dt>
              <dd className="font-semibold text-gray-900">
                {session.scorecard.answerQualityScore}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-gray-500">Grammar</dt>
              <dd className="font-semibold text-gray-900">
                {session.scorecard.grammarScore}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-gray-500">Latency</dt>
              <dd className="font-semibold text-gray-900">
                {session.scorecard.latencyScore}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-gray-500">Pressure</dt>
              <dd className="font-semibold text-gray-900">
                {session.scorecard.pressureScore}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-gray-500">Overall</dt>
              <dd className="font-semibold text-gray-900">
                {session.scorecard.overallScore}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* Ordered questions with answers, latencies and evaluations */}
      <section aria-labelledby="detail-questions-heading" className="flex flex-col gap-3">
        <h3
          id="detail-questions-heading"
          className="text-base font-semibold text-gray-900"
        >
          Questions
        </h3>
        {orderedQuestions.length === 0 ? (
          <p className="text-sm text-gray-500">
            This session has no questions yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {orderedQuestions.map((question) => (
              <li
                key={question.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <p className="font-medium text-gray-900">
                  <span className="text-gray-500">Q{question.position}.</span>{' '}
                  {question.text}
                </p>
                <dl className="mt-2 flex flex-col gap-2 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Answer
                    </dt>
                    <dd className="whitespace-pre-wrap text-gray-800">
                      {question.answerText ?? 'Not answered'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Latency
                    </dt>
                    <dd className="text-gray-800">
                      {formatLatency(question.responseLatencySeconds)}
                    </dd>
                  </div>
                  {question.evaluation !== null ? (
                    <div className="flex flex-col gap-1 rounded-md bg-gray-50 px-3 py-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Evaluation
                      </dt>
                      <dd className="flex flex-col gap-1 text-gray-800">
                        <span>
                          Quality {question.evaluation.qualityScore} · Grammar{' '}
                          {question.evaluation.grammarScore}
                        </span>
                        <span className="whitespace-pre-wrap">
                          {question.evaluation.feedbackComment}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
