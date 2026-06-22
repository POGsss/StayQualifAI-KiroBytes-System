import type { JSX } from 'react';

import type { IMilestone } from '../../types/upskilling.types';

/**
 * Props for {@link MilestoneList}.
 *
 * Presentational only — the parent owns the store wiring. `onToggle` is called
 * with the milestone id and the NEXT desired completion state (the negation of
 * the milestone's current state), so the parent can forward it directly to
 * `toggleMilestone(roadmapId, milestoneId, completed)`.
 */
export interface IMilestoneListProps {
  /** Ordered milestones to render (sequence 1..n). */
  milestones: IMilestone[];
  /** Number of completed milestones (0..totalCount). */
  completedCount: number;
  /** Total milestone count. */
  totalCount: number;
  /** Toggle handler receiving the milestone id and its next completion state. */
  onToggle: (milestoneId: string, nextCompleted: boolean) => void;
  /** When true, the toggles are disabled (e.g. during an in-flight request). */
  disabled?: boolean;
}

/**
 * MilestoneList — renders a Career_Roadmap's ordered milestones with a
 * completion toggle per milestone and an aggregate progress display.
 *
 * Each milestone exposes an accessible checkbox; toggling it calls
 * `onToggle(milestone.id, !milestone.completed)`. Progress is shown both as a
 * "{completed} / {total} complete" label and a pastel turquoise progress bar
 * (Requirements 4.4, 4.6, 4.7).
 */
export function MilestoneList({
  milestones,
  completedCount,
  totalCount,
  onToggle,
  disabled = false,
}: IMilestoneListProps): JSX.Element {
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Progress summary */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm font-semibold text-gray-900">
            {completedCount} / {totalCount} complete
          </span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label={`${completedCount} of ${totalCount} milestones complete`}
        >
          <div
            className="h-full rounded-full bg-[#00F5D4] transition-all duration-300"
            style={{ inlineSize: `${percent}%` }}
          />
        </div>
      </div>

      {/* Milestone rows */}
      <ol className="flex flex-col gap-3">
        {milestones.map((milestone) => {
          const checkboxId = `milestone-${milestone.id}`;
          return (
            <li
              key={milestone.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={milestone.completed}
                disabled={disabled}
                onChange={() => onToggle(milestone.id, !milestone.completed)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <label
                  htmlFor={checkboxId}
                  className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900"
                >
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-50 px-1.5 text-xs font-semibold text-primary">
                    {milestone.sequence}
                  </span>
                  <span className={milestone.completed ? 'text-gray-400 line-through' : ''}>
                    {milestone.title}
                  </span>
                </label>
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
          );
        })}
      </ol>
    </div>
  );
}
