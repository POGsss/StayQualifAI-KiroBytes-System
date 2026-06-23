import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Panel } from '../../components/Panel';
import { SkeletonList } from '../../components/Skeleton';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  ICreateStarInput,
  IStarStory,
  IUpdateStarInput,
} from '../../types/interview.types';

/**
 * StarOrganizerPage — the STAR Story Organizer tab of the Interview module (Bauhaus redesign).
 *
 * A STAR-framework scratchpad where the authenticated user composes, lists,
 * views, edits, and deletes structured stories (Situation, Task, Action,
 * Result). All data flows through the interview Zustand store
 * (`useInterviewStore`); this page never calls the service or the Supabase
 * client directly.
 *
 * Layout: two-column responsive grid matching other Bauhaus modules:
 *   Left (2/5): Create form wrapped in a Panel card.
 *   Right (3/5): List of saved stories wrapped in a Panel card.
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

const TEXTAREA_CLASS =
  'w-full rounded-[10px] border border-gray-200 bg-canvas px-4 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/40 disabled:cursor-not-allowed disabled:opacity-50';

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
    <div className="grid gap-6 lg:grid-cols-[2fr_3fr] items-start">
      {/* Column 1: Create Story */}
      <Panel
        aria-label="New STAR story"
        title="New STAR story"
      >
        <form
          onSubmit={(event): void => {
            void handleCreate(event);
          }}
          aria-label="Create STAR story"
          className="flex flex-col gap-4"
        >
          {/* Title field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="create-title"
              className="text-sm font-semibold text-muted"
            >
              Title
            </label>
            <Input
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
            />
            <span id="create-title-hint" className="text-xs text-muted">
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
                  className="text-sm font-semibold text-muted"
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
                  className={TEXTAREA_CLASS}
                />
                <span id={hintId} className="text-xs text-muted">
                  {createFields[key].trim().length}/{STAR_FIELD_MAX} characters
                </span>
              </div>
            );
          })}

          <Button
            type="submit"
            disabled={!canCreate}
            className="self-start"
          >
            {isLoading ? 'Working…' : 'Save story'}
          </Button>
        </form>
      </Panel>

      {/* Column 2: My Stories */}
      <Panel
        aria-label="Your stories"
        title="Your stories"
      >
        {/* Error — role="alert", preserves prior stories below */}
        {error !== null ? (
          <p
            role="alert"
            className="mb-4 rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
          >
            {error.message}
          </p>
        ) : null}

        {/* Loading skeleton — shown while isLoading is true */}
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
            className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted"
          >
            No STAR stories yet. Use the form above to create your first STAR story.
          </p>
        ) : null}

        {/* Stories list — rendered whenever stories exist */}
        {orderedStories.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {orderedStories.map((story) => {
              const isSelected = story.id === selectedId;
              return (
                <li
                  key={story.id}
                  className={`rounded-xl border p-5 shadow-sm transition-colors ${
                    isSelected
                      ? 'border-accent-blue/40 bg-accent-blue/5'
                      : 'border-gray-200 bg-canvas'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <p className="font-bold text-ink truncate">{story.title}</p>
                      <p className="text-xs text-muted">
                        Created {formatTimestamp(story.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={isSelected ? 'primary' : 'outline'}
                        onClick={(): void =>
                          setSelectedId((current) =>
                            current === story.id ? null : story.id,
                          )
                        }
                        aria-expanded={isSelected}
                      >
                        {isSelected ? 'Hide' : 'View'}
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={(): void => beginEdit(story)}
                        disabled={isLoading}
                      >
                        Edit
                      </Button>
                      {pendingDeleteId === story.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-accent-red">Delete?</span>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={(): void => {
                              void handleDelete(story.id);
                            }}
                            disabled={isLoading}
                            className="bg-accent-red text-white hover:bg-accent-red/90"
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={(): void => setPendingDeleteId(null)}
                            disabled={isLoading}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={(): void => setPendingDeleteId(story.id)}
                          disabled={isLoading}
                          aria-label={`Delete story ${story.title}`}
                          className="text-accent-red hover:bg-accent-red/10 border-none"
                        >
                          Delete
                        </Button>
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
      </Panel>
    </div>
  );
}

// ─── StarDetail ───────────────────────────────────────────────────────────────

/** Read-only detail of a STAR story's four narrative fields (Req 8.2). */
function StarDetail({ story }: { story: IStarStory }): JSX.Element {
  return (
    <dl className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-3 text-sm">
      {STAR_TEXTAREAS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className="text-xs font-bold uppercase tracking-wider text-muted">
            {label}
          </dt>
          <dd className="whitespace-pre-wrap text-ink">{story[key]}</dd>
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
      className="mt-4 flex flex-col gap-4 border-t border-gray-200 pt-4"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="edit-title"
          className="text-sm font-semibold text-muted"
        >
          Title
        </label>
        <Input
          id="edit-title"
          type="text"
          maxLength={TITLE_MAX}
          value={fields.title}
          onChange={(event): void =>
            onChange((prev) => ({ ...prev, title: event.target.value }))
          }
          disabled={isLoading}
          aria-describedby="edit-title-hint"
        />
        <span id="edit-title-hint" className="text-xs text-muted">
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
              className="text-sm font-semibold text-muted"
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
              className={TEXTAREA_CLASS}
            />
            <span id={hintId} className="text-xs text-muted">
              {fields[key].trim().length}/{STAR_FIELD_MAX} characters
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={!canSave}
        >
          {isLoading ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="subtle"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
