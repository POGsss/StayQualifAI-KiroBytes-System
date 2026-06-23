import type { JSX } from 'react';
import type { PassFailTier } from '../../types/interview.types';

/**
 * TierBadge — purely presentational PASS/FAIL pill.
 *
 * Renders a `rounded-full` pill conveying an interview pass/fail outcome.
 *
 * Palette choice (documented): the brand palette has no dedicated red token,
 * so the two outcomes are distinguished by both color AND text — color is
 * never the only signal:
 * - PASS → `bg-accent-green` (Electric Turquoise Green, the palette's
 *   success/positive token) with dark `text-ink` for AA contrast.
 * - FAIL → `bg-accent-pink` (Soft Pastel Pink, the closest negative/alert tone
 *   available) with dark `text-ink` for AA contrast.
 * The visible "PASS"/"FAIL" word is the primary signal, and an explicit
 * `aria-label` plus visually-hidden text ensures the result is conveyed to
 * assistive technology and color-blind users.
 *
 * No store/service calls and no side effects — all data comes from props.
 */

export interface ITierBadgeProps {
  /** The pass/fail outcome to display. */
  tier: PassFailTier;
}

interface ITierStyle {
  readonly pillClass: string;
  readonly srText: string;
}

const TIER_STYLES: Readonly<Record<PassFailTier, ITierStyle>> = {
  PASS: {
    pillClass: 'bg-accent-blue/10 text-accent-blue',
    srText: 'Result: pass',
  },
  FAIL: {
    pillClass: 'bg-accent-red/10 text-accent-red',
    srText: 'Result: fail',
  },
};

export function TierBadge({ tier }: ITierBadgeProps): JSX.Element {
  const { pillClass, srText } = TIER_STYLES[tier];

  return (
    <span
      aria-label={srText}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${pillClass}`}
    >
      <span aria-hidden="true">{tier}</span>
      <span className="sr-only">{srText}</span>
    </span>
  );
}
