import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, RotateCcw } from 'lucide-react';

import { ScoreDial } from '../../components/ScoreDial';
import { SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  IInterviewSessionSummary,
  IPerformanceScorecard,
  LifecycleState,
} from '../../types/interview.types';

/**
 * InterviewSessionsPage — two-pane Sessions tab (Bauhaus redesign).
 *
 * Mirrors the STAR organizer layout: the session list lives on the RIGHT and
 * the selected session's details (meta, job description, action button, and —
 * for completed sessions — the performance scorecard) render on the LEFT.
 *
 * This is also where an interview is STARTED. Creating an interview in the
 * Simulator only saves it (state `PENDING`); the candidate starts it here with
 * a deliberate click, which is the reliable way to grant the browser the
 * microphone access the voice flow needs. Starting (or resuming) an interview
 * redirects to the Simulator, where the session continues.
 *
 * Presentation-only: all data flows through the Zustand interview store.
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

/** Pill styling per session lifecycle state. */
function stateBadgeClass(state: LifecycleState): string {
  switch (state) {
    case 'PENDING':
      return 'bg-accent-yellow/20 text-amber-700';
    case 'ACTIVE':
      return 'bg-accent-blue/15 text-accent-blue';
    case 'COMPLETED':
    case 'SCORED':
      return 'bg-accent-green/20 text-emerald-700';
    default:
      return 'bg-canvas text-muted';
  }
}

/**
 * Request (and immediately release) the microphone so the browser grants
 * capture permission within this user gesture. SpeechRecognition in the
 * Simulator then starts reliably. Failures are ignored — the Simulator surfaces
 * a permission banner and a typed-answer fallback.
 */
async function primeMicrophone(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }
  } catch {
    // Ignore — handled downstream in the Simulator.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail pane (left): meta + job description + start/resume + scorecard
// ─────────────────────────────────────────────────────────────────────────────

function SessionDetail({
  onStart,
  isStarting,
}: {
  onStart: () => void;
  isStarting: boolean;
}): JSX.Element {
  const activeSession = useInterviewStore((s) => s.activeSession);
  const scorecard = useInterviewStore((s) => s.scorecard);
  const isLoading = useInterviewStore((s) => s.isLoading);
  const computeScorecard = useInterviewStore((s) => s.computeScorecard);

  const [isComputing, setIsComputing] = useState(false);

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
      <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">
        Select a session from the list to preview its details.
      </p>
    );
  }

  const { state } = activeSession;
  const isPending = state === 'PENDING';
  const isInProgress = state === 'ACTIVE';
  const isScorable = state === 'COMPLETED' || state === 'SCORED';

  return (
    <div className="flex flex-col gap-5">
      {/* Header: tier + state */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-base font-bold text-ink">
          {activeSession.difficultyTier} Interview
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${stateBadgeClass(state)}`}
        >
          {state}
        </span>
      </div>

      {/* Meta */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Questions</dt>
          <dd className="font-semibold text-ink">{activeSession.questionCount}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Created</dt>
          <dd className="font-semibold text-ink">{formatTimestamp(activeSession.createdAt)}</dd>
        </div>
      </dl>

      {/* Job description */}
      {activeSession.jobDescription.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-canvas px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-ink">
            Job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
            {activeSession.jobDescription}
          </p>
        </details>
      )}

      {/* Primary action: start / resume */}
      {(isPending || isInProgress) && (
        <div className="flex flex-col gap-2">
          <Button onClick={onStart} disabled={isStarting} className="self-start">
            {isInProgress ? (
              <RotateCcw aria-hidden="true" className="mr-2 size-4" />
            ) : (
              <Play aria-hidden="true" className="mr-2 size-4" />
            )}
            {isStarting
              ? 'Opening…'
              : isInProgress
                ? 'Resume Interview'
                : 'Start Interview'}
          </Button>
          <p className="text-xs text-muted">
            {isInProgress
              ? 'Continue this interview in the Simulator.'
              : 'Starts the interview and takes you to the Simulator. Allow microphone access when prompted.'}
          </p>
        </div>
      )}

      {/* Scorecard (completed sessions) */}
      {isScorable && (
        <div className="flex flex-col gap-4 border-t border-gray-200 pt-5">
          {(isLoading || isComputing) && visibleScorecard === null ? (
            <div role="status" aria-busy="true" aria-label="Loading scorecard">
              <SkeletonCard />
            </div>
          ) : visibleScorecard !== null ? (
            <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-canvas p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-ink">
                  Performance Scorecard
                </h4>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Overall Score
                </p>
                <ScoreDial score={visibleScorecard.overallScore} label="Overall" />
              </div>
            </div>
          ) : (
            <Button variant="primary" onClick={() => { void handleCompute(); }}>
              Generate scorecard
            </Button>
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
  const startSession = useInterviewStore((state) => state.startSession);
  const deleteSession = useInterviewStore((state) => state.deleteSession);

  const navigate = useNavigate();

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

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

  // Start (or resume) the selected interview, then hand off to the Simulator.
  const handleStart = useCallback(async (): Promise<void> => {
    if (activeSession === null || isStarting) return;
    setIsStarting(true);

    // Grant mic permission within this click before any navigation.
    await primeMicrophone();

    // Start the interview when it hasn't begun yet (PENDING → ACTIVE).
    if (activeSession.state === 'PENDING') {
      const started = await startSession(activeSession.id);
      if (started === null) {
        setIsStarting(false);
        return;
      }
      // Reload detail so the Simulator sees the ACTIVE state + questions.
      const detail = await openSession(activeSession.id);
      if (detail === null) {
        setIsStarting(false);
        return;
      }
    }

    setIsStarting(false);
    navigate('/interview/simulator');
  }, [activeSession, isStarting, startSession, openSession, navigate]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      {/* Left: selected session details */}
      <Panel aria-label="Session details" title="Session details">
        <SessionDetail onStart={() => { void handleStart(); }} isStarting={isStarting} />
      </Panel>

      {/* Right: session list */}
      <Panel aria-label="Interview sessions" title="Interview sessions">
        {error !== null && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
          >
            {error.message}
          </div>
        )}

        {isLoading && orderedSessions.length === 0 ? (
          <div role="status" aria-busy="true" aria-label="Loading interview sessions">
            <SkeletonCard />
          </div>
        ) : orderedSessions.length === 0 ? (
          <div role="status" className="rounded-xl bg-canvas py-8 text-center">
            <p className="text-sm text-muted">
              No interview sessions yet. Create one in the Simulator to see it here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {orderedSessions.map((session) => {
              const isSelected = session.id === selectedId;
              return (
                <li key={session.id}>
                  <div
                    className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-colors ${
                      isSelected
                        ? 'border-accent-blue/40 bg-accent-blue/5'
                        : 'border-gray-200 bg-canvas'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="font-bold text-ink">{session.difficultyTier}</p>
                        <p className="text-xs text-muted">
                          {formatTimestamp(session.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${stateBadgeClass(session.state)}`}
                      >
                        {session.state}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        {session.overallScore !== null ? (
                          <>
                            Score{' '}
                            <span className="font-bold text-accent-blue">
                              {session.overallScore}
                            </span>
                          </>
                        ) : (
                          'Not scored yet'
                        )}
                      </span>
                      <div className="flex items-center gap-2">
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
                          className="border-none text-accent-red hover:bg-accent-red/10"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
