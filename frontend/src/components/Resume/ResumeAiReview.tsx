/**
 * ResumeAiReview — AI-powered feedback panel for the Resume scanner.
 *
 * Renders four labelled blocks (Strengths, Weaknesses, Missing Keywords, ATS
 * Recommendations) once a scan result exists. Before any scan, it shows a
 * single plain hint ("Upload and scan…") — no skeleton placeholder.
 *
 * Named exports only. No `any`.
 */

import type { JSX } from 'react';

type ReviewTone = 'positive' | 'negative' | 'keyword' | 'neutral';

const DOT: Record<ReviewTone, string> = {
  positive: 'bg-accent-blue',
  negative: 'bg-accent-red',
  keyword: 'bg-accent-yellow',
  neutral: 'bg-muted',
};

/** A labelled list block within the AI review panel. */
function ReviewBlock({
  heading,
  items,
  tone,
  emptyHint,
}: {
  heading: string;
  items: string[];
  tone: ReviewTone;
  emptyHint: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={`size-2 rounded-full ${DOT[tone]}`} aria-hidden="true" />
        {heading}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyHint}</p>
      ) : tone === 'keyword' ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={heading}>
          {items.map((item, index) => (
            <li
              key={`${heading}-${index}`}
              className="rounded-full bg-accent-yellow/20 px-2.5 py-0.5 text-xs font-semibold text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm text-ink" aria-label={heading}>
          {items.map((item, index) => (
            <li key={`${heading}-${index}`} className="flex gap-2">
              <span className="text-muted" aria-hidden="true">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface IResumeAiReviewProps {
  /** Whether a scan result is available to render. */
  hasResults: boolean;
  strengths: string[];
  weaknesses: string[];
  missingKeywords: string[];
  recommendations: string[];
}

export function ResumeAiReview({
  hasResults,
  strengths,
  weaknesses,
  missingKeywords,
  recommendations,
}: IResumeAiReviewProps): JSX.Element {
  return (
    <section
      aria-labelledby="ai-review-heading"
      className="flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-panel"
    >
      <h2 id="ai-review-heading" className="text-lg font-bold text-ink">
        AI Review
      </h2>

      {hasResults ? (
        <>
          <ReviewBlock
            heading="Strengths"
            items={strengths}
            tone="positive"
            emptyHint="No standout strengths detected yet."
          />
          <ReviewBlock
            heading="Weaknesses"
            items={weaknesses}
            tone="negative"
            emptyHint="No weaknesses flagged — nice work."
          />
          <ReviewBlock
            heading="Missing Keywords"
            items={missingKeywords}
            tone="keyword"
            emptyHint="Your resume already covers the relevant terms."
          />
          <ReviewBlock
            heading="ATS Recommendations"
            items={recommendations}
            tone="neutral"
            emptyHint="No additional recommendations."
          />
        </>
      ) : (
        <p className="text-sm text-muted">
          Upload and scan a resume to see AI-powered strengths, weaknesses, and
          ATS recommendations.
        </p>
      )}
    </section>
  );
}
