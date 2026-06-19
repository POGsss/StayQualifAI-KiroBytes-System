import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX } from 'react';

import { useResumeStore } from '../../stores/resume.store';
import type { IResumeVersion } from '../../types/resume.types';

/**
 * ResumeVersionsPage — Resume Version Snapshot Manager.
 *
 * Lists the authenticated user's resume versions and lets them clone, rename,
 * and switch (activate) between them. All data and mutations flow through the
 * Resume Zustand store (`useResumeStore`); this page never calls services or
 * the API directly.
 *
 * Behaviour:
 * - On mount, loads the version list (single `useEffect`).
 * - Each version shows its name, created/updated timestamps, and an "Active"
 *   indicator for the single active version (single-active invariant, Req 10.2).
 * - "Make active" activates a version (hidden for the already-active one).
 * - "Clone" clones a version into a new variant (Req 8.1).
 * - "Rename" toggles an inline controlled text input; saving calls the store
 *   (Req 9.1). Saving is disabled while the trimmed input is blank.
 *
 * Requirements: 8.1, 9.1, 10.1, 10.2.
 */

/** Format an ISO timestamp for display, tolerating invalid input. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function ResumeVersionsPage(): JSX.Element {
  const versions = useResumeStore((state) => state.versions);
  const status = useResumeStore((state) => state.status);
  const error = useResumeStore((state) => state.error);
  const loadVersions = useResumeStore((state) => state.loadVersions);
  const cloneVersion = useResumeStore((state) => state.cloneVersion);
  const renameVersion = useResumeStore((state) => state.renameVersion);
  const activateVersion = useResumeStore((state) => state.activateVersion);

  // Id of the version currently in inline-rename mode, plus its draft name.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const isLoading = status === 'loading';

  function beginRename(version: IResumeVersion): void {
    setEditingId(version.id);
    setDraftName(version.name);
  }

  function cancelRename(): void {
    setEditingId(null);
    setDraftName('');
  }

  function onDraftChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraftName(event.target.value);
  }

  async function submitRename(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      return;
    }
    const renamed = await renameVersion(id, trimmed);
    if (renamed !== null) {
      cancelRename();
    }
  }

  return (
    <section aria-labelledby="versions-heading">
      <header className="mb-6">
        <h1 id="versions-heading" className="text-2xl font-semibold text-primary">
          Resume Versions
        </h1>
        <p className="mt-2 text-gray-600">
          Clone, rename, and switch between targeted resume variants.
        </p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <p role="status" className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Loading resume versions…
        </p>
      ) : null}

      {!isLoading && versions.length === 0 ? (
        <p role="status" className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
          No resume versions yet. Build or upload a resume to create your first version.
        </p>
      ) : null}

      {versions.length > 0 ? (
        <ul aria-label="Resume versions" className="flex flex-col gap-3">
          {versions.map((version) => {
            const isEditing = editingId === version.id;
            const canSave = draftName.trim().length > 0;

            return (
              <li
                key={version.id}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {isEditing ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(event): void => {
                          void submitRename(event, version.id);
                        }}
                      >
                        <label htmlFor={`rename-${version.id}`} className="sr-only">
                          New name for {version.name}
                        </label>
                        <input
                          id={`rename-${version.id}`}
                          type="text"
                          value={draftName}
                          onChange={onDraftChange}
                          autoFocus
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                        />
                        <button
                          type="submit"
                          disabled={!canSave || isLoading}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-medium text-gray-900">
                          {version.name}
                        </h2>
                        {version.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-accent-green px-2.5 py-0.5 text-xs font-semibold text-gray-900">
                            Active
                          </span>
                        ) : null}
                      </div>
                    )}
                    <dl className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                      <div className="flex gap-1">
                        <dt>Created</dt>
                        <dd>{formatTimestamp(version.createdAt)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Updated</dt>
                        <dd>{formatTimestamp(version.updatedAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  {!isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {!version.isActive ? (
                        <button
                          type="button"
                          onClick={(): void => {
                            void activateVersion(version.id);
                          }}
                          disabled={isLoading}
                          aria-label={`Make ${version.name} active`}
                          className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Make active
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(): void => {
                          void cloneVersion(version.id);
                        }}
                        disabled={isLoading}
                        aria-label={`Clone ${version.name}`}
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Clone
                      </button>
                      <button
                        type="button"
                        onClick={(): void => {
                          beginRename(version);
                        }}
                        disabled={isLoading}
                        aria-label={`Rename ${version.name}`}
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Rename
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
