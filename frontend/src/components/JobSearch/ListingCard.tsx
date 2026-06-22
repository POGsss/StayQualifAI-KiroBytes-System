import type { JSX, KeyboardEvent } from 'react';

import type { IListing, WorkMode } from '../../types/jobsearch.types';

/**
 * ListingCard — a single job listing in the left-column feed of the Job Search
 * recruitment dashboard (Bauhaus redesign).
 *
 * Shows title, company, location, a work-mode badge, and the salary range. The
 * whole card is a selectable control: activating it (click / Enter / Space)
 * promotes the listing into the right-column {@link JobDetailsPanel}. A Save
 * action and a direct-apply link sit at the bottom; Save is driven by the
 * parent (store-backed) so the "Saved Jobs" KPI stays in sync.
 *
 * Work-mode badge colors follow the Bauhaus accent palette.
 */

export interface IListingCardProps {
  listing: IListing;
  /** Whether this card is the one shown in the details panel. */
  selected: boolean;
  /** Promote this listing into the details panel. */
  onSelect: (listing: IListing) => void;
  /** Whether the listing is already saved to the tracker. */
  isSaved: boolean;
  /** True while this listing's save request is in flight. */
  isSaving: boolean;
  /** Save the listing to the application tracker. */
  onSave: (listing: IListing) => void;
}

const WORK_MODE_STYLES: Record<WorkMode, string> = {
  Remote: 'bg-accent-blue/10 text-accent-blue',
  Hybrid: 'bg-accent-yellow/20 text-ink',
  Onsite: 'bg-accent-red/10 text-accent-red',
};

function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) {
    return null;
  }
  const fmt = (n: number): string =>
    n >= 1000 ? `₱${String(Math.round(n / 1000))}k` : `₱${String(n)}`;
  if (min !== null && max !== null) {
    return `${fmt(min)} – ${fmt(max)}`;
  }
  if (min !== null) {
    return `From ${fmt(min)}`;
  }
  return `Up to ${fmt(max as number)}`;
}

export function ListingCard({
  listing,
  selected,
  onSelect,
  isSaved,
  isSaving,
  onSave,
}: IListingCardProps): JSX.Element {
  const salary = formatSalary(listing.salaryMin, listing.salaryMax);
  const applyUrl = listing.sourceUrls.length > 0 ? listing.sourceUrls[0] : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(listing);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(): void => onSelect(listing)}
      onKeyDown={handleKeyDown}
      className={[
        'cursor-pointer rounded-2xl p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40',
        selected ? 'bg-canvas' : 'bg-surface hover:bg-canvas/60',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2">
        {/* Header: title + work mode badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">{listing.title}</h3>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${WORK_MODE_STYLES[listing.workMode]}`}
          >
            {listing.workMode}
          </span>
        </div>

        {/* Company & location */}
        <div className="flex flex-col gap-0.5 text-xs text-muted">
          <span className="font-medium text-ink/80">{listing.company}</span>
          <span>{listing.location}</span>
        </div>

        {/* Salary */}
        {salary !== null && (
          <p className="text-xs font-semibold text-accent-blue">{salary}</p>
        )}

        {/* Actions */}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={(e): void => {
              e.stopPropagation();
              onSave(listing);
            }}
            disabled={isSaved || isSaving}
            className={[
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40',
              isSaved
                ? 'cursor-default border-accent-blue/30 bg-accent-blue/10 text-accent-blue'
                : 'border-gray-200 text-ink hover:bg-canvas disabled:opacity-50',
            ].join(' ')}
          >
            {isSaved ? 'Saved' : isSaving ? 'Saving…' : 'Save'}
          </button>

          {applyUrl !== null && (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e): void => e.stopPropagation()}
              className="rounded-lg bg-bauhaus-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-bauhaus-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40"
            >
              Apply
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
