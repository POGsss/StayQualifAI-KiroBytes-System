import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { Stage } from '../../types/jobsearch.types';

const NOTES_MAX_LENGTH = 2000;
const DEBOUNCE_MS = 1000;

/**
 * Stage badge color mapping for visual differentiation.
 */
const STAGE_COLORS: Record<Stage, string> = {
  Wishlist: 'bg-canvas text-muted border border-gray-200',
  Applied: 'bg-accent-blue/10 text-accent-blue',
  Interviewing: 'bg-accent-yellow/20 text-ink',
  Offer: 'bg-accent-blue text-white',
  Rejected: 'bg-accent-red/10 text-accent-red',
};

/**
 * Work mode badge color mapping.
 */
const WORK_MODE_COLORS: Record<string, string> = {
  Remote: 'bg-accent-blue/10 text-accent-blue',
  Hybrid: 'bg-accent-yellow/20 text-ink',
  Onsite: 'bg-canvas text-muted border border-gray-200',
};

/**
 * ApplicationDetailDialog — native `<dialog>` showing full application details (Bauhaus redesign).
 *
 * Controlled by `selectedApplication` in the Zustand store. When non-null, the
 * dialog opens via `.showModal()`. Closing clears `selectedApplication`.
 *
 * Includes: listing details, application metadata, notes editor with debounced
 * auto-save, stage history timeline, and delete with confirmation.
 */
export function ApplicationDetailDialog(): JSX.Element | null {
  const selectedApplication = useJobSearchStore((s) => s.selectedApplication);
  const updateNotes = useJobSearchStore((s) => s.updateNotes);
  const deleteApplication = useJobSearchStore((s) => s.deleteApplication);
  const status = useJobSearchStore((s) => s.status);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notesValue, setNotesValue] = useState('');
  const [saveError, setSaveError] = useState(false);

  // Sync notes value when selectedApplication changes
  useEffect(() => {
    if (selectedApplication) {
      setNotesValue(selectedApplication.application.notes ?? '');
      setSaveError(false);
    }
  }, [selectedApplication]);

  // Open/close dialog based on selectedApplication
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedApplication && !dialog.open) {
      dialog.showModal();
    } else if (!selectedApplication && dialog.open) {
      dialog.close();
    }
  }, [selectedApplication]);

  const clearSelection = useCallback((): void => {
    useJobSearchStore.setState({ selectedApplication: null });
  }, []);

  // Handle backdrop click (click on dialog element itself, not its children)
  const handleDialogClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === e.currentTarget) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  // Handle native close event (Escape key or programmatic close)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClose(): void {
      clearSelection();
    }

    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [clearSelection]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const value = e.target.value;
      // Guard against exceeding max length (in addition to maxLength attribute)
      if (value.length > NOTES_MAX_LENGTH) return;

      setNotesValue(value);
      setSaveError(false);

      // Debounced auto-save
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const appId = selectedApplication?.application.id;
      if (!appId) return;

      debounceRef.current = setTimeout(async () => {
        const result = await updateNotes(appId, value);
        if (result === null) {
          setSaveError(true);
        }
      }, DEBOUNCE_MS);
    },
    [selectedApplication, updateNotes],
  );

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!selectedApplication) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete the application for "${selectedApplication.listing.title}" at ${selectedApplication.listing.company}? This action cannot be undone.`,
    );

    if (confirmed) {
      await deleteApplication(selectedApplication.application.id);
      // deleteApplication in the store already clears selectedApplication when the deleted app matches
    }
  }, [selectedApplication, deleteApplication]);

  // Always render the dialog element so the ref is stable
  if (!selectedApplication) {
    return <dialog ref={dialogRef} className="hidden" />;
  }

  const { application, listing, stageHistory } = selectedApplication;
  const characterCount = notesValue.length;
  const isAtLimit = characterCount >= NOTES_MAX_LENGTH;

  // Stage history in reverse chronological order
  const sortedHistory = [...stageHistory].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      className="rounded-2xl bg-surface p-0 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-panel border-none outline-none animate-dialog-pop backdrop:bg-black/50"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-200 bg-surface p-6 pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink truncate">
            {listing.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{listing.company}</p>
        </div>
        <button
          type="button"
          onClick={clearSelection}
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
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Listing Details Panel */}
        <section aria-labelledby="listing-details-heading">
          <h3 id="listing-details-heading" className="text-sm font-bold text-ink mb-3 uppercase tracking-wider">
            Listing Details
          </h3>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <span className="font-semibold">Location:</span>
              <span className="text-muted">{listing.location}</span>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${WORK_MODE_COLORS[listing.workMode] ?? 'bg-canvas text-muted border border-gray-200'}`}
              >
                {listing.workMode}
              </span>
            </div>

            {listing.description && (
              <details className="group">
                <summary className="cursor-pointer text-sm font-semibold text-ink hover:text-accent-blue select-none">
                  Description
                </summary>
                <p className="mt-2 max-h-40 overflow-y-auto text-sm text-muted whitespace-pre-wrap bg-canvas p-3 rounded-xl border border-gray-200">
                  {listing.description}
                </p>
              </details>
            )}

            {listing.sourceUrls.length > 0 && (
              <div className="text-sm">
                <span className="font-semibold text-ink">Source: </span>
                <a
                  href={listing.sourceUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-blue underline hover:text-accent-blue/80"
                >
                  View original listing
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Application Metadata */}
        <section aria-labelledby="app-metadata-heading">
          <h3 id="app-metadata-heading" className="text-sm font-bold text-ink mb-3 uppercase tracking-wider">
            Application Info
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STAGE_COLORS[application.stage]}`}
            >
              {application.stage}
            </span>
            <span className="text-muted">
              Added {formatDate(application.dateAdded)}
            </span>
            <span className="text-muted">
              Stage changed {formatDate(application.dateStageChanged)}
            </span>
          </div>
        </section>

        {/* Notes Editor */}
        <section aria-labelledby="notes-heading">
          <label
            id="notes-heading"
            htmlFor="application-notes"
            className="block text-sm font-bold text-ink mb-2 uppercase tracking-wider"
          >
            Notes
          </label>
          <textarea
            id="application-notes"
            value={notesValue}
            onChange={handleNotesChange}
            maxLength={NOTES_MAX_LENGTH}
            placeholder="Add notes about this application…"
            className="w-full rounded-[10px] border border-gray-200 bg-canvas p-3 text-sm text-ink resize-none min-h-[120px] transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
          />
          <div className="mt-1 flex items-center justify-between">
            {saveError && (
              <p className="text-xs text-accent-red font-semibold">
                Failed to save notes. Your changes are preserved locally.
              </p>
            )}
            {status === 'loading' && !saveError && (
              <p className="text-xs text-muted">Saving…</p>
            )}
            {!saveError && status !== 'loading' && <span />}
            <p
              className={`text-xs ${isAtLimit ? 'text-accent-red font-semibold' : 'text-muted'}`}
            >
              {characterCount}/{NOTES_MAX_LENGTH}
            </p>
          </div>
        </section>

        {/* Stage History Timeline */}
        {sortedHistory.length > 0 && (
          <section aria-labelledby="stage-history-heading">
            <h3 id="stage-history-heading" className="text-sm font-bold text-ink mb-3 uppercase tracking-wider">
              Stage History
            </h3>
            <ul className="space-y-2 bg-canvas p-4 rounded-xl border border-gray-200">
              {sortedHistory.map((entry, index) => (
                <li
                  key={`${entry.stage}-${entry.changedAt}-${index}`}
                  className="flex items-center gap-3 text-sm text-muted"
                >
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_COLORS[entry.stage]}`}
                  >
                    {entry.stage}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDateTime(entry.changedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Delete Section */}
        <section className="border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center justify-center rounded-[10px] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-11 px-5 border-2 border-accent-red text-accent-red hover:bg-accent-red hover:text-white"
          >
            Delete Application
          </button>
        </section>
      </div>
    </dialog>
  );
}

/**
 * Format a date string to a short human-readable format.
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date string to include time for history entries.
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
