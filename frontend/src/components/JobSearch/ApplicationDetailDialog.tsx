import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { Modal } from '../Modal';
import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { Stage } from '../../types/jobsearch.types';

const NOTES_MAX_LENGTH = 2000;
const DEBOUNCE_MS = 1000;
/** Cap the stage-history list to the most recent entries to avoid crowding. */
const HISTORY_LIMIT = 5;

/** Stage badge color mapping for visual differentiation. */
const STAGE_COLORS: Record<Stage, string> = {
  Wishlist: 'bg-canvas text-muted border border-gray-200',
  Applied: 'bg-accent-blue/10 text-accent-blue',
  Interviewing: 'bg-accent-yellow/20 text-ink',
  Offer: 'bg-accent-blue text-white',
  Rejected: 'bg-accent-red/10 text-accent-red',
};

/** Work mode badge color mapping. */
const WORK_MODE_COLORS: Record<string, string> = {
  Remote: 'bg-accent-blue/10 text-accent-blue',
  Hybrid: 'bg-accent-yellow/20 text-ink',
  Onsite: 'bg-canvas text-muted border border-gray-200',
};

/**
 * ApplicationDetailDialog — application details rendered in the shared {@link Modal}.
 *
 * Controlled by `selectedApplication` in the Zustand store. Shows only the
 * essentials (status + key facts, notes editor, and a compact, collapsible
 * stage history that surfaces just the most recent entries). Delete lives in
 * the modal footer, right-aligned.
 */
export function ApplicationDetailDialog(): JSX.Element {
  const selectedApplication = useJobSearchStore((s) => s.selectedApplication);
  const updateNotes = useJobSearchStore((s) => s.updateNotes);
  const deleteApplication = useJobSearchStore((s) => s.deleteApplication);
  const status = useJobSearchStore((s) => s.status);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notesValue, setNotesValue] = useState('');
  const [saveError, setSaveError] = useState(false);

  // Sync notes value when selectedApplication changes.
  useEffect(() => {
    if (selectedApplication) {
      setNotesValue(selectedApplication.application.notes ?? '');
      setSaveError(false);
    }
  }, [selectedApplication]);

  // Clean up debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const clearSelection = useCallback((): void => {
    useJobSearchStore.setState({ selectedApplication: null });
  }, []);

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const value = e.target.value;
      if (value.length > NOTES_MAX_LENGTH) return;

      setNotesValue(value);
      setSaveError(false);

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
      // The store clears selectedApplication when the deleted app matches.
      await deleteApplication(selectedApplication.application.id);
    }
  }, [selectedApplication, deleteApplication]);

  const { application, listing, stageHistory } = selectedApplication ?? {
    application: null,
    listing: null,
    stageHistory: [],
  };

  // Most-recent-first, capped to keep the modal uncluttered.
  const recentHistory = [...stageHistory]
    .sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )
    .slice(0, HISTORY_LIMIT);

  const characterCount = notesValue.length;
  const isAtLimit = characterCount >= NOTES_MAX_LENGTH;

  return (
    <Modal
      open={selectedApplication !== null}
      onClose={clearSelection}
      size="lg"
      title={listing?.title ?? ''}
      subtitle={listing?.company ?? ''}
      footer={
        <button
          type="button"
          onClick={(): void => {
            void handleDelete();
          }}
          disabled={status === 'loading'}
          className="inline-flex h-11 items-center justify-center rounded-[10px] border-2 border-accent-red px-5 text-sm font-medium text-accent-red transition-colors hover:bg-accent-red hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete Application
        </button>
      }
    >
      {selectedApplication !== null && application !== null && listing !== null ? (
        <div className="space-y-5">
          {/* Key facts: status + work mode + location, then dates */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STAGE_COLORS[application.stage]}`}
            >
              {application.stage}
            </span>
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${WORK_MODE_COLORS[listing.workMode] ?? 'bg-canvas text-muted border border-gray-200'}`}
            >
              {listing.workMode}
            </span>
            <span className="text-sm text-muted">{listing.location}</span>
          </div>

          <p className="text-xs text-muted">
            Added {formatDate(application.dateAdded)} · Updated{' '}
            {formatDate(application.dateStageChanged)}
            {listing.sourceUrls.length > 0 ? (
              <>
                {' · '}
                <a
                  href={listing.sourceUrls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent-blue underline hover:text-accent-blue/80"
                >
                  View listing
                </a>
              </>
            ) : null}
          </p>

          {/* Description — collapsible to keep the modal compact */}
          {listing.description ? (
            <details className="group rounded-xl border border-gray-200 bg-canvas">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-ink hover:text-accent-blue">
                Description
              </summary>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap px-3 pb-3 text-sm text-muted">
                {listing.description}
              </p>
            </details>
          ) : null}

          {/* Notes editor */}
          <div>
            <label
              htmlFor="application-notes"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              Notes
            </label>
            <textarea
              id="application-notes"
              value={notesValue}
              onChange={handleNotesChange}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="Add notes about this application…"
              className="min-h-[110px] w-full resize-none rounded-[10px] border border-gray-200 bg-canvas p-3 text-sm text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs">
                {saveError ? (
                  <span className="font-semibold text-accent-red">
                    Failed to save — changes kept locally.
                  </span>
                ) : status === 'loading' ? (
                  <span className="text-muted">Saving…</span>
                ) : null}
              </span>
              <span
                className={`text-xs ${isAtLimit ? 'font-semibold text-accent-red' : 'text-muted'}`}
              >
                {characterCount}/{NOTES_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Stage history — collapsible, recent entries only */}
          {recentHistory.length > 0 ? (
            <details className="group rounded-xl border border-gray-200 bg-canvas">
              <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-sm font-semibold text-ink hover:text-accent-blue">
                <span>Stage history</span>
                <span className="text-xs font-normal text-muted">
                  {stageHistory.length > HISTORY_LIMIT
                    ? `Latest ${HISTORY_LIMIT} of ${stageHistory.length}`
                    : `${stageHistory.length} ${stageHistory.length === 1 ? 'entry' : 'entries'}`}
                </span>
              </summary>
              <ul className="space-y-2 px-3 pb-3">
                {recentHistory.map((entry, index) => (
                  <li
                    key={`${entry.stage}-${entry.changedAt}-${index}`}
                    className="flex items-center gap-3 text-sm"
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
            </details>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** Format a date string to a short human-readable format. */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format a date string to include time for history entries. */
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
