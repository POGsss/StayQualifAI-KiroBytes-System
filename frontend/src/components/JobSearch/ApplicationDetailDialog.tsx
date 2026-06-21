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
  Wishlist: 'bg-gray-100 text-gray-700',
  Applied: 'bg-blue-100 text-blue-700',
  Interviewing: 'bg-yellow-100 text-yellow-700',
  Offer: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

/**
 * Work mode badge color mapping.
 */
const WORK_MODE_COLORS: Record<string, string> = {
  Remote: 'bg-emerald-100 text-emerald-700',
  Hybrid: 'bg-orange-100 text-orange-700',
  Onsite: 'bg-purple-100 text-purple-700',
};

/**
 * ApplicationDetailDialog — native `<dialog>` showing full application details.
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
      className="rounded-2xl bg-white p-0 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl backdrop:bg-black/50"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white p-6 pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {listing.title}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{listing.company}</p>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Close"
          className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
          <h3 id="listing-details-heading" className="text-sm font-semibold text-gray-900 mb-3">
            Listing Details
          </h3>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Location:</span>
              <span>{listing.location}</span>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${WORK_MODE_COLORS[listing.workMode] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {listing.workMode}
              </span>
            </div>

            {listing.description && (
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  Description
                </summary>
                <p className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-600 whitespace-pre-wrap">
                  {listing.description}
                </p>
              </details>
            )}

            {listing.sourceUrls.length > 0 && (
              <div className="text-sm">
                <span className="font-medium text-gray-700">Source: </span>
                <a
                  href={listing.sourceUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  View original listing
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Application Metadata */}
        <section aria-labelledby="app-metadata-heading">
          <h3 id="app-metadata-heading" className="text-sm font-semibold text-gray-900 mb-3">
            Application Info
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STAGE_COLORS[application.stage]}`}
            >
              {application.stage}
            </span>
            <span className="text-gray-500">
              Added {formatDate(application.dateAdded)}
            </span>
            <span className="text-gray-500">
              Stage changed {formatDate(application.dateStageChanged)}
            </span>
          </div>
        </section>

        {/* Notes Editor */}
        <section aria-labelledby="notes-heading">
          <label
            id="notes-heading"
            htmlFor="application-notes"
            className="block text-sm font-semibold text-gray-900 mb-2"
          >
            Notes
          </label>
          <textarea
            id="application-notes"
            value={notesValue}
            onChange={handleNotesChange}
            maxLength={NOTES_MAX_LENGTH}
            placeholder="Add notes about this application…"
            className="w-full rounded-lg border border-gray-300 p-3 text-sm resize-none min-h-[120px] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-1 flex items-center justify-between">
            {saveError && (
              <p className="text-xs text-red-600">
                Failed to save notes. Your changes are preserved locally.
              </p>
            )}
            {status === 'loading' && !saveError && (
              <p className="text-xs text-gray-400">Saving…</p>
            )}
            {!saveError && status !== 'loading' && <span />}
            <p
              className={`text-xs ${isAtLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}
            >
              {characterCount}/{NOTES_MAX_LENGTH}
            </p>
          </div>
        </section>

        {/* Stage History Timeline */}
        {sortedHistory.length > 0 && (
          <section aria-labelledby="stage-history-heading">
            <h3 id="stage-history-heading" className="text-sm font-semibold text-gray-900 mb-3">
              Stage History
            </h3>
            <ul className="space-y-2">
              {sortedHistory.map((entry, index) => (
                <li
                  key={`${entry.stage}-${entry.changedAt}-${index}`}
                  className="flex items-center gap-3 text-sm text-gray-600"
                >
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[entry.stage]}`}
                  >
                    {entry.stage}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(entry.changedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Delete Section */}
        <section className="border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2"
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
