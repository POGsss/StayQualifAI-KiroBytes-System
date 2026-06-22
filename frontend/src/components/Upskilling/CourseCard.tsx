import { useState } from 'react';
import type { JSX } from 'react';

import type {
  CostClassification,
  ICourseRecommendation,
} from '../../types/upskilling.types';

/**
 * CourseCard — a single course recommendation returned by a search.
 *
 * Shows the course title, provider, a cost badge (Free/Paid), an optional
 * rating, an external HTTPS link (opens in a new tab with
 * `rel="noopener noreferrer"`), and a Save bookmark button (Req 5.2, 6.1).
 *
 * Save state is tracked locally: the button shows a saving indicator while the
 * request is in flight and a "Saved" confirmation once the bookmark succeeds.
 * The parent owns the actual persistence via the `onSave` callback.
 */

interface CourseCardProps {
  recommendation: ICourseRecommendation;
  /** Persist the recommendation as a bookmark. Resolves `true` on success. */
  onSave: (recommendation: ICourseRecommendation) => Promise<boolean>;
}

const COST_BADGE_STYLES: Record<CostClassification, string> = {
  Free: 'bg-[#00F5D4]/20 text-emerald-700',
  Paid: 'bg-[#9b5de5]/15 text-[#7a3fd0]',
};

function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function CourseCard({ recommendation, onSave }: CourseCardProps): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const ok = await onSave(recommendation);
      if (ok) {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        {/* Header: title + cost badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">{recommendation.title}</h3>
          <span
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
              COST_BADGE_STYLES[recommendation.cost],
            ].join(' ')}
          >
            {recommendation.cost}
          </span>
        </div>

        {/* Provider & rating */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          <span className="font-medium">{recommendation.provider}</span>
          {recommendation.rating !== undefined && (
            <span className="inline-flex items-center gap-1 text-gray-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-[#FEE440]"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
                  clipRule="evenodd"
                />
              </svg>
              {formatRating(recommendation.rating)}
            </span>
          )}
        </div>

        {/* Actions: external link + Save bookmark */}
        <div className="mt-1 flex items-center gap-2">
          <a
            href={recommendation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2
              text-sm font-medium text-white transition-colors hover:bg-primary/90
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
              focus-visible:ring-offset-2"
          >
            View course
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

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saved || saving}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium
              transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-primary/50 focus-visible:ring-offset-2
              ${
                saved
                  ? 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50'
              }`}
          >
            {saved ? (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                  />
                </svg>
                {saving ? 'Saving…' : 'Save'}
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
