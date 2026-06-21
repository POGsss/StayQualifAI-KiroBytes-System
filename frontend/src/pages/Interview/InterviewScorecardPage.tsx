import { useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';

import { ScoreDial } from '../../components/ScoreDial';
import { SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { useInterviewStore } from '../../stores/interview.store';
import type { IPerformanceScorecard } from '../../types/interview.types';

/**
 * InterviewScorecardPage — Performance Scorecard tab (layout refresh).
 *
 * Presentation changes (task 10.1):
 *  - Canvas: `bg-[#f7f7f8]` (soft gray, per product.md).
 *  - All primary content inside `rounded-2xl bg-white p-6 shadow-sm` panels.
 *  - Shows `SkeletonCard` while `isLoading` is true (Req 14.2, 14.4).
 *  - On error: surfaces the store error inline while preserving any prior
 *    scorecard that was already loaded (Req 14.5).
 *  - Explicit "no scorecard yet" empty-state message within the panel (Req 13.6).
 *  - Four dimension dials + prominent overall dial via `ScoreDial`, pass/fail
 *    via `TierBadge` in a consistent arrangement (Req 13.3).
 *  - Semantic `<h2>` headings and visible focus rings on every interactive
 *    element (Req 13.5).
 *
 * Store interactions are identical to the pre-refresh implementation:
 *   `loadSessions`, `openSession`, `computeScorecard`, `loadScorecard`.
 *
 * Validates: Requirements 13.1, 13.3, 13.5, 13.6, 14.2, 14.4, 14.5
 */

/** Scored dimensions, in presentation order. */
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
  { key: 'pressureScore', label: 'Pressure Handling' },
];

export function InterviewScorecardPage(): JSX.Element {
  // ── Store state ────────────────────────────────────────────────────────────
  const activeSession = useInterviewStore((state) => state.activeSession);
  const sessions = useInterviewStore((state) => state.sessions);
  const scorecard = useInterviewStore((state) => state.scorecard);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);

  // ── Store actions (unchanged) ──────────────────────────────────────────────
  const loadSessions = useInterviewStore((state) => state.loadSessions);
  const openSession = useInterviewStore((state) => state.openSession);
  const computeScorecard = useInterviewStore((state) => state.computeScorecard);
  const loadScorecard = useInterviewStore((state) => state.loadScorecard);

  // Load session summaries on mount so the picker is populated.
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const selectedId = activeSession?.id ?? '';

  const canScore =
    activeSession !== null &&
    (activeSession.state === 'COMPLETED' || activeSession.state === 'SCORED');
  const isScored = activeSession !== null && activeSession.state === 'SCORED';

  const handleSelect = useCallback(
    (sessionId: string): void => {
      if (sessionId.length === 0 || sessionId === selectedId) return;
      void openSession(sessionId);
    },
    [openSession, selectedId],
  );

  const handleCompute = useCallback((): void => {
    if (activeSession === null) return;
    void computeScorecard(activeSession.id);
  }, [activeSession, computeScorecard]);

  const handleRetrieve = useCallback((): void => {
    if (activeSession === null) return;
    void loadScorecard(activeSession.id);
  }, [activeSession, loadScorecard]);

  // Only show a scorecard that belongs to the currently open session.
  const visibleScorecard = useMemo<IPerformanceScorecard | null>(() => {
    if (scorecard === null || activeSession === null) return null;
    return scorecard.sessionId === activeSession.id ? scorecard : null;
  }, [scorecard, activeSession]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Canvas: soft gray background per product.md / Req 13.1
    <div className="min-h-full bg-[#f7f7f8] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">

        {/* Page heading */}
        <header>
          <h1
            id="scorecard-page-heading"
            className="text-2xl font-semibold text-gray-900"
          >
            Performance Scorecard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Pick a completed session, compute its scorecard, and review your
            performance across four dimensions.
          </p>
        </header>

        {/* Error banner — shown above the panel; prior scorecard content is
            preserved inside the panel below (Req 14.5). */}
        {error !== null && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error.message}
          </div>
        )}

        {/* ── Session picker panel ─────────────────────────────────────────── */}
        <section
          aria-labelledby="select-session-heading"
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2
            id="select-session-heading"
            className="mb-4 text-base font-semibold text-gray-900"
          >
            Choose a session
          </h2>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="session-picker"
              className="text-sm font-medium text-gray-700"
            >
              Session
            </label>
            <select
              id="session-picker"
              value={selectedId}
              onChange={(event): void => handleSelect(event.target.value)}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#9b5de5] focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select a session…</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.difficultyTier} · {session.state} ·{' '}
                  {new Date(session.createdAt).toLocaleString()}
                </option>
              ))}
            </select>

            {sessions.length === 0 && !isLoading && (
              <p className="mt-1 text-xs text-gray-500">
                No interview sessions yet. Complete a session in the Simulator
                to score it.
              </p>
            )}
          </div>

          {activeSession !== null && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-gray-600">
                Tier{' '}
                <span className="font-medium text-gray-800">
                  {activeSession.difficultyTier}
                </span>{' '}
                · {activeSession.questionCount} questions ·{' '}
                <span className="font-medium text-gray-800">
                  {activeSession.state}
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCompute}
                  disabled={!canScore || isLoading}
                  className="rounded-lg bg-[#9b5de5] px-4 py-2 text-sm font-medium text-white hover:bg-[#8a4fd4] focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Working…' : 'Compute scorecard'}
                </button>

                <button
                  type="button"
                  onClick={handleRetrieve}
                  disabled={!isScored || isLoading}
                  className="rounded-lg border border-[#9b5de5] px-4 py-2 text-sm font-medium text-[#9b5de5] hover:bg-[#9b5de5]/5 focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Retrieve scorecard
                </button>
              </div>

              {!canScore && (
                <p className="text-xs text-gray-500" role="status">
                  The session must be completed before it can be scored.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Results panel ────────────────────────────────────────────────── */}
        <section
          aria-labelledby="results-heading"
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2
            id="results-heading"
            className="mb-6 text-base font-semibold text-gray-900"
          >
            Results
          </h2>

          {/* Loading state: show skeleton while computing/fetching (Req 14.2, 14.4).
              Prior scorecard content below is preserved during re-fetches (Req 14.5). */}
          {isLoading && visibleScorecard === null && (
            <div
              role="status"
              aria-busy="true"
              aria-label="Loading scorecard"
              className="flex flex-col gap-4"
            >
              <SkeletonCard />
            </div>
          )}

          {/* Empty state: no scorecard yet and not loading (Req 13.6). */}
          {!isLoading && visibleScorecard === null && (
            <p className="text-center text-sm text-gray-500 py-6">
              No scorecard yet. Select a completed session and compute its
              scorecard to see results here.
            </p>
          )}

          {/* Scorecard content (Req 13.3): preserved during a re-fetch (Req 14.5). */}
          {visibleScorecard !== null && (
            <div className="flex flex-col gap-8">
              {/* Pass/fail badge + overall score */}
              <div className="flex flex-col items-center gap-4">
                <TierBadge tier={visibleScorecard.passFailTier} />

                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
                    Overall Score
                  </span>
                  {/* Scale up the overall dial to make it more prominent */}
                  <div className="scale-125 transform">
                    <ScoreDial
                      score={visibleScorecard.overallScore}
                      label="Overall"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-100" />

              {/* Four dimension dials */}
              <div>
                <h3 className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-500">
                  Dimension Scores
                </h3>
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
              </div>
            </div>
          )}

          {/* If loading while a prior scorecard is visible, show a subtle
              overlay indicator so the user knows content is refreshing (Req 14.5). */}
          {isLoading && visibleScorecard !== null && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 text-center text-xs text-gray-400"
            >
              Refreshing…
            </p>
          )}
        </section>

      </div>
    </div>
  );
}
