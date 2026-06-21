import type { JSX } from 'react';

import type { IListing, WorkMode } from '../../types/jobsearch.types';

/**
 * ListingCard — displays a single job listing in the feed.
 *
 * Shows title, company, location, work mode badge, salary range (if present),
 * date posted, and a direct-apply link opening in a new tab (Req 1.4).
 *
 * Work mode badge colors:
 * - Remote: green
 * - Hybrid: yellow
 * - Onsite: pink
 */

interface ListingCardProps {
  listing: IListing;
}

const WORK_MODE_STYLES: Record<WorkMode, string> = {
  Remote: 'bg-emerald-100 text-emerald-700',
  Hybrid: 'bg-yellow-100 text-yellow-700',
  Onsite: 'bg-pink-100 text-pink-700',
};

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) {
    return null;
  }
  const fmt = (n: number): string => {
    if (n >= 1000) {
      return `$${(n / 1000).toFixed(0)}k`;
    }
    return `$${n}`;
  };
  if (min !== null && max !== null) {
    return `${fmt(min)} – ${fmt(max)}`;
  }
  if (min !== null) {
    return `From ${fmt(min)}`;
  }
  return `Up to ${fmt(max!)}`;
}

export function ListingCard({ listing }: ListingCardProps): JSX.Element {
  const salary = formatSalary(listing.salaryMin, listing.salaryMax);
  const applyUrl = listing.sourceUrls.length > 0 ? listing.sourceUrls[0] : null;

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        {/* Header: title + work mode badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">{listing.title}</h3>
          <span
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
              WORK_MODE_STYLES[listing.workMode],
            ].join(' ')}
          >
            {listing.workMode}
          </span>
        </div>

        {/* Company & Location */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span className="font-medium">{listing.company}</span>
          <span>{listing.location}</span>
        </div>

        {/* Salary & Date */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          {salary !== null && <span>{salary}</span>}
          <span>Posted {formatDate(listing.datePosted)}</span>
        </div>

        {/* Direct apply link */}
        {applyUrl !== null && (
          <div className="mt-1">
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2
                text-sm font-medium text-white transition-colors hover:bg-primary/90
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:ring-offset-2"
            >
              Apply
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="inline-block h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.5-3.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V4.06l-6.22 6.22a.75.75 0 1 1-1.06-1.06L15.44 3h-2.69a.75.75 0 0 1-.75-.75Z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
