/**
 * Textarea — shared multi-line text field used across the app.
 *
 * Mirrors {@link Input}/{@link Select}: the same rounded shape, uniform canvas
 * fill, placeholder color, and focus ring so multi-line fields read as part of
 * the same form system. Label-less by design — pass an `aria-label` (or wire an
 * external `<label htmlFor>`). Forwards all native textarea attributes.
 *
 * Named exports only. No `any`.
 */

import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

/** Shared field shape — matches {@link Input}/{@link Select}, minus the fixed height. */
export const TEXTAREA_CLASS =
  'w-full rounded-[10px] border border-gray-200 bg-canvas px-4 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/40 disabled:cursor-not-allowed disabled:opacity-50';

export type ITextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, ITextareaProps>(function Textarea(
  { className = '', rows = 3, ...rest },
  ref,
) {
  const classes = [TEXTAREA_CLASS, 'resize-none', className]
    .filter((p) => p.length > 0)
    .join(' ');
  return <textarea ref={ref} rows={rows} className={classes} {...rest} />;
});
