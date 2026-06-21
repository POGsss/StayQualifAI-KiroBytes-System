import { useEffect, useMemo } from 'react';
import type { JSX } from 'react';

import { Skeleton } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { useInterviewStore } from '../../stores/interview.store';
import type { IInterviewSessionSummary } from '../../types/interview.types';

/**
 * InterviewSessionsPage — the Sessions tab of the Interview module.
 *
 * Presentation-only page; all data flows through the existing Zustand
 * interview store. Never calls the service or Supabase client directly.
 *
 * Behaviour:
 *  - On mount, loads the user's session summaries (`loadSessions`).
 *  - Shows a `SkeletonList`-style loading region (role="status") while
 *    `isLoading` is true (Req 14.1).
 *  - Renders sessions in a table ordered newest-first (Req 13.2).
 *  - Each row shows: `Lifecycle_State`, `Difficulty_Tier`, creation date, and
 *    — where a scorecard exists — overall score + `TierBadge` pass/fail.
 *  - An error banner (role="alert") is shown when the store reports an error,
 *    while prior content is preserved (Req 14.5).
 *  - An explicit "no sessions" empty state (role="status") when the list is
 *    empty and not loading (Req 13.2).
 *  - "View detail" button on each row calls `openSession` (Req 13.2).
 *  - Semantic `<h1>` heading, visible focus rings on interactive elements
 *    (Req 13.1, 13.5, 13.6).
 *
 * Requirements: 13.1, 13.2, 13.5, 13.6, 14.1, 14.4, 14.5
 */

/** Format an ISO timestamp for display, tolerating invalid input. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function InterviewSessionsPage(): JSX.Element {
  const sessions = useInterviewStore((state) => state.sessions);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);
  const loadSessions = useInterviewStore((state) => state.loadSessions);
  const openSession = useInterviewStore((state) => state.openSession);

  // Load the user's session summaries once on mount.
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Sort newest-first; defensive sort so order is correct regardless of server
  // ordering (Req 13.2).
  const orderedSessions = useMemo<IInterviewSessionSummary[]>(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [sessions],
  );

  return (
    <div className="min-h-full bg-[#f7f7f8] px-6 py-8">
      <div className="mx-auto max-w-5xl">
        {/* ── Page heading (Req 13.1) ── */}
        <h1 className="mb-6 text-2xl font-semibold text-[#1a1a1a]">
          Interview Sessions
        </h1>

        {/* ── Error banner — shown simultaneously with prior content (Req 14.5) ── */}
        {error !== null ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-[#ffc8dd] bg-[#ffc8dd]/30 px-4 py-3 text-sm text-[#1a1a1a]"
          >
            {error.message}
          </div>
        ) : null}

        {/* ── Loading skeleton (Req 14.1) ── */}
        {isLoading ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading interview sessions"
            className="rounded-2xl bg-white p-6 shadow-sm"
          >
            {/* Visually-present loading label (satisfies textContent /loading/i) */}
            <p className="mb-4 text-sm text-gray-500">Loading interview sessions…</p>
            {/* Skeleton rows approximating the table */}
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} aria-hidden="true" className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="ml-auto h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── Empty state (Req 13.2) — only when not loading and list is empty ── */}
        {!isLoading && orderedSessions.length === 0 ? (
          <div
            role="status"
            className="rounded-2xl bg-white p-8 text-center shadow-sm"
          >
            <p className="text-sm text-gray-500">
              No interview sessions yet. Start a session in the Simulator to see
              it here.
            </p>
          </div>
        ) : null}

        {/* ── Session list panel (Req 13.2) ── */}
        {orderedSessions.length > 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-[#1a1a1a]">
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
                      Score
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
                  {orderedSessions.map((session) => (
                    <tr
                      key={session.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-3 py-3 text-[#1a1a1a]">
                        {session.state}
                      </td>
                      <td className="px-3 py-3 text-[#1a1a1a]">
                        {session.difficultyTier}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {formatTimestamp(session.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-[#1a1a1a]">
                        {session.overallScore ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        {session.passFailTier !== null ? (
                          <TierBadge tier={session.passFailTier} />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={(): void => {
                            void openSession(session.id);
                          }}
                          aria-label={`View detail for the ${
                            session.difficultyTier
                          } session created ${formatTimestamp(
                            session.createdAt,
                          )}`}
                          className="rounded-md border border-[#9b5de5] px-3 py-1.5 text-sm font-medium text-[#9b5de5] hover:bg-[#9b5de5]/10 focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          View detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
