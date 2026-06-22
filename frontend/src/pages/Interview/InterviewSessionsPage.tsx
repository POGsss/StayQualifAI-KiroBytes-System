import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { ScoreDial } from '../../components/ScoreDial';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  IInterviewSessionSummary,
  IPerformanceScorecard,
} from '../../types/interview.types';

/**
 * InterviewSessionsPage — unified Sessions tab.
 *
 * This single view replaces the previous separate "Sessions" and "Scorecard"
 * tabs. It lists every interview session newest-first; selecting a row reveals
 * an inline preview panel with the session's details and — for completed
 * sessions — its performance scorecard (computing it on demand when needed).
 *
 * Presentation-only: all data flows through the Zustand interview store; this
 * page never calls the service or Supabase client directly.
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
  { key: 'latencyScore', label: 'Response Speed' },
  { key: 'pressureScore', label: 'Pressure Handling' },
];

/** Format an ISO timestamp for display, tolerating invalid input. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline session preview (detail + scorecard)
// ─────────────────────────────────────────────────────────────────────────────

function SessionPreview(): JSX.Element {
  const activeSession = useInterviewStore((s) => s.activeSession);
  const scorecard = useInterviewStore((s) => s.scorecard);
  const isLoading = useInterviewStore((s) => s.isLoading);
  const computeScorecard = useInterviewStore((s) => s.computeScorecard);

  const [isComputing, setIsComputing] = useState(false);

  // Only show a scorecard that belongs to the open session.
  const visibleScorecard = useMemo<IPerformanceScorecard | null>(() => {
    if (scorecard === null || activeSession === null) return null;
    return scorecard.sessionId === activeSession.id ? scorecard : null;
  }, [scorecard, activeSession]);

  const handleCompute = useCallback(async (): Promise<void> => {
    if (activeSession === null || isComputing) return;
    setIsComputing(true);
    await computeScorecard(activeSession.id);
    setIsComputing(false);
  }, [activeSession, computeScorecard, isComputing]);

  if (activeSession === null) {
    return (
      <p className="text-sm text-gray-500">
        Select a session above to preview its details.
      </p>
    );
  }

  const isScorable =
    activeSession.state === 'COMPLETED' || activeSession.state === 'SCORED';

  return (
    <div className="flex flex-col gap-5">
      {/* Session meta */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-gray-600">
          Tier{' '}
          <span className="font-medium text-[#1a1a1a]">{activeSession.difficultyTier}</span>
        </span>
        <span className="text-gray-600">
          State{' '}
          <span className="font-medium text-[#1a1a1a]">{activeSession.state}</span>
        </span>
        <span className="text-gray-600">
          Questions{' '}
          <span className="font-medium text-[#1a1a1a]">{activeSession.questionCount}</span>
        </span>
        <span className="text-gray-600">
          Created{' '}
          <span className="font-medium text-[#1a1a1a]">
            {formatTimestamp(activeSession.createdAt)}
          </span>
        </span>
      </div>

      {/* Job description preview */}
      {activeSession.jobDescription.length > 0 && (
        <details className="rounded-xl border border-gray-100 bg-[#f7f7f8] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#1a1a1a]">
            Job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
            {activeSession.jobDescription}
          </p>
        </details>
      )}

      {/* Loading scorecard */}
      {(isLoading || isComputing) && visibleScorecard === null && (
        <div role="status" aria-busy="true" aria-label="Loading scorecard">
          <SkeletonCard />
        </div>
      )}

      {/* Scorecard, when available */}
      {visibleScorecard !== null && (
        <div className="flex flex-col gap-6 rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#1a1a1a]">
              Performance Scorecard
            </h3>
            <TierBadge tier={visibleScorecard.passFailTier} />
          </div>
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {DIMENSIONS.map((d) => (
              <li key={d.key} className="flex justify-center">
                <ScoreDial score={visibleScorecard[d.key]} label={d.label} />
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-500">Overall Score</p>
            <ScoreDial score={visibleScorecard.overallScore} label="Overall" />
          </div>
        </div>
      )}

      {/* Compute CTA when completed but not yet scored */}
      {visibleScorecard === null && !isLoading && !isComputing && (
        <div className="flex flex-col items-start gap-2">
          {isScorable ? (
            <button
              type="button"
              onClick={() => { void handleCompute(); }}
              className="rounded-lg bg-[#9b5de5] px-4 py-2 text-sm font-medium text-white hover:bg-[#8a4fd4] focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50"
            >
              Generate scorecard
            </button>
          ) : (
            <p className="text-sm text-gray-500">
              This session isn&apos;t finished yet — complete it in the Simulator
              to generate a scorecard.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function InterviewSessionsPage(): JSX.Element {
  const sessions = useInterviewStore((state) => state.sessions);
  const activeSession = useInterviewStore((state) => state.activeSession);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);
  const loadSessions = useInterviewStore((state) => state.loadSessions);
  const openSession = useInterviewStore((state) => state.openSession);
  const deleteSession = useInterviewStore((state) => state.deleteSession);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const orderedSessions = useMemo<IInterviewSessionSummary[]>(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [sessions],
  );

  const selectedId = activeSession?.id ?? null;

  const handleSelect = useCallback(
    (sessionId: string): void => {
      if (sessionId === selectedId) return;
      void openSession(sessionId);
    },
    [openSession, selectedId],
  );

  const handleDelete = useCallback(
    (sessionId: string): void => {
      setPendingDeleteId(sessionId);
      void deleteSession(sessionId).finally(() => {
        setPendingDeleteId((cur) => (cur === sessionId ? null : cur));
      });
    },
    [deleteSession],
  );

  return (
    <div className="min-h-full bg-[#f7f7f8] px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold text-[#1a1a1a]">Interview Sessions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every session you&apos;ve run. Select one to preview its details and
            performance scorecard.
          </p>
        </header>

        {error !== null && (
          <div
            role="alert"
            className="rounded-2xl border border-[#ffc8dd] bg-[#ffc8dd]/30 px-4 py-3 text-sm text-[#1a1a1a]"
          >
            {error.message}
          </div>
        )}

        {/* List */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {isLoading && orderedSessions.length === 0 ? (
            <div role="status" aria-busy="true" aria-label="Loading interview sessions">
              <p className="mb-4 text-sm text-gray-500">Loading interview sessions…</p>
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} aria-hidden="true" className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="ml-auto h-8 w-24 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ) : orderedSessions.length === 0 ? (
            <div role="status" className="py-8 text-center">
              <p className="text-sm text-gray-500">
                No interview sessions yet. Start one in the Simulator to see it here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {orderedSessions.map((session) => {
                const isSelected = session.id === selectedId;
                return (
                  <li key={session.id}>
                    <div
                      className={`flex items-center gap-1 transition-colors ${
                        isSelected ? 'bg-[#9b5de5]/5' : 'hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(session.id)}
                        aria-expanded={isSelected}
                        className="flex flex-1 items-center gap-4 px-2 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/40"
                      >
                        <span
                          aria-hidden="true"
                          className={`text-gray-400 transition-transform ${isSelected ? 'rotate-90' : ''}`}
                        >
                          ▶
                        </span>
                        <span className="w-28 text-sm font-medium text-[#1a1a1a]">
                          {session.difficultyTier}
                        </span>
                        <span className="w-28 text-sm text-gray-600">{session.state}</span>
                        <span className="flex-1 text-sm text-gray-500">
                          {formatTimestamp(session.createdAt)}
                        </span>
                        <span className="flex items-center gap-2">
                          {session.overallScore !== null && (
                            <span className="text-sm font-semibold text-[#9b5de5]">
                              {session.overallScore}
                            </span>
                          )}
                          {session.passFailTier !== null ? (
                            <TierBadge tier={session.passFailTier} />
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(session.id)}
                        disabled={pendingDeleteId === session.id}
                        aria-label={`Delete the ${session.difficultyTier} session created ${formatTimestamp(session.createdAt)}`}
                        className="mr-2 shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-red-600 hover:border-red-200 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingDeleteId === session.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>

                    {/* Inline preview for the selected session */}
                    {isSelected && (
                      <div className="border-t border-gray-100 bg-white px-2 py-5">
                        <SessionPreview />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
