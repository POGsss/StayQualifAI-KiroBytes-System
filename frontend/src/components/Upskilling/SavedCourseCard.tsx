import { useState } from 'react';
import type { JSX } from 'react';

import type { CostClassification, ISavedCourse } from '../../types/upskilling.types';

/**
 * SavedCourseCard — a single bookmarked course in the saved list.
 *
 * Shows the saved course title, provider, a cost badge (Free/Paid), an
 * external HTTPS link (opens in a new tab with `rel="noopener noreferrer"`),
 * and a Delete button that removes the bookmark via the `onDelete` callback
 * (Req 6.3, 6.5). Deletion state is tracked locally to disable the button while
 * the request is in flight.
 */

interface SavedCourseCardProps {
  course: ISavedCourse;
  /** Remove the saved course by id. */
  onDelete: (id: string) => Promise<void>;
}

const COST_BADGE_STYLES: Record<CostClassification, string> = {
  Free: 'bg-accent-blue/10 text-accent-blue',
  Paid: 'bg-accent-yellow/20 text-ink',
};

export function SavedCourseCard({ course, onDelete }: SavedCourseCardProps): JSX.Element {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await onDelete(course.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-6 shadow-card">
      {/* Header: title + cost badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-snug text-ink">{course.title}</h3>
        <span
          className={[
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
            COST_BADGE_STYLES[course.cost],
          ].join(' ')}
        >
          {course.cost}
        </span>
      </div>

      {/* Provider */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="font-medium text-ink">{course.provider}</span>
      </div>

      {/* Actions: external link + Delete (pinned to the bottom) — styled to
          match the ProjectCard action buttons for cross-module consistency. */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => window.open(course.url, '_blank', 'noopener,noreferrer')}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
            'bg-sidebar text-white hover:bg-black',
          ].join(' ')}
        >
          View course
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="inline-block h-4 w-4 ml-1"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.5-3.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V4.06l-6.22 6.22a.75.75 0 1 1-1.06-1.06L15.44 3h-2.69a.75.75 0 0 1-.75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2
            text-sm font-medium text-ink transition-colors hover:bg-canvas
            disabled:cursor-not-allowed disabled:opacity-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
            focus-visible:ring-offset-2"
        >
          <svg
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </article>
  );
}
