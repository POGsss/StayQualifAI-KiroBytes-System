/**
 * ResumeDocumentFrame — the shared visual "document viewer" chrome used by both
 * the Resume Scanner (real PDF) and the Resume Builder (HTML reconstruction) so
 * the two previews look exactly alike.
 *
 * It renders:
 *   - a top toolbar bar (left slot for page navigation, right slot for actions)
 *   - a scrollable, centered page area on a soft gray backdrop
 *
 * The frame itself is presentation-only; callers own what goes in the toolbar
 * slots and the page area. Named exports only. No `any`.
 */

import type { JSX, ReactNode } from 'react';

export interface IResumeDocumentFrameProps {
  /** Left side of the toolbar — typically page navigation controls. */
  toolbarLeft?: ReactNode;
  /** Right side of the toolbar — typically actions (print / open). */
  toolbarRight?: ReactNode;
  /** The page content (a PDF canvas or an HTML document page). */
  children: ReactNode;
}

export function ResumeDocumentFrame({
  toolbarLeft,
  toolbarRight,
  children,
}: IResumeDocumentFrameProps): JSX.Element {
  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2">
        <div className="flex min-h-[1.75rem] items-center gap-2">{toolbarLeft}</div>
        <div className="flex min-h-[1.75rem] items-center gap-2">{toolbarRight}</div>
      </div>

      {/* Centered, scrollable page area — only one page is shown at a time. */}
      <div className="flex flex-1 justify-center overflow-auto p-4">
        <div className="h-fit w-full max-w-[800px]">{children}</div>
      </div>
    </div>
  );
}

export interface IDocumentPageNavProps {
  /** 1-based current page index. */
  page: number;
  /** Total page count. */
  total: number;
  /** Go to the previous page. Omit/disable when not applicable. */
  onPrev?: () => void;
  /** Go to the next page. Omit/disable when not applicable. */
  onNext?: () => void;
}

const NAV_BUTTON_CLASS =
  'inline-flex size-7 items-center justify-center rounded-md border border-gray-300 ' +
  'bg-white text-ink transition-colors hover:bg-gray-50 disabled:cursor-not-allowed ' +
  'disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/40';

/**
 * Page navigation control shared by both document viewers: a "prev" arrow, a
 * "Page X of Y" indicator, and a "next" arrow. Arrows auto-disable at the
 * bounds (so a single-page document shows both arrows disabled).
 */
export function DocumentPageNav({
  page,
  total,
  onPrev,
  onNext,
}: IDocumentPageNavProps): JSX.Element {
  const safeTotal = Math.max(total, 1);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={onPrev === undefined || page <= 1}
        aria-label="Previous page"
        className={NAV_BUTTON_CLASS}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="text-xs font-medium text-muted tabular-nums">
        Page {Math.min(page, safeTotal)} of {safeTotal}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={onNext === undefined || page >= safeTotal}
        aria-label="Next page"
        className={NAV_BUTTON_CLASS}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
