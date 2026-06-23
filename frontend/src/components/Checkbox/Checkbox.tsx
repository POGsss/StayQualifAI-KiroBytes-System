/**
 * Checkbox — shared custom Bauhaus-style checkbox used across the app.
 *
 * A single geometric square control that matches the Bauhaus design system:
 * a 2px ink border on a white surface when unchecked, a solid Bauhaus-blue
 * fill with a white check when checked, and a dimmed, non-interactive look
 * when disabled. The native chevron/box is suppressed (`appearance-none`) and
 * a custom check overlay is layered on top so it looks identical across
 * browsers.
 *
 * It renders a real `<input type="checkbox">` so it stays fully keyboard
 * navigable, focus-visible, and form/accessibility friendly — wire an
 * `aria-label` or an external `<label htmlFor>` for a name.
 *
 * States:
 *   - unchecked → white fill, ink border
 *   - checked   → Bauhaus-blue fill, ink border, white check
 *   - disabled  → reduced opacity, not-allowed cursor (either state)
 *
 * Named exports only. No `any`.
 */

import { forwardRef } from 'react';
import type { InputHTMLAttributes, JSX } from 'react';

export type ICheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = forwardRef<HTMLInputElement, ICheckboxProps>(function Checkbox(
  { className = '', ...rest },
  ref,
): JSX.Element {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        ref={ref}
        type="checkbox"
        className={[
          'peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border-2 border-bauhaus-ink bg-surface',
          'transition-colors checked:border-bauhaus-ink checked:bg-accent-blue',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40 focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className,
        ]
          .filter((part) => part.length > 0)
          .join(' ')}
        {...rest}
      />
      {/* Check overlay — only visible in the checked state. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
});
