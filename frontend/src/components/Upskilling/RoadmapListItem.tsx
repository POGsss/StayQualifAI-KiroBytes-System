import type { JSX, KeyboardEvent } from 'react';

import type { IRoadmapSummary } from '../../types/upskilling.types';

/**
 * RoadmapListItem — a single saved roadmap in the left-column "Saved Roadmaps"
 * feed of the Roadmap tab.
 *
 * Mirrors the Job Search "Available Jobs" {@link ListingCard} interaction
 * pattern: the whole row is a selectable control (click / Enter / Space) that
 * promotes the roadmap into the right-column detail panel, and the selected
 * row adopts the same grey (`bg-canvas`) active state used by Available Jobs.
 *
 * Shows the current → target transition, a duration badge, and a compact
 * completed/total progress readout so the user can scan their roadmaps without
 * opening each one.
 *
 * Purely presentational — selection is delegated to the parent via `onSelect`.
 */
export interface IRoadmapListItemProps {
  roadmap: IRoadmapSummary;
  /** Whether this row is the one shown in the detail panel. */
  selected: boolean;
  /** Promote this roadmap into the detail panel. */
  onSelect: (id: string) => void;
}

export function RoadmapListItem({
  roadmap,
  selected,
  onSelect,
}: IRoadmapListItemProps): JSX.Element {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(roadmap.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(): void => onSelect(roadmap.id)}
      onKeyDown={handleKeyDown}
      className={[
        'cursor-pointer rounded-2xl p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40',
        selected ? 'bg-canvas' : 'bg-surface hover:bg-canvas/60',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2">
        {/* Header: transition + duration badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">
            {roadmap.currentRole} → {roadmap.targetRole}
          </h3>
          <span className="shrink-0 rounded-full bg-accent-yellow/20 px-2.5 py-0.5 text-[11px] font-semibold text-ink">
            {roadmap.targetDurationMonths} mo
          </span>
        </div>

        {/* Progress */}
        <p className="text-xs font-semibold text-accent-blue">
          {roadmap.completedCount} / {roadmap.totalCount} complete
        </p>
      </div>
    </div>
  );
}
