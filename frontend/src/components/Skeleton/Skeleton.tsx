import type { JSX } from 'react';

// ─── Skeleton ────────────────────────────────────────────────────────────────

export interface ISkeletonProps {
  /** Tailwind sizing utilities for the shimmer block (e.g. "h-4 w-full"). */
  className?: string;
}

/**
 * Single shimmer block.
 *
 * Purely decorative — hidden from assistive tech (`aria-hidden="true"`) and
 * never focusable (no tabIndex, no interactive role). All interactive and
 * meaningful content must be provided by the parent once loading completes
 * (Req 14.7).
 */
export function Skeleton({ className = '' }: ISkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-gray-200 ${className}`}
    />
  );
}

// ─── SkeletonText ─────────────────────────────────────────────────────────────

export interface ISkeletonTextProps {
  /** Number of text-line shimmer rows to render. Defaults to 3. */
  lines?: number;
}

/**
 * N stacked text-line skeletons approximating a block of body copy.
 *
 * Each line is `aria-hidden`; the wrapper itself carries no role so it does
 * not announce anything to assistive tech on its own — compose inside a
 * `SkeletonList` (or another `role="status"` wrapper) for a loading region
 * (Req 14.7).
 */
export function SkeletonText({ lines = 3 }: ISkeletonTextProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          // Last line is shorter to mimic natural paragraph endings.
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

/**
 * A panel-shaped skeleton approximating a card.
 *
 * Contains a header shimmer and three body-line shimmers. Like `SkeletonText`,
 * it is decorative and should be composed inside a `role="status"` wrapper
 * (e.g. `SkeletonList`) for the loading-region semantics (Req 14.7).
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl bg-white p-6 shadow-sm"
    >
      {/* Card header */}
      <Skeleton className="mb-4 h-6 w-1/3" />
      {/* Card body */}
      <SkeletonText lines={3} />
    </div>
  );
}

// ─── SkeletonList ─────────────────────────────────────────────────────────────

export interface ISkeletonListProps {
  /** Number of row skeletons to render. Defaults to 4. */
  rows?: number;
  /**
   * Human-readable label announced to assistive tech via `aria-label`
   * (e.g. "Loading sessions"). Required — callers must always provide context
   * for the loading region (Req 14.1, 14.3, 14.6).
   */
  label: string;
}

/**
 * A busy/loading region of repeated row skeletons.
 *
 * The wrapper carries `role="status"`, `aria-busy="true"`, and `aria-label`
 * so assistive tech announces the loading state with the provided label.
 * The individual shimmer shapes inside are `aria-hidden` and contain no
 * focusable elements (Req 14.1, 14.3, 14.6, 14.7).
 */
export function SkeletonList({ rows = 4, label }: ISkeletonListProps): JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="flex flex-col gap-3"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3">
          {/* Leading avatar/icon placeholder */}
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          {/* Row text lines */}
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
