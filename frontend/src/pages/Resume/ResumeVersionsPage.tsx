import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX, KeyboardEvent } from 'react';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Panel } from '../../components/Panel';
import { useResumeStore } from '../../stores/resume.store';
import type { IResumeVersion } from '../../types/resume.types';
import { Pencil, Check, X } from 'lucide-react';

/**
 * ResumeVersionsPage — Resume Version Snapshot Manager (Bauhaus redesign).
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
 * - Clicking a (non-active) row activates that version — the whole item is the
 *   activation control; there is no separate "Make active" button.
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
  const deleteVersion = useResumeStore((state) => state.deleteVersion);

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
    <Panel
      aria-label="Resume Versions"
      title="Resume Versions"
    >
      <p className="mb-6 text-sm text-muted">
        Clone, rename, and switch between targeted resume variants.
      </p>

      {error !== null ? (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
        >
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <p role="status" className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          Loading resume versions…
        </p>
      ) : null}

      {!isLoading && versions.length === 0 ? (
        <p role="status" className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
          No resume versions yet. Build or upload a resume to create your first version.
        </p>
      ) : null}

      {versions.length > 0 ? (
        <ul aria-label="Resume versions" className="flex flex-col gap-4">
          {versions.map((version) => {
            const isEditing = editingId === version.id;
            const canSave = draftName.trim().length > 0;
            // The whole row activates the version (its old "Make active"
            // button's behaviour) when it isn't already active or being renamed.
            const activatable = !version.isActive && !isEditing;

            const activate = (): void => {
              if (!activatable || isLoading) {
                return;
              }
              void activateVersion(version.id);
            };

            return (
              <li
                key={version.id}
                {...(activatable
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `Make ${version.name} active`,
                      onClick: activate,
                      onKeyDown: (event: KeyboardEvent<HTMLLIElement>): void => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          activate();
                        }
                      },
                    }
                  : {})}
                className={`rounded-xl border bg-canvas p-5 shadow-sm transition-colors ${
                  version.isActive
                    ? 'border-accent-blue'
                    : activatable
                      ? 'border-gray-200 cursor-pointer hover:border-accent-blue/60 hover:bg-accent-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40'
                      : 'border-gray-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event): void => {
                          void submitRename(event, version.id);
                        }}
                      >
                        <label htmlFor={`rename-${version.id}`} className="sr-only">
                          New name for {version.name}
                        </label>
                        <div className="w-full max-w-sm">
                          <Input
                            id={`rename-${version.id}`}
                            type="text"
                            value={draftName}
                            onChange={onDraftChange}
                            autoFocus
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!canSave || isLoading}
                          aria-label="Save name"
                          className="rounded-md p-2 text-accent-blue hover:bg-accent-blue/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="size-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          disabled={isLoading}
                          aria-label="Cancel rename"
                          className="rounded-md p-2 text-muted hover:bg-gray-200 hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="size-5" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-bold text-ink">
                          {version.name}
                        </h2>
                        <button
                          type="button"
                          onClick={(event): void => {
                            event.stopPropagation();
                            beginRename(version);
                          }}
                          disabled={isLoading}
                          aria-label={`Rename ${version.name}`}
                          className="rounded-md p-1.5 text-muted hover:bg-gray-200 hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        {version.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-accent-blue/10 px-2.5 py-0.5 text-xs font-semibold text-accent-blue">
                            Active
                          </span>
                        ) : null}
                      </div>
                    )}
                    <dl className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
                      <div className="flex gap-1">
                        <dt className="font-medium text-ink">Created</dt>
                        <dd>{formatTimestamp(version.createdAt)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="font-medium text-ink">Updated</dt>
                        <dd>{formatTimestamp(version.updatedAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  {!isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={(event): void => {
                          event.stopPropagation();
                          void cloneVersion(version.id);
                        }}
                        disabled={isLoading}
                        aria-label={`Clone ${version.name}`}
                      >
                        Clone
                      </Button>

                      <Button
                        variant="primary"
                        onClick={(event): void => {
                          event.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete "${version.name}"?`)) {
                            void deleteVersion(version.id);
                          }
                        }}
                        disabled={isLoading}
                        aria-label={`Delete ${version.name}`}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Panel>
  );
}
