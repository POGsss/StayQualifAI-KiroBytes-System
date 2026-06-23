import { useState } from 'react';
import type { JSX } from 'react';

import { Button } from '../Button';
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
  Free: 'bg-accent-blue/10 text-accent-blue',
  Paid: 'bg-accent-yellow/20 text-ink',
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
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-6 shadow-card">
      {/* Header: title + cost badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-snug text-ink">
          {recommendation.title}
        </h3>
        <span
          className={[
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
            COST_BADGE_STYLES[recommendation.cost],
          ].join(' ')}
        >
          {recommendation.cost}
        </span>
      </div>

      {/* Provider & rating */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="font-medium text-ink">{recommendation.provider}</span>
        {recommendation.rating !== undefined && (
          <span className="inline-flex items-center gap-1 text-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-accent-yellow"
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

      {/* Actions: external link + Save bookmark (pinned to the bottom) */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          type="button"
          onClick={() => window.open(recommendation.url, '_blank', 'noopener,noreferrer')}
          size="sm"
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
        </Button>

        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={saved || saving}
          variant={saved ? 'subtle' : 'outline'}
          size="sm"
          className={
            saved
              ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/20 hover:bg-accent-blue/15'
              : ''
          }
        >
          {saved ? (
            <>
              <svg
                className="h-4 w-4 mr-1"
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
                  d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                />
              </svg>
              {saving ? 'Saving…' : 'Save'}
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
