import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { ScoreDial } from '../../components/ScoreDial';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  IInterviewSessionSummary,
  IPerformanceScorecard,
} from '../../types/interview.types';

/**
 * InterviewSessionsPage — unified Sessions tab (Bauhaus redesign).
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
      <p className="text-sm text-muted">
        Select a session above to preview its details.
      </p>
    );
  }

  const isScorable =
    activeSession.state === 'COMPLETED' || activeSession.state === 'SCORED';

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* Session meta */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span>
          Tier:{' '}
          <span className="font-semibold text-ink">{activeSession.difficultyTier}</span>
        </span>
        <span>
          State:{' '}
          <span className="font-semibold text-ink">{activeSession.state}</span>
        </span>
        <span>
          Questions:{' '}
          <span className="font-semibold text-ink">{activeSession.questionCount}</span>
        </span>
        <span>
          Created:{' '}
          <span className="font-semibold text-ink">
            {formatTimestamp(activeSession.createdAt)}
          </span>
        </span>
      </div>

      {/* Job description preview */}
      {activeSession.jobDescription.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink select-none">
            Job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
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
        <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-canvas p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
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
          <div className="flex flex-col items-center gap-2 border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Overall Score</p>
            <ScoreDial score={visibleScorecard.overallScore} label="Overall" />
          </div>
        </div>
      )}

      {/* Compute CTA when completed but not yet scored */}
      {visibleScorecard === null && !isLoading && !isComputing && (
        <div className="flex flex-col items-start gap-2">
          {isScorable ? (
            <Button
              variant="primary"
              onClick={() => { void handleCompute(); }}
            >
              Generate scorecard
            </Button>
          ) : (
            <p className="text-sm text-muted">
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
      if (sessionId === selectedId) {
        // Toggle close by resetting activeSession to null
        useInterviewStore.setState({ activeSession: null });
        return;
      }
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
    <Panel
      aria-label="Interview Sessions"
      title="Interview Sessions"
    >
      <p className="mb-6 text-sm text-muted">
        Every session you&apos;ve run. Select one to preview its details and
        performance scorecard.
      </p>

      {error !== null && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
        >
          {error.message}
        </div>
      )}

      {/* List */}
      {isLoading && orderedSessions.length === 0 ? (
        <div role="status" aria-busy="true" aria-label="Loading interview sessions" className="flex flex-col gap-4">
          <p className="text-sm text-muted">Loading interview sessions…</p>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} aria-hidden="true" className="flex items-center gap-4 animate-pulse">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ml-auto h-8 w-24 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : orderedSessions.length === 0 ? (
        <div role="status" className="py-8 text-center bg-canvas rounded-xl">
          <p className="text-sm text-muted">
            No interview sessions yet. Start one in the Simulator to see it here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-ink">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-muted">
                <th scope="col" className="pb-3 pr-4">Difficulty</th>
                <th scope="col" className="pb-3 px-4">State</th>
                <th scope="col" className="pb-3 px-4">Date Created</th>
                <th scope="col" className="pb-3 px-4 text-center">Score</th>
                <th scope="col" className="pb-3 px-4 text-center">Result</th>
                <th scope="col" className="pb-3 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orderedSessions.map((session) => {
                const isSelected = session.id === selectedId;
                return (
                  <tr
                    key={session.id}
                    role="row"
                    className={`transition-colors hover:bg-canvas/50 ${
                      isSelected ? 'bg-accent-blue/5' : ''
                    }`}
                  >
                    <td role="cell" className="py-4 pr-4 font-semibold">{session.difficultyTier}</td>
                    <td role="cell" className="py-4 px-4 font-medium">{session.state}</td>
                    <td role="cell" className="py-4 px-4 text-muted">
                      {formatTimestamp(session.createdAt)}
                    </td>
                    <td role="cell" className="py-4 px-4 text-center font-bold text-accent-blue">
                      {session.overallScore !== null ? session.overallScore : '—'}
                    </td>
                    <td role="cell" className="py-4 px-4 text-center">
                      {session.passFailTier !== null ? (
                        <TierBadge tier={session.passFailTier} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td role="cell" className="py-4 pl-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isSelected ? 'primary' : 'outline'}
                          onClick={() => handleSelect(session.id)}
                          aria-label={`View detail of ${session.difficultyTier} session`}
                        >
                          View detail
                        </Button>
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() => handleDelete(session.id)}
                          disabled={pendingDeleteId === session.id}
                          aria-label={`Delete the ${session.difficultyTier} session created ${formatTimestamp(session.createdAt)}`}
                          className="text-accent-red hover:bg-accent-red/10 border-none"
                        >
                          {pendingDeleteId === session.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Render active preview panel outside the table but below it for clean layout */}
      {selectedId !== null && (
        <div className="mt-6 border-t border-gray-200 bg-canvas p-6 rounded-2xl shadow-inner">
          <SessionPreview />
        </div>
      )}
    </Panel>
  );
}

