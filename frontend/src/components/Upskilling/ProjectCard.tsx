import type { JSX } from 'react';

import type { DifficultyLevel, IProjectSuggestion } from '../../types/upskilling.types';

/**
 * ProjectCard — presentational card for a single role-based project suggestion.
 *
 * Renders the suggestion's title, target role, difficulty, estimated effort,
 * description, and demonstrated-skill chips. A single contextual action button
 * is rendered based on `variant`:
 * - `generated`: a "Save" button (persists the suggestion)
 * - `saved`: a "Delete" button (removes the persisted suggestion)
 *
 * This component is purely presentational — it owns no data-fetching and
 * delegates the action to the parent through `onAction`.
 */

/** Visual variant determining which action the card exposes. */
export type ProjectCardVariant = 'generated' | 'saved';

interface ProjectCardProps {
  suggestion: IProjectSuggestion;
  variant: ProjectCardVariant;
  /** Invoked when the card's action button is pressed. */
  onAction: () => void;
  /** Disables the action button and shows a pending label while in flight. */
  pending?: boolean;
}

/** Difficulty badge accent colors following the design system palette. */
const DIFFICULTY_STYLES: Record<DifficultyLevel, string> = {
  Beginner: 'bg-emerald-100 text-emerald-700',
  Intermediate: 'bg-yellow-100 text-yellow-700',
  Advanced: 'bg-pink-100 text-pink-700',
};

function formatEffort(hours: number): string {
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function ProjectCard({
  suggestion,
  variant,
  onAction,
  pending = false,
}: ProjectCardProps): JSX.Element {
  const isSaved = variant === 'saved';

  return (
    <article className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3">
        {/* Header: title + difficulty badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">{suggestion.title}</h3>
          <span
            className={[
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
              DIFFICULTY_STYLES[suggestion.difficulty],
            ].join(' ')}
          >
            {suggestion.difficulty}
          </span>
        </div>

        {/* Meta: target role + estimated effort */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>
            For <span className="font-medium text-gray-700">{suggestion.targetRole}</span>
          </span>
          <span>{formatEffort(suggestion.estimatedEffortHours)}</span>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-gray-600">{suggestion.description}</p>

        {/* Demonstrated skills */}
        {suggestion.demonstratedSkills.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Demonstrated skills">
            {suggestion.demonstratedSkills.map((skill) => (
              <li
                key={skill}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {skill}
              </li>
            ))}
          </ul>
        )}

        {/* Action */}
        <div className="mt-1 flex items-center">
          {isSaved ? (
            <button
              type="button"
              onClick={onAction}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2
                text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50
                disabled:cursor-not-allowed disabled:opacity-50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:ring-offset-2"
            >
              {pending ? 'Deleting…' : 'Delete'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAction}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2
                text-sm font-medium text-white transition-colors hover:bg-primary/90
                disabled:cursor-not-allowed disabled:opacity-50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                focus-visible:ring-offset-2"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
