import { useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';

import { ScoreDial } from '../../components/ScoreDial';
import { TierBadge } from '../../components/TierBadge';
import { useInterviewStore } from '../../stores/interview.store';
import type { IPerformanceScorecard } from '../../types/interview.types';

/**
 * InterviewScorecardPage — the Performance Scorecard tab of the Interview
 * module.
 *
 * Chosen UX:
 *  1. On mount the page loads the authenticated user's session summaries
 *     (`loadSessions`) so the user can pick which session to score.
 *  2. A session picker (driven by `store.sessions`) lets the user select a
 *     session; selecting it opens the session as the active session
 *     (`openSession`), which also pulls in any already-computed scorecard.
 *  3. Depending on the active session's lifecycle state the page exposes two
 *     actions:
 *       - "Compute scorecard" — runs the scoring engine for a `COMPLETED` (or
 *         `SCORED`, to recompute via the store) session (`computeScorecard`).
 *       - "Retrieve scorecard" — fetches the cached scorecard for a `SCORED`
 *         session without recomputation (`loadScorecard`, Req 5.11).
 *  4. When a scorecard is present, it renders the four dimensions via
 *     `ScoreDial` (Answer Quality, Grammar, Latency, Pressure), the overall
 *     score prominently via a larger `ScoreDial`, and the `TierBadge`
 *     (Req 5.6, 5.7).
 *
 * All data flows through the interview Zustand store; this page never calls the
 * service or Supabase directly. `isLoading` disables in-flight controls and any
 * `error` is surfaced in an accessible alert.
 *
 * Validates: Requirements 5.1, 5.6, 5.7
 */

/** The four scored dimensions, in presentation order, with display labels. */
const DIMENSIONS: ReadonlyArray<{
  key: keyof Pick<
    IPerformanceScorecard,
    'answerQualityScore' | 'grammarScore' | 'latencyScore' | 'pressureScore'
  >;
  label: string;
}> = [
  { key: 'answerQualityScore', label: 'Answer Quality' },
  { key: 'grammarScore', label: 'Grammar' },
  { key: 'latencyScore', label: 'Latency' },
  { key: 'pressureScore', label: 'Pressure' },
];

export function InterviewScorecardPage(): JSX.Element {
  const activeSession = useInterviewStore((state) => state.activeSession);
  const sessions = useInterviewStore((state) => state.sessions);
  const scorecard = useInterviewStore((state) => state.scorecard);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);

  const loadSessions = useInterviewStore((state) => state.loadSessions);
  const openSession = useInterviewStore((state) => state.openSession);
  const computeScorecard = useInterviewStore((state) => state.computeScorecard);
  const loadScorecard = useInterviewStore((state) => state.loadScorecard);

  // Load the user's session summaries once so they can pick one to score.
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const selectedId = activeSession?.id ?? '';

  // A scorecard can be computed once the session has reached COMPLETED/SCORED.
  const canScore =
    activeSession !== null &&
    (activeSession.state === 'COMPLETED' || activeSession.state === 'SCORED');
  // A cached scorecard can be retrieved only once the session is SCORED.
  const isScored = activeSession !== null && activeSession.state === 'SCORED';

  const handleSelect = useCallback(
    (sessionId: string): void => {
      if (sessionId.length === 0 || sessionId === selectedId) {
        return;
      }
      void openSession(sessionId);
    },
    [openSession, selectedId],
  );

  const handleCompute = useCallback((): void => {
    if (activeSession === null) {
      return;
    }
    void computeScorecard(activeSession.id);
  }, [activeSession, computeScorecard]);

  const handleRetrieve = useCallback((): void => {
    if (activeSession === null) {
      return;
    }
    void loadScorecard(activeSession.id);
  }, [activeSession, loadScorecard]);

  // Only show the scorecard when it belongs to the active session.
  const visibleScorecard = useMemo<IPerformanceScorecard | null>(() => {
    if (scorecard === null || activeSession === null) {
      return null;
    }
    return scorecard.sessionId === activeSession.id ? scorecard : null;
  }, [scorecard, activeSession]);

  return (
    <section
      aria-labelledby="scorecard-heading"
      className="mx-auto flex max-w-3xl flex-col gap-8"
    >
      <header className="flex flex-col gap-1">
        <h1 id="scorecard-heading" className="text-2xl font-semibold text-primary">
          Performance Scorecard
        </h1>
        <p className="text-gray-600">
          Pick a completed session, compute its scorecard, and review your
          performance across four dimensions.
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

      {/* Session picker + scoring actions */}
      <section
        aria-labelledby="select-session-heading"
        className="flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-panel"
      >
        <h2
          id="select-session-heading"
          className="text-lg font-semibold text-gray-900"
        >
          Choose a session
        </h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="session-picker" className="text-sm font-medium text-gray-800">
            Session
          </label>
          <select
            id="session-picker"
            value={selectedId}
            onChange={(event): void => handleSelect(event.target.value)}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-50"
          >
            <option value="">Select a session…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.difficultyTier} · {session.state} ·{' '}
                {new Date(session.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          {sessions.length === 0 ? (
            <span className="text-xs text-gray-500">
              No interview sessions yet. Complete a session in the Simulator to
              score it.
            </span>
          ) : null}
        </div>

        {activeSession !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Tier {activeSession.difficultyTier} · {activeSession.questionCount}{' '}
              questions · state {activeSession.state}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCompute}
                disabled={!canScore || isLoading}
                className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Working…' : 'Compute scorecard'}
              </button>
              <button
                type="button"
                onClick={handleRetrieve}
                disabled={!isScored || isLoading}
                className="rounded-md border border-primary px-4 py-2 font-medium text-primary hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retrieve scorecard
              </button>
            </div>
            {!canScore ? (
              <p className="text-xs text-gray-500" role="status">
                The session must be completed before it can be scored.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Scorecard results (Req 5.1, 5.6, 5.7) */}
      {visibleScorecard !== null ? (
        <section
          aria-labelledby="results-heading"
          className="flex flex-col gap-6 rounded-2xl bg-surface p-6 shadow-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-lg font-semibold text-gray-900">
              Results
            </h2>
            <TierBadge tier={visibleScorecard.passFailTier} />
          </div>

          {/* Overall score, prominent */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium uppercase tracking-wide text-gray-500">
              Overall score
            </span>
            <div className="scale-125">
              <ScoreDial score={visibleScorecard.overallScore} label="Overall" />
            </div>
          </div>

          {/* Four dimensions */}
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {DIMENSIONS.map((dimension) => (
              <li key={dimension.key} className="flex justify-center">
                <ScoreDial
                  score={visibleScorecard[dimension.key]}
                  label={dimension.label}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
