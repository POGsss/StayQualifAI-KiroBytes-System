import type { JSX } from 'react';
import type { IKeywordSuggestion } from '../../types/resume.types';

/**
 * KeywordList — purely presentational list of keyword suggestions.
 *
 * Renders a semantic `<ul>`/`<li>` list showing each suggested term and the
 * reason it is recommended. When there are no suggestions, an accessible empty
 * state is shown instead.
 *
 * No store/service calls and no side effects — all data comes from props.
 */

export interface IKeywordListProps {
  /** Keyword suggestions to display. May be empty. */
  suggestions: IKeywordSuggestion[];
  /** Optional label for the list, used as its accessible name. */
  label?: string;
}

export function KeywordList({ suggestions, label }: IKeywordListProps): JSX.Element {
  const accessibleLabel = label ?? 'Keyword suggestions';

  if (suggestions.length === 0) {
    return (
      <p role="status" className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
        No keyword suggestions — your resume already covers the relevant terms.
      </p>
    );
  }

  return (
    <ul aria-label={accessibleLabel} className="flex flex-col gap-2">
      {suggestions.map((suggestion) => (
        <li
          key={suggestion.term}
          className="rounded-md border border-gray-200 bg-white px-4 py-3"
        >
          <span className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-sm font-semibold text-primary-700">
            {suggestion.term}
          </span>
          <p className="mt-1 text-sm text-gray-600">{suggestion.reason}</p>
        </li>
      ))}
    </ul>
  );
}
