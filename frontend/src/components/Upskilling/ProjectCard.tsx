import { useState } from 'react';
import type { JSX } from 'react';

import type { DifficultyLevel, IProjectSuggestion } from '../../types/upskilling.types';

/**
 * ProjectCard — presentational card for a single role-based project suggestion
 * (Bauhaus redesign, see docs/GLOBAL_REDESIGN.md §4).
 *
 * Renders the suggestion's title, difficulty, estimated completion time,
 * description, and "skills learned" chips. Two actions are exposed:
 * - "View Project": expands the card to reveal the full description and the
 *   complete skill set (no detail route exists yet, so this is an inline
 *   disclosure).
 * - A contextual primary action driven by `variant`:
 *   - `generated`: "Save Project" (persists the suggestion)
 *   - `saved`: "Remove" (deletes the persisted suggestion)
 *
 * Purely presentational — owns no data-fetching and delegates the primary
 * action to the parent through `onAction`.
 */

/** Visual variant determining which primary action the card exposes. */
export type ProjectCardVariant = 'generated' | 'saved';

interface ProjectCardProps {
  suggestion: IProjectSuggestion;
  variant: ProjectCardVariant;
  /** Invoked when the card's primary action button is pressed. */
  onAction: () => void;
  /** Disables the primary action and shows a pending label while in flight. */
  pending?: boolean;
}

/** Difficulty badge accent colors following the Bauhaus palette. */
const DIFFICULTY_STYLES: Record<DifficultyLevel, string> = {
  Beginner: 'bg-accent-blue/10 text-accent-blue',
  Intermediate: 'bg-accent-yellow/20 text-ink',
  Advanced: 'bg-accent-red/10 text-accent-red',
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
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-6 shadow-card">
      {/* Header: title + difficulty badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-snug text-ink">{suggestion.title}</h3>
        <span
          className={[
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
            DIFFICULTY_STYLES[suggestion.difficulty],
          ].join(' ')}
        >
          {suggestion.difficulty}
        </span>
      </div>

      {/* Meta: target role + estimated completion time */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          For <span className="font-semibold text-ink">{suggestion.targetRole}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 1 0 1.06-1.06L10.75 9.69V5Z"
              clipRule="evenodd"
            />
          </svg>
          {formatEffort(suggestion.estimatedEffortHours)}
        </span>
      </div>

      {/* Description (clamped until expanded via "View Project") */}
      <p
        className={[
          'text-sm leading-relaxed text-muted',
          expanded ? '' : 'line-clamp-3',
        ].join(' ')}
      >
        {suggestion.description}
      </p>

      {/* Skills learned */}
      {suggestion.demonstratedSkills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Skills learned
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Skills learned">
            {(expanded
              ? suggestion.demonstratedSkills
              : suggestion.demonstratedSkills.slice(0, 4)
            ).map((skill) => (
              <li
                key={skill}
                className="rounded-full bg-accent-blue/10 px-3 py-1 text-xs font-medium text-accent-blue"
              >
                {skill}
              </li>
            ))}
            {!expanded && suggestion.demonstratedSkills.length > 4 && (
              <li className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted">
                +{suggestion.demonstratedSkills.length - 4}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Actions pinned to the bottom of the card */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onAction}
          disabled={pending}
          className={[
            'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
            isSaved
              ? 'border border-accent-red/30 text-accent-red hover:bg-accent-red/10'
              : 'bg-primary text-white hover:bg-primary-600',
          ].join(' ')}
        >
          {isSaved
            ? pending
              ? 'Removing…'
              : 'Remove'
            : pending
              ? 'Saving…'
              : 'Save Project'}
        </button>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2
            text-sm font-medium text-ink transition-colors hover:bg-canvas
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50
            focus-visible:ring-offset-2"
        >
          {expanded ? 'Hide details' : 'View Project'}
        </button>
      </div>
    </article>
  );
}
