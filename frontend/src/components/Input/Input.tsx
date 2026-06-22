/**
 * Input — shared single-line text field used across the app.
 *
 * One uniform shape, height, type ramp, and focus ring so every text input
 * looks identical everywhere. Label-less by design: pass an `aria-label`
 * (or wire an external `<label htmlFor>`) for accessibility. Forwards all
 * native input attributes.
 *
 * Named exports only. No `any`.
 */

import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export type IInputProps = InputHTMLAttributes<HTMLInputElement>;

/** Shared field shape — matches {@link Select} and the `md` Button height. */
export const FIELD_CLASS =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-canvas px-4 text-sm text-ink ' +
  'placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/40 disabled:cursor-not-allowed disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, IInputProps>(function Input(
  { className = '', type = 'text', ...rest },
  ref,
) {
  const classes = [FIELD_CLASS, className].filter((p) => p.length > 0).join(' ');
  return <input ref={ref} type={type} className={classes} {...rest} />;
});
