/**
 * Panel — shared white card surface used across the app.
 *
 * The single source of truth for the Bauhaus "rounded-2xl white card" surface:
 * consistent radius, padding, and subtle elevation. Optionally renders a header
 * row with a `title` and trailing `actions`. Pass `as` to change the semantic
 * element (defaults to `<section>`).
 *
 * Named exports only. No `any`.
 */

import type { ElementType, JSX, ReactNode } from 'react';

export interface IPanelProps {
  /** Optional heading shown at the top-left of the panel. */
  title?: ReactNode;
  /** Optional controls shown at the top-right, aligned with the title. */
  actions?: ReactNode;
  /** Semantic wrapper element. Defaults to `section`. */
  as?: ElementType;
  /** Accessible label for the region when there is no visible title. */
  'aria-label'?: string;
  /** Extra classes appended to the panel wrapper. */
  className?: string;
  children?: ReactNode;
}

export function Panel({
  title,
  actions,
  as,
  className = '',
  children,
  ...rest
}: IPanelProps): JSX.Element {
  const Wrapper = (as ?? 'section') as ElementType;
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <Wrapper
      className={['rounded-2xl bg-surface p-6 shadow-panel', className]
        .filter((p) => p.length > 0)
        .join(' ')}
      {...rest}
    >
      {hasHeader && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title !== undefined && (
            <h2 className="text-lg font-bold text-ink">{title}</h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </Wrapper>
  );
}
