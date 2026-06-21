import type { JSX } from 'react';

/**
 * ScoreDial — purely presentational radial dial for a 0–100 dimension score.
 *
 * Renders an accessible `role="meter"` element exposing the exact numeric
 * value via `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-valuetext`,
 * with a visible numeric readout at the center and the dimension label below.
 *
 * The arc is drawn with an inline SVG `<circle>` using `strokeDasharray` /
 * `strokeDashoffset` to render the filled portion of the ring. The
 * `strokeDashoffset` is the one dynamic SVG attribute that cannot be expressed
 * as a Tailwind utility (it is a computed geometric length), so it is set via
 * an attribute — this is a deliberate, documented exception to the
 * "no inline values" guideline. All other styling uses Tailwind utility
 * classes and the brand palette.
 *
 * No store/service calls and no side effects — all data comes from props.
 */

export interface IScoreDialProps {
  /** Dimension score in the inclusive range 0..100. Values outside are clamped. */
  score: number;
  /** Optional human-readable label describing the dimension being scored. */
  label?: string;
}

/** Clamp an arbitrary number into the inclusive 0..100 range and round it. */
function clampScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Pick a brand-palette stroke color for the dial arc based on the score band.
 * - low (0–49): amethyst purple (primary)
 * - mid (50–79): cyber yellow (accent-yellow)
 * - high (80–100): turquoise green (accent-green)
 */
function bandStrokeClass(score: number): string {
  if (score >= 80) {
    return 'text-accent-green';
  }
  if (score >= 50) {
    return 'text-accent-yellow';
  }
  return 'text-primary';
}

// SVG geometry constants for the radial ring.
const SVG_SIZE = 96; // viewBox is 0 0 96 96
const CENTER = SVG_SIZE / 2;
const STROKE_WIDTH = 10;
const RADIUS = CENTER - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreDial({ score, label }: IScoreDialProps): JSX.Element {
  const value = clampScore(score);
  const accessibleLabel = label ?? 'Dimension score';
  // Length of the dashed (unfilled) remainder of the ring.
  const dashOffset = CIRCUMFERENCE * (1 - value / 100);

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        role="meter"
        aria-label={accessibleLabel}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${value} out of 100`}
        className={`relative inline-flex h-24 w-24 items-center justify-center ${bandStrokeClass(value)}`}
      >
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="h-full w-full -rotate-90"
          aria-hidden="true"
          focusable="false"
        >
          {/* Track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            className="stroke-gray-200"
          />
          {/* Filled arc — color comes from the parent `text-*` via `currentColor`. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className="absolute text-lg font-semibold text-gray-900">{value}</span>
      </div>
      <figcaption className="text-center text-sm font-medium text-gray-700">
        {accessibleLabel}
      </figcaption>
    </figure>
  );
}
