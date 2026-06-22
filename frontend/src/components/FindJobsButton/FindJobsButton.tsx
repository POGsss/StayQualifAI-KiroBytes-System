import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, DragEvent, ChangeEvent } from 'react';

import { JobSearchApiError, scrapeJobs } from '../../services/jobsearch.service';
import { useResumeStore } from '../../stores/resume.store';
import { Button } from '../Button';

export interface FindJobsButtonProps {
  hasResume: boolean;
  onScrapeComplete: () => void;
}

interface Notification {
  type: 'success' | 'error' | 'cooldown';
  message: string;
}

/**
 * FindJobsButton — triggers a resume-matched job scrape.
 *
 * When clicked:
 * - If a resume already exists: opens a modal confirming "Use existing resume?"
 *   with option to upload a new one.
 * - If no resume: opens a modal with file upload (drag & drop or click).
 *
 * After the resume is confirmed/uploaded, triggers the scrape automatically.
 */
export function FindJobsButton({ hasResume, onScrapeComplete }: FindJobsButtonProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [forceUploadMode, setForceUploadMode] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uploadResume = useResumeStore((s) => s.uploadResume);
  const createVersion = useResumeStore((s) => s.createVersion);
  const activateVersion = useResumeStore((s) => s.activateVersion);
  const activeVersion = useResumeStore((s) => s.activeVersion);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const showNotification = useCallback((notif: Notification): void => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
    }
    setNotification(notif);
    dismissTimerRef.current = setTimeout(() => {
      setNotification(null);
      dismissTimerRef.current = null;
    }, 5000);
  }, []);

  const runScrape = useCallback(async (): Promise<void> => {
    setLoading(true);
    setNotification(null);

    try {
      const summary = await scrapeJobs('Philippines');
      showNotification({
        type: 'success',
        message: `Found ${String(summary.newListings)} new job${summary.newListings === 1 ? '' : 's'}!`,
      });
      onScrapeComplete();
    } catch (err: unknown) {
      if (err instanceof JobSearchApiError && err.status === 429) {
        const details = err.details as { remainingMinutes?: number } | undefined;
        const minutes = details?.remainingMinutes ?? 60;
        showNotification({
          type: 'cooldown',
          message: `Please wait ${String(minutes)} minute${minutes === 1 ? '' : 's'} before searching again.`,
        });
      } else if (
        err instanceof JobSearchApiError &&
        err.status === 400 &&
        err.message.toLowerCase().includes('resume')
      ) {
        // Backend says no resume — force the upload modal open
        setForceUploadMode(true);
        dialogRef.current?.showModal();
      } else {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        showNotification({ type: 'error', message });
      }
    } finally {
      setLoading(false);
    }
  }, [onScrapeComplete, showNotification]);

  const openModal = (): void => {
    setForceUploadMode(false);
    dialogRef.current?.showModal();
  };

  const closeModal = (): void => {
    setForceUploadMode(false);
    dialogRef.current?.close();
  };

  const handleUseExisting = (): void => {
    closeModal();
    void runScrape();
  };

  const handleFileUpload = useCallback(async (file: File): Promise<void> => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!validTypes.includes(file.type)) {
      showNotification({ type: 'error', message: 'Please upload a PDF or DOCX file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showNotification({ type: 'error', message: 'File must be under 5 MB.' });
      return;
    }

    setUploading(true);
    try {
      const content = await uploadResume(file);
      if (content !== null) {
        // Save as a version and activate it so the scraper can find it
        const version = await createVersion(file.name.replace(/\.(pdf|docx)$/i, ''), content);
        if (version !== null) {
          await activateVersion(version.id);
        }
        closeModal();
        // Auto-trigger the scrape after upload
        void runScrape();
      }
    } catch {
      showNotification({ type: 'error', message: 'Failed to upload resume. Please try again.' });
    } finally {
      setUploading(false);
    }
  }, [uploadResume, createVersion, closeModal, runScrape, showNotification]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Notification bar */}
      {notification !== null && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : notification.type === 'cooldown'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Main action button */}
      <Button onClick={openModal} disabled={loading} className="gap-2 self-start">
        {loading && (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            role="status"
            aria-label="Searching for jobs"
          />
        )}
        {loading ? 'Searching…' : 'Resume'}
      </Button>

      {/* Modal dialog */}
      <dialog
        ref={dialogRef}
        className="rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/40
          max-w-md w-full open:animate-[fade-in_150ms_ease-out]"
        aria-labelledby="find-jobs-dialog-title"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2
              id="find-jobs-dialog-title"
              className="text-lg font-semibold text-gray-900"
            >
              Find Jobs
            </h2>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40"
              aria-label="Close dialog"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Resume already exists */}
          {hasResume && activeVersion !== null && !forceUploadMode && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">
                      Resume already uploaded
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      {activeVersion.name}
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleUseExisting} fullWidth>
                Use this resume and find jobs
              </Button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                fullWidth
              >
                Upload a different resume
              </Button>
            </div>
          )}

          {/* No resume — upload flow */}
          {(forceUploadMode || !hasResume || activeVersion === null) && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-600">
                {forceUploadMode
                  ? 'No active resume found. Upload one to find matched jobs.'
                  : 'Upload your resume to find jobs matched to your skills and experience.'}
              </p>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed
                  p-8 transition-colors ${
                    dragOver
                      ? 'border-accent-blue bg-accent-blue/5'
                      : 'border-gray-300 hover:border-accent-blue/50 hover:bg-gray-50'
                  }`}
                role="button"
                tabIndex={0}
                aria-label="Upload resume file"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                {uploading ? (
                  <>
                    <span
                      className="h-8 w-8 animate-spin rounded-full border-3 border-accent-blue/30 border-t-accent-blue"
                      role="status"
                      aria-label="Uploading resume"
                    />
                    <p className="text-sm font-medium text-gray-600">Uploading…</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-blue/10">
                      <svg className="h-6 w-6 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700">
                        Drop your resume here or <span className="text-accent-blue">browse</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        PDF or DOCX, max 5 MB
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
        />
      </dialog>
    </div>
  );
}
