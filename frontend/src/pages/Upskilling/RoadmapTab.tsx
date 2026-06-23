import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { MilestoneList } from '../../components/Upskilling/MilestoneList';
import { RoadmapListItem } from '../../components/Upskilling/RoadmapListItem';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { KpiCard } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { Select } from '../../components/Select';
import type { ISelectOption } from '../../components/Select';
import { useUpskillingStore } from '../../stores/upskilling.store';
import type { IRoadmapSummary } from '../../types/upskilling.types';

/**
 * RoadmapTab — Career Goal Roadmap with milestone tracking (Bauhaus redesign).
 *
 * Adopts the same page structure as the Projects tab and the Job Search
 * recruitment dashboard:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Search/filter row (Current role · Target role · Duration · ▸) │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  Generated roadmap draft (preview + save)                      │
 *   ├───────────────────────────────┬──────────────────────────────┤
 *   │  KPI cards (stacked vertical)  │  Roadmap Details              │
 *   │  ─────────────────────────────│  - milestones + progress      │
 *   │  Saved Roadmaps (Available-    │  - delete                     │
 *   │  Jobs list pattern, grey       │                              │
 *   │  active state)                 │                              │
 *   └───────────────────────────────┴──────────────────────────────┘
 *
 * Store wiring (`useUpskillingStore`):
 * - on mount → `fetchRoadmaps()`
 * - generate → `generateRoadmap(input)` populates `generatedRoadmap` (draft)
 * - save     → `saveRoadmap(draft)` persists, then refresh the list
 * - select   → `fetchRoadmap(id)` loads `currentRoadmap` (detail)
 * - toggle   → `toggleMilestone(roadmapId, milestoneId, !completed)`
 * - delete   → `deleteRoadmap(id)`
 *
 * Requirements: 3.1, 4.1, 4.3, 4.4, 4.6, 4.7
 */

/** Aggregate roadmap metrics rendered in the vertically stacked KPI column. */
interface IRoadmapMetrics {
  activeRoadmaps: number;
  milestonesDone: number;
  overallProgress: number; // 0..100
}

/** Derive the KPI values from the saved roadmap summaries. */
function computeMetrics(roadmaps: IRoadmapSummary[]): IRoadmapMetrics {
  const activeRoadmaps = roadmaps.length;
  const milestonesDone = roadmaps.reduce((sum, r) => sum + r.completedCount, 0);
  const totalMilestones = roadmaps.reduce((sum, r) => sum + r.totalCount, 0);
  const overallProgress =
    totalMilestones === 0 ? 0 : Math.round((milestonesDone / totalMilestones) * 100);
  return { activeRoadmaps, milestonesDone, overallProgress };
}

/** Preset roadmap durations (months) offered in the Duration select. */
const DURATION_OPTIONS: ReadonlyArray<ISelectOption> = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '9', label: '9 months' },
  { value: '12', label: '12 months' },
  { value: '18', label: '18 months' },
  { value: '24', label: '24 months' },
  { value: '36', label: '36 months' },
];

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

  const metrics = useMemo(() => computeMetrics(roadmaps), [roadmaps]);

  const parsedDuration = Number.parseInt(durationMonths, 10);

  const canGenerate = useMemo((): boolean => {
    const currentLen = currentRole.trim().length;
    const targetLen = targetRole.trim().length;
    return (
      !isLoading &&
      currentLen >= 2 &&
      currentLen <= 100 &&
      targetLen >= 2 &&
      targetLen <= 100 &&
      Number.isInteger(parsedDuration)
    );
  }, [currentRole, targetRole, parsedDuration, isLoading]);

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
      {/* Search/filter row — mirrors the Projects + Job Search toolbars */}
      <Panel aria-label="Generate career roadmap" title="Career Goal Roadmap">
        <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            type="text"
            value={currentRole}
            aria-label="Current role"
            placeholder="Current role (e.g. Frontend Developer)"
            maxLength={100}
            disabled={isLoading}
            onChange={(e) => setCurrentRole(e.target.value)}
          />
          <Input
            type="text"
            value={targetRole}
            aria-label="Target role"
            placeholder="Target role (e.g. Senior Backend Engineer)"
            maxLength={100}
            disabled={isLoading}
            onChange={(e) => setTargetRole(e.target.value)}
          />
          <Select
            value={durationMonths}
            aria-label="Target duration in months"
            options={DURATION_OPTIONS}
            disabled={isLoading}
            onChange={(e) => setDurationMonths(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
          >
            {isLoading ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </Panel>

      {/* Error banner */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl bg-accent-red/10 p-4"
        >
          <p className="text-sm text-accent-red">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-1 text-accent-red transition-colors hover:bg-accent-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Generated draft preview + save */}
      {showDraft && generatedRoadmap !== null && (
        <Panel
          title="Generated roadmap draft"
          actions={
            <Button type="button" onClick={() => void handleSave()} disabled={isLoading}>
              {isLoading ? 'Saving…' : 'Save roadmap'}
            </Button>
          }
        >
          <p className="mb-4 text-sm text-muted">
            {generatedRoadmap.currentRole} → {generatedRoadmap.targetRole} ·{' '}
            {generatedRoadmap.targetDurationMonths} months ·{' '}
            {generatedRoadmap.milestones.length} milestones
          </p>
          <ol className="flex flex-col gap-3">
            {generatedRoadmap.milestones.map((milestone) => (
              <li
                key={milestone.sequence}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-canvas p-4"
              >
                <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-blue/10 px-1.5 text-xs font-semibold text-accent-blue">
                  {milestone.sequence}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-semibold text-ink">{milestone.title}</p>
                  <p className="text-sm text-muted">{milestone.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent-yellow/20 px-2 py-0.5 text-xs font-medium text-ink">
                      {milestone.estimatedDurationWeeks} wk
                    </span>
                    {milestone.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs font-medium text-accent-blue"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* Two-column dashboard: KPIs + Saved Roadmaps (≈35%) and Details (≈65%) */}
      <div className="grid gap-6 lg:grid-cols-[35fr_65fr]">
        {/* LEFT: vertically stacked KPI cards + Saved Roadmaps feed */}
        <div className="flex flex-col gap-6">
          {/* KPI cards — stacked vertically */}
          <section aria-label="Roadmap metrics" className="grid gap-4">
            <KpiCard label="Active Roadmaps" value={metrics.activeRoadmaps} tone="blue" />
            <KpiCard label="Milestones Done" value={metrics.milestonesDone} tone="yellow" />
            <KpiCard
              label="Overall Progress"
              value={metrics.overallProgress}
              tone="red"
              unit="%"
            />
          </section>

          {/* Saved Roadmaps — Available Jobs list pattern */}
          <Panel aria-label="Saved roadmaps" title="Saved Roadmaps">
            <div className="flex flex-col gap-4">
              {/* Loading skeletons */}
              {isLoading && roadmaps.length === 0 && (
                <div className="flex flex-col gap-3" aria-label="Loading roadmaps">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="animate-pulse rounded-2xl bg-canvas p-4">
                      <div className="flex flex-col gap-3">
                        <div className="h-4 w-3/5 rounded bg-gray-200" />
                        <div className="h-3 w-2/5 rounded bg-gray-200" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!isLoading && roadmaps.length === 0 && (
                <div className="rounded-2xl bg-canvas p-6 text-center">
                  <p className="text-sm text-muted">
                    No saved roadmaps yet. Generate and save one to get started.
                  </p>
                </div>
              )}

              {/* Roadmap rows */}
              {roadmaps.length > 0 && (
                <div className="flex flex-col gap-3">
                  {roadmaps.map((roadmap) => (
                    <RoadmapListItem
                      key={roadmap.id}
                      roadmap={roadmap}
                      selected={currentRoadmap?.id === roadmap.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* RIGHT: Roadmap Details panel (consistent with the Projects tab) */}
        <Panel
          aria-label="Roadmap details"
          className="self-start"
          title={
            currentRoadmap !== null
              ? `${currentRoadmap.currentRole} → ${currentRoadmap.targetRole}`
              : 'Roadmap Details'
          }
          actions={
            currentRoadmap !== null ? (
              <Button
                type="button"
                onClick={() => handleDelete(currentRoadmap.id)}
                disabled={isLoading}
                variant="outline"
                className="text-accent-red hover:bg-accent-red/10 hover:text-accent-red border-accent-red/20 focus-visible:ring-accent-red/40"
              >
                Delete
              </Button>
            ) : undefined
          }
        >
          {currentRoadmap === null ? (
            <p className="text-sm text-muted">
              Select a roadmap to view its milestones and track progress.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                {currentRoadmap.targetDurationMonths} months ·{' '}
                {currentRoadmap.totalCount} milestones
              </p>
              <MilestoneList
                milestones={currentRoadmap.milestones}
                completedCount={currentRoadmap.completedCount}
                totalCount={currentRoadmap.totalCount}
                onToggle={handleToggle}
                disabled={isLoading}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
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
