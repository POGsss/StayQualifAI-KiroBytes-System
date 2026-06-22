/**
 * KpiCard — shared solid-fill stat card used across every dashboard module.
 *
 * A single Bauhaus KPI tile: white text on blue/red, ink text on yellow, with a
 * large value and a short label. The `unit` slot renders a trailing symbol
 * (e.g. `%`) for percentage metrics; omit it for plain counts.
 *
 * This is the single source of truth for KPI tiles — Resume, Job Search,
 * Upskilling, etc. should all import it so the cards look identical everywhere.
 *
 * Named exports only. No `any`.
 */

import type { JSX } from 'react';

export type KpiTone = 'blue' | 'yellow' | 'red';

export interface IKpiCardProps {
  /** Short label shown above the value. */
  label: string;
  /** The large value (number for counts, string for pre-formatted values). */
  value: number | string;
  /** Solid accent fill tone. */
  tone: KpiTone;
  /** Optional trailing unit rendered after the value (e.g. `%`). */
  unit?: string;
}

const FILL: Record<KpiTone, string> = {
  blue: 'bg-accent-blue text-white',
  yellow: 'bg-accent-yellow text-ink',
  red: 'bg-accent-red text-white',
};

export function KpiCard({ label, value, tone, unit }: IKpiCardProps): JSX.Element {
  const muted = tone === 'yellow' ? 'text-ink/70' : 'text-white/80';

  return (
    <div className={`rounded-2xl p-5 shadow-card ${FILL[tone]}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
        {label}
      </p>
      <p className="mt-3 text-4xl font-bold leading-none">
        {value}
        {unit !== undefined && (
          <span className="ml-0.5 text-2xl font-semibold">{unit}</span>
        )}
      </p>
    </div>
  );
}
