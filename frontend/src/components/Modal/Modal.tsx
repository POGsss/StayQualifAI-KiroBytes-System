/**
 * Modal — the shared, reusable modal surface for the whole app.
 *
 * Built on the native `<dialog>` element with `.showModal()` (per the project's
 * modern-web steering: native dialog + no third-party modal package). It mirrors
 * the controlled `open` prop onto the imperative dialog API and reports every
 * user-driven dismissal (Escape key, backdrop click, the header close button)
 * through `onClose`.
 *
 * Visual language matches the rest of the app: a `rounded-2xl bg-surface`
 * card with `shadow-panel`, a header (title + optional subtitle + close), a
 * scrollable body, and an optional footer for actions (right-aligned).
 *
 * The `<dialog>` is always mounted so its ref stays stable; callers typically
 * gate the body content on their own state.
 *
 * Named exports only. No `any`.
 */

import { useEffect, useId, useRef } from 'react';
import type { JSX, MouseEvent, ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface IModalProps {
  /** Whether the modal is shown. */
  open: boolean;
  /** Called on any user-driven dismissal (Escape, backdrop, close button). */
  onClose: () => void;
  /** Heading shown at the top-left. */
  title?: ReactNode;
  /** Secondary line under the title (e.g. a company name). */
  subtitle?: ReactNode;
  /** Right-aligned action row pinned to the bottom (e.g. a Delete button). */
  footer?: ReactNode;
  /** Max width of the modal. Defaults to `md`. */
  size?: ModalSize;
  /** Accessible label used when no visible `title` is provided. */
  'aria-label'?: string;
  children: ReactNode;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = 'md',
  children,
  ...rest
}: IModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Mirror the controlled `open` prop onto the imperative dialog API. The
  // feature checks keep non-DOM test environments (jsdom without dialog
  // support) from throwing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else if (!open && dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [open]);

  // Bridge a native close (Escape key / programmatic) back to the parent.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    const handleClose = (): void => {
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return (): void => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  // Close when the backdrop (the dialog element itself) is clicked.
  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={title !== undefined ? titleId : undefined}
      onClick={handleDialogClick}
      className={`w-[calc(100vw-2rem)] ${SIZE_CLASS[size]} overflow-hidden rounded-2xl border-0 bg-surface p-0 text-ink shadow-panel backdrop:bg-bauhaus-ink/60 open:animate-dialog-pop`}
      {...rest}
    >
      <div className="flex max-h-[85vh] flex-col">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            {title !== undefined ? (
              <h2 id={titleId} className="truncate text-lg font-bold text-ink">
                {title}
              </h2>
            ) : null}
            {subtitle !== undefined ? (
              <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer (optional, right-aligned) */}
        {footer !== undefined ? (
          <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
