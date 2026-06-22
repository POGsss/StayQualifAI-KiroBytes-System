/**
 * Select — shared dropdown field used across the app.
 *
 * Shares the exact shape, height, and focus ring with {@link Input} so text
 * fields and selects line up perfectly in a toolbar. Label-less by design:
 * pass an `aria-label` (or wire an external `<label htmlFor>`). Options are
 * supplied declaratively via the `options` prop. Forwards native select attrs.
 *
 * Named exports only. No `any`.
 */

import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

import { FIELD_CLASS } from '../Input';

export interface ISelectOption {
  value: string;
  label: string;
}

export interface ISelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: ReadonlyArray<ISelectOption>;
}

export const Select = forwardRef<HTMLSelectElement, ISelectProps>(function Select(
  { className = '', options, ...rest },
  ref,
) {
  const classes = [FIELD_CLASS, 'cursor-pointer', className]
    .filter((p) => p.length > 0)
    .join(' ');
  return (
    <select ref={ref} className={classes} {...rest}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});
