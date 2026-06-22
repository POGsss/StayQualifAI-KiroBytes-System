import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { MilestoneList } from '../../components/Upskilling/MilestoneList';
import { useUpskillingStore } from '../../stores/upskilling.store';

/**
 * RoadmapTab — Career Goal Roadmap with milestone tracking.
 *
 * Lets a user describe a transition (current role → target role over a target
 * duration in months), generate an AI roadmap draft, save it, browse their
 * saved roadmaps, open one to view its milestones, and toggle milestone
 * completion with a live completed/total progress display.
 *
 * Store wiring (`useUpskillingStore`):
 * - on mount → `fetchRoadmaps()`
 * - generate → `generateRoadmap(input)` populates `generatedRoadmap` (draft)
 * - save     → `saveRoadmap(draft)` persists, then refresh the list
 * - select   → `fetchRoadmap(id)` loads `currentRoadmap` (detail)
 * - toggle   → `toggleMilestone(roadmapId, milestoneId, !completed)`
 * - delete   → `deleteRoadmap(id)`
 *
 * Loading is surfaced when `status === 'loading'`; errors render a dismissible
 * banner that calls `clearError`.
 *
 * Requirements: 3.1, 4.1, 4.3, 4.4, 4.6, 4.7
 */
export function RoadmapTab(): JSX.Element {
  const generatedRoadmap = useUpskillingStore((s) => s.generatedRoadmap);
  const roadmaps = useUpskillingStore((s) => s.roadmaps);
  const currentRoadmap = useUpskillingStore((s) => s.currentRoadmap);
  const status = useUpskillingStore((s) => s.status);
  const error = useUpskillingStore((s) => s.error);
  const generateRoadmap = useUpskillingStore((s) => s.generateRoadmap);
  const saveRoadmap = useUpskillingStore((s) => s.saveRoadmap);
  const fetchRoadmaps = useUpskillingStore((s) => s.fetchRoadmaps);
  const fetchRoadmap = useUpskillingStore((s) => s.fetchRoadmap);
  const toggleMilestone = useUpskillingStore((s) => s.toggleMilestone);
  const deleteRoadmap = useUpskillingStore((s) => s.deleteRoadmap);
  const clearError = useUpskillingStore((s) => s.clearError);

  const [currentRole, setCurrentRole] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [durationMonths, setDurationMonths] = useState('6');
  // Controls whether the freshly generated draft panel is shown. It is hidden
  // once the draft is saved so the saved roadmap takes over.
  const [showDraft, setShowDraft] = useState(false);

  const isLoading = status === 'loading';

  // Fetch the saved roadmaps once on mount.
  useEffect(() => {
    void fetchRoadmaps();
  }, [fetchRoadmaps]);

  const parsedDuration = Number.parseInt(durationMonths, 10);
  const durationValid =
    Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 36;

  const canGenerate = useMemo((): boolean => {
    const currentLen = currentRole.trim().length;
    const targetLen = targetRole.trim().length;
    return (
      !isLoading &&
      currentLen >= 2 &&
      currentLen <= 100 &&
      targetLen >= 2 &&
      targetLen <= 100 &&
      durationValid
    );
  }, [currentRole, targetRole, durationValid, isLoading]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!canGenerate) return;
    const draft = await generateRoadmap({
      currentRole: currentRole.trim(),
      targetRole: targetRole.trim(),
      targetDurationMonths: parsedDuration,
    });
    if (draft !== null) {
      setShowDraft(true);
    }
  }, [canGenerate, generateRoadmap, currentRole, targetRole, parsedDuration]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (generatedRoadmap === null) return;
    const saved = await saveRoadmap(generatedRoadmap);
    if (saved !== null) {
      setShowDraft(false);
      await fetchRoadmaps();
      await fetchRoadmap(saved.id);
    }
  }, [generatedRoadmap, saveRoadmap, fetchRoadmaps, fetchRoadmap]);

  const handleSelect = useCallback(
    (id: string): void => {
      void fetchRoadmap(id);
    },
    [fetchRoadmap],
  );

  const handleToggle = useCallback(
    (milestoneId: string, nextCompleted: boolean): void => {
      if (currentRoadmap === null) return;
      void toggleMilestone(currentRoadmap.id, milestoneId, nextCompleted);
    },
    [currentRoadmap, toggleMilestone],
  );

  const handleDelete = useCallback(
    (id: string): void => {
      void deleteRoadmap(id);
    },
    [deleteRoadmap],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Generation form */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Career Goal Roadmap</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="roadmap-current-role" className="text-sm font-medium text-gray-700">
              Current role
            </label>
            <input
              id="roadmap-current-role"
              type="text"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. Frontend Developer"
              maxLength={100}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="roadmap-target-role" className="text-sm font-medium text-gray-700">
              Target role
            </label>
            <input
              id="roadmap-target-role"
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. Senior Backend Engineer"
              maxLength={100}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="roadmap-duration" className="text-sm font-medium text-gray-700">
              Duration (months)
            </label>
            <input
              id="roadmap-duration"
              type="number"
              min={1}
              max={36}
              step={1}
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          className="mt-4 inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading && <Spinner />}
          {isLoading ? 'Generating…' : 'Generate roadmap'}
        </button>
      </div>

      {/* Error banner */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between rounded-lg bg-red-50 p-4 text-red-800"
        >
          <p className="text-sm">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="ms-4 shrink-0 rounded p-1 text-red-600 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Generated draft preview + save */}
      {showDraft && generatedRoadmap !== null && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Generated roadmap draft
              </h3>
              <p className="text-sm text-gray-600">
                {generatedRoadmap.currentRole} → {generatedRoadmap.targetRole} ·{' '}
                {generatedRoadmap.targetDurationMonths} months ·{' '}
                {generatedRoadmap.milestones.length} milestones
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isLoading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && <Spinner />}
              Save roadmap
            </button>
          </div>
          <ol className="flex flex-col gap-3">
            {generatedRoadmap.milestones.map((milestone) => (
              <li
                key={milestone.sequence}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-50 px-1.5 text-xs font-semibold text-primary">
                  {milestone.sequence}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-semibold text-gray-900">{milestone.title}</p>
                  <p className="text-sm text-gray-600">{milestone.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#FEE440] px-2 py-0.5 text-xs font-medium text-gray-800">
                      {milestone.estimatedDurationWeeks} wk
                    </span>
                    {milestone.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-[#ffc8dd] px-2 py-0.5 text-xs font-medium text-gray-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Two-column: saved roadmap list + detail */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Saved roadmaps list */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Saved roadmaps</h3>
          {roadmaps.length === 0 ? (
            <p className="text-sm text-gray-500">
              No saved roadmaps yet. Generate and save one to get started.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {roadmaps.map((roadmap) => {
                const isSelected = currentRoadmap?.id === roadmap.id;
                return (
                  <li key={roadmap.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(roadmap.id)}
                      aria-pressed={isSelected}
                      className={[
                        'w-full rounded-xl border p-3 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                        isSelected
                          ? 'border-primary bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {roadmap.currentRole} → {roadmap.targetRole}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {roadmap.targetDurationMonths} months
                      </p>
                      <p className="mt-1 text-xs font-medium text-gray-700">
                        {roadmap.completedCount} / {roadmap.totalCount} complete
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Selected roadmap detail */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {currentRoadmap === null ? (
            <p className="text-sm text-gray-500">
              Select a roadmap to view its milestones and track progress.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {currentRoadmap.currentRole} → {currentRoadmap.targetRole}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {currentRoadmap.targetDurationMonths} months ·{' '}
                    {currentRoadmap.totalCount} milestones
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(currentRoadmap.id)}
                  disabled={isLoading}
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
              <MilestoneList
                milestones={currentRoadmap.milestones}
                completedCount={currentRoadmap.completedCount}
                totalCount={currentRoadmap.totalCount}
                onToggle={handleToggle}
                disabled={isLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline loading spinner shown inside action buttons. */
function Spinner(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** Small close (X) icon used by the dismissible error banner. */
function CloseIcon(): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
