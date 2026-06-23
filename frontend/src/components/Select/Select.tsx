/**
 * Select — shared dropdown field used across the app.
 *
 * Shares the exact shape, height, and focus ring with {@link Input} so text
 * fields and selects line up perfectly in a toolbar. Label-less by design:
 * pass an `aria-label` (or wire an external `<label htmlFor>`). Options are
 * supplied declaratively via the `options` prop. Forwards native select attrs.
 *
 * The native dropdown arrow is suppressed (`appearance-none`) and replaced with
 * a custom Lucide `ChevronDown` icon so every select looks identical across
 * browsers and matches the Bauhaus styling.
 *
 * Named exports only. No `any`.
 */

import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

import { FIELD_CLASS } from '../Input';

export interface ISelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ISelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: ReadonlyArray<ISelectOption>;
}

export const Select = forwardRef<HTMLSelectElement, ISelectProps>(function Select(
  { className = '', options, ...rest },
  ref,
) {
  // `appearance-none` hides the native chevron; extra right padding leaves room
  // for the custom icon overlay.
  const classes = [FIELD_CLASS, 'cursor-pointer appearance-none pr-10', className]
    .filter((p) => p.length > 0)
    .join(' ');
  return (
    <div className="relative w-full">
      <select ref={ref} className={classes} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
});
