import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { SkeletonList } from '../../components/Skeleton';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  ICreateStarInput,
  IStarStory,
  IUpdateStarInput,
} from '../../types/interview.types';

/**
 * StarOrganizerPage — the STAR Story Organizer tab of the Interview module.
 *
 * A STAR-framework scratchpad where the authenticated user composes, lists,
 * views, edits, and deletes structured stories (Situation, Task, Action,
 * Result). All data flows through the interview Zustand store
 * (`useInterviewStore`); this page never calls the service or the Supabase
 * client directly.
 *
 * Layout: two clearly separated white panels on a `#f7f7f8` canvas —
 *   Section 1 "Create Story" — the STAR form (title + four STAR fields + submit)
 *   Section 2 "My Stories" — list of saved stories with skeleton/error/empty states
 *
 * Loading: `SkeletonList` (`role="status"`) while `isLoading` is true in the
 * stories section; replaced by content on success or the store's error on
 * failure (prior stories preserved); explicit "no stories yet" empty state.
 *
 * Validates: Requirements 13.1, 13.4, 13.5, 13.6, 14.3, 14.4, 14.5
 */

const TITLE_MAX = 200;
const STAR_FIELD_MAX = 2000;

/** The five editable STAR fields shared by the create and edit forms. */
interface IStarFields {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
}

const EMPTY_FIELDS: IStarFields = {
  title: '',
  situation: '',
  task: '',
  action: '',
  result: '',
};

/** Descriptor for each long-form STAR field rendered as a textarea. */
const STAR_TEXTAREAS: ReadonlyArray<{
  key: keyof Omit<IStarFields, 'title'>;
  label: string;
}> = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
];

/** True when every STAR field has non-whitespace content within its limit. */
function fieldsAreValid(fields: IStarFields): boolean {
  const title = fields.title.trim();
  if (title.length < 1 || title.length > TITLE_MAX) {
    return false;
  }
  return STAR_TEXTAREAS.every(({ key }) => {
    const value = fields[key].trim();
    return value.length >= 1 && value.length <= STAR_FIELD_MAX;
  });
}

/** Format an ISO timestamp for display, tolerating invalid input. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export function StarOrganizerPage(): JSX.Element {
  const stories = useInterviewStore((state) => state.stories);
  const isLoading = useInterviewStore((state) => state.isLoading);
  const error = useInterviewStore((state) => state.error);

  const loadStories = useInterviewStore((state) => state.loadStories);
  const createStory = useInterviewStore((state) => state.createStory);
  const updateStory = useInterviewStore((state) => state.updateStory);
  const deleteStory = useInterviewStore((state) => state.deleteStory);

  // Create-form state (controlled inputs).
  const [createFields, setCreateFields] = useState<IStarFields>(EMPTY_FIELDS);

  // Selection + edit state. `selectedId` drives the detail view; `editId` (when
  // non-null) swaps the detail view for an inline editable form.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<IStarFields>(EMPTY_FIELDS);

  // The id pending delete-confirmation (null when no confirm is showing).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Load the user's stories once on mount (Req 8.1).
  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  // Defensive newest-first ordering (the backend already orders this way).
  const orderedStories = useMemo<IStarStory[]>(
    () =>
      [...stories].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [stories],
  );

  const canCreate = !isLoading && fieldsAreValid(createFields);
  const canSaveEdit = !isLoading && fieldsAreValid(editFields);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (!fieldsAreValid(createFields) || isLoading) {
        return;
      }
      const input: ICreateStarInput = {
        title: createFields.title.trim(),
        situation: createFields.situation.trim(),
        task: createFields.task.trim(),
        action: createFields.action.trim(),
        result: createFields.result.trim(),
      };
      const created = await createStory(input);
      if (created !== null) {
        // Clear the form on success (Req 7.1).
        setCreateFields(EMPTY_FIELDS);
      }
    },
    [createFields, createStory, isLoading],
  );

  const beginEdit = useCallback((story: IStarStory): void => {
    setEditId(story.id);
    setSelectedId(story.id);
    setEditFields({
      title: story.title,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
    });
  }, []);

  const cancelEdit = useCallback((): void => {
    setEditId(null);
    setEditFields(EMPTY_FIELDS);
  }, []);

  const handleSaveEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (editId === null || !fieldsAreValid(editFields) || isLoading) {
        return;
      }
      // Send all current field values; the backend mutates only supplied
      // fields, so a full payload preserves unchanged content (Req 9.1).
      const input: IUpdateStarInput = {
        title: editFields.title.trim(),
        situation: editFields.situation.trim(),
        task: editFields.task.trim(),
        action: editFields.action.trim(),
        result: editFields.result.trim(),
      };
      const updated = await updateStory(editId, input);
      if (updated !== null) {
        cancelEdit();
      }
    },
    [cancelEdit, editFields, editId, isLoading, updateStory],
  );

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      const removed = await deleteStory(id);
      if (removed) {
        setPendingDeleteId(null);
        // Clear any selection/edit pointing at the removed story.
        setSelectedId((current) => (current === id ? null : current));
        setEditId((current) => (current === id ? null : current));
      }
    },
    [deleteStory],
  );

  return (
    <div className="min-h-full bg-[#f7f7f8] px-6 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">

        {/* ── Page heading (h1) ── */}
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">
            STAR Story Organizer
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Compose and save structured stories using the Situation, Task, Action,
            Result framework, then reference them during interview preparation.
          </p>
        </header>

        {/* ── Section 1: Create Story ── */}
        <section
          aria-labelledby="create-story-heading"
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2
            id="create-story-heading"
            className="mb-5 text-lg font-semibold text-gray-900"
          >
            New STAR story
          </h2>

          <form
            onSubmit={(event): void => {
              void handleCreate(event);
            }}
            aria-label="Create STAR story"
            className="flex flex-col gap-5"
          >
            {/* Title field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="create-title"
                className="text-sm font-medium text-gray-800"
              >
                Title
              </label>
              <input
                id="create-title"
                type="text"
                maxLength={TITLE_MAX}
                value={createFields.title}
                onChange={(event): void =>
                  setCreateFields((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                disabled={isLoading}
                aria-describedby="create-title-hint"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              <span id="create-title-hint" className="text-xs text-gray-500">
                {createFields.title.trim().length}/{TITLE_MAX} characters
              </span>
            </div>

            {/* S / T / A / R textareas */}
            {STAR_TEXTAREAS.map(({ key, label }) => {
              const fieldId = `create-${key}`;
              const hintId = `${fieldId}-hint`;
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <label
                    htmlFor={fieldId}
                    className="text-sm font-medium text-gray-800"
                  >
                    {label}
                  </label>
                  <textarea
                    id={fieldId}
                    rows={3}
                    maxLength={STAR_FIELD_MAX}
                    value={createFields[key]}
                    onChange={(event): void =>
                      setCreateFields((prev) => ({
                        ...prev,
                        [key]: event.target.value,
                      }))
                    }
                    disabled={isLoading}
                    aria-describedby={hintId}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                  />
                  <span id={hintId} className="text-xs text-gray-500">
                    {createFields[key].trim().length}/{STAR_FIELD_MAX} characters
                  </span>
                </div>
              );
            })}

            <button
              type="submit"
              disabled={!canCreate}
              className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Working…' : 'Save story'}
            </button>
          </form>
        </section>

        {/* ── Section 2: My Stories ── */}
        <section
          aria-labelledby="my-stories-heading"
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <h2
            id="my-stories-heading"
            className="mb-5 text-lg font-semibold text-gray-900"
          >
            Your stories
          </h2>

          {/* Error — role="alert", preserves prior stories below */}
          {error !== null ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error.message}
            </p>
          ) : null}

          {/* Loading skeleton (Req 14.3) — shown while isLoading is true */}
          {isLoading ? (
            <SkeletonList
              rows={3}
              label="Loading your STAR stories"
            />
          ) : null}

          {/* Empty state — only when not loading and no stories */}
          {!isLoading && orderedStories.length === 0 ? (
            <p
              role="status"
              className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500"
            >
              No STAR stories yet. Use the form above to create your first STAR story.
            </p>
          ) : null}

          {/* Stories list — rendered whenever stories exist (Req 14.5).
              Not gated by !isLoading so prior content stays visible during
              subsequent refreshes. */}
          {orderedStories.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {orderedStories.map((story) => {
                const isSelected = story.id === selectedId;
                return (
                  <li
                    key={story.id}
                    className={`rounded-xl border px-4 py-3 ${
                      isSelected
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-medium text-gray-900">{story.title}</p>
                        <p className="text-xs text-gray-500">
                          Created {formatTimestamp(story.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(): void =>
                            setSelectedId((current) =>
                              current === story.id ? null : story.id,
                            )
                          }
                          aria-expanded={isSelected}
                          className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {isSelected ? 'Hide' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={(): void => beginEdit(story)}
                          disabled={isLoading}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {pendingDeleteId === story.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Delete?</span>
                            <button
                              type="button"
                              onClick={(): void => {
                                void handleDelete(story.id);
                              }}
                              disabled={isLoading}
                              className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={(): void => setPendingDeleteId(null)}
                              disabled={isLoading}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(): void => setPendingDeleteId(story.id)}
                            disabled={isLoading}
                            aria-label={`Delete story ${story.title}`}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline edit form (Req 9.1) */}
                    {editId === story.id ? (
                      <StarEditForm
                        fields={editFields}
                        onChange={setEditFields}
                        onSubmit={handleSaveEdit}
                        onCancel={cancelEdit}
                        canSave={canSaveEdit}
                        isLoading={isLoading}
                      />
                    ) : isSelected ? (
                      /* Read-only detail view (Req 8.2) */
                      <StarDetail story={story} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

      </div>
    </div>
  );
}

// ─── StarDetail ───────────────────────────────────────────────────────────────

/** Read-only detail of a STAR story's four narrative fields (Req 8.2). */
function StarDetail({ story }: { story: IStarStory }): JSX.Element {
  return (
    <dl className="mt-3 flex flex-col gap-3 border-t border-gray-200 pt-3 text-sm">
      {STAR_TEXTAREAS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
          </dt>
          <dd className="whitespace-pre-wrap text-gray-800">{story[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── StarEditForm ─────────────────────────────────────────────────────────────

/** Inline editable form for an existing STAR story (Req 9.1). */
function StarEditForm({
  fields,
  onChange,
  onSubmit,
  onCancel,
  canSave,
  isLoading,
}: {
  fields: IStarFields;
  onChange: (updater: (prev: IStarFields) => IStarFields) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  canSave: boolean;
  isLoading: boolean;
}): JSX.Element {
  return (
    <form
      onSubmit={onSubmit}
      aria-label="Edit STAR story"
      className="mt-3 flex flex-col gap-4 border-t border-gray-200 pt-4"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="edit-title"
          className="text-sm font-medium text-gray-800"
        >
          Title
        </label>
        <input
          id="edit-title"
          type="text"
          maxLength={TITLE_MAX}
          value={fields.title}
          onChange={(event): void =>
            onChange((prev) => ({ ...prev, title: event.target.value }))
          }
          disabled={isLoading}
          aria-describedby="edit-title-hint"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <span id="edit-title-hint" className="text-xs text-gray-500">
          {fields.title.trim().length}/{TITLE_MAX} characters
        </span>
      </div>

      {STAR_TEXTAREAS.map(({ key, label }) => {
        const fieldId = `edit-${key}`;
        const hintId = `${fieldId}-hint`;
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label
              htmlFor={fieldId}
              className="text-sm font-medium text-gray-800"
            >
              {label}
            </label>
            <textarea
              id={fieldId}
              rows={3}
              maxLength={STAR_FIELD_MAX}
              value={fields[key]}
              onChange={(event): void =>
                onChange((prev) => ({ ...prev, [key]: event.target.value }))
              }
              disabled={isLoading}
              aria-describedby={hintId}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <span id={hintId} className="text-xs text-gray-500">
              {fields[key].trim().length}/{STAR_FIELD_MAX} characters
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
