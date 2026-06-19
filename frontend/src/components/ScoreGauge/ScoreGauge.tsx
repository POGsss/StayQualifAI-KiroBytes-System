import type { JSX } from 'react';

/**
 * ScoreGauge — purely presentational gauge for a 0–100 score.
 *
 * Renders an accessible `role="meter"` element exposing the exact numeric
 * value via `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, with a visible
 * numeric readout. The fill color varies by score band using the brand
 * palette, and the fill width uses literal Tailwind utility classes (no inline
 * styles).
 *
 * No store/service calls and no side effects — all data comes from props.
 */

export interface IScoreGaugeProps {
  /** Score in the inclusive range 0..100. Values outside are clamped. */
  score: number;
  /** Optional human-readable label describing what the score represents. */
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
 * Pick a brand-palette fill color for the gauge based on the score band.
 * - low (0–49): amethyst purple (primary)
 * - mid (50–79): cyber yellow (accent-yellow)
 * - high (80–100): turquoise green (accent-green)
 */
function bandColorClass(score: number): string {
  if (score >= 80) {
    return 'bg-accent-green';
  }
  if (score >= 50) {
    return 'bg-accent-yellow';
  }
  return 'bg-primary';
}

/**
 * Map a 0..100 value to a literal Tailwind width utility, quantized to 5%
 * steps. Listing the classes as full literal strings ensures Tailwind's JIT
 * compiler includes them, avoiding inline styles for the dynamic fill.
 */
const WIDTH_CLASSES: Readonly<Record<number, string>> = {
  0: 'w-0',
  5: 'w-[5%]',
  10: 'w-[10%]',
  15: 'w-[15%]',
  20: 'w-[20%]',
  25: 'w-[25%]',
  30: 'w-[30%]',
  35: 'w-[35%]',
  40: 'w-[40%]',
  45: 'w-[45%]',
  50: 'w-[50%]',
  55: 'w-[55%]',
  60: 'w-[60%]',
  65: 'w-[65%]',
  70: 'w-[70%]',
  75: 'w-[75%]',
  80: 'w-[80%]',
  85: 'w-[85%]',
  90: 'w-[90%]',
  95: 'w-[95%]',
  100: 'w-full',
};

function widthClass(score: number): string {
  const bucket = Math.round(score / 5) * 5;
  return WIDTH_CLASSES[bucket] ?? 'w-0';
}

export function ScoreGauge({ score, label }: IScoreGaugeProps): JSX.Element {
  const value = clampScore(score);
  const accessibleLabel = label ?? 'Score';

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-gray-700">{accessibleLabel}</span>
        <span className="text-lg font-semibold text-gray-900">
          {value}
          <span className="text-sm font-normal text-gray-500">/100</span>
        </span>
      </figcaption>
      <div
        role="meter"
        aria-label={accessibleLabel}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${value} out of 100`}
        className="h-3 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${bandColorClass(value)} ${widthClass(value)}`}
        />
      </div>
    </figure>
  );
}
