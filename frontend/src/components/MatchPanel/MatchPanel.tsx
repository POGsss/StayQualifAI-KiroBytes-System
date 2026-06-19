import type { JSX } from 'react';
import type { IMatchResult } from '../../types/resume.types';
import { ScoreGauge } from '../ScoreGauge';

/**
 * MatchPanel — purely presentational display of a semantic job-match result.
 *
 * Shows the Match_Score via a reused `ScoreGauge` and two labeled, semantic
 * lists for matched and missing concepts. Each list has an accessible heading
 * and an accessible empty state.
 *
 * No store/service calls and no side effects — all data comes from props.
 */

export interface IMatchPanelProps {
  /** The semantic match result to display. */
  result: IMatchResult;
}

interface ConceptListProps {
  headingId: string;
  title: string;
  concepts: string[];
  emptyMessage: string;
  toneClass: string;
}

function ConceptList({
  headingId,
  title,
  concepts,
  emptyMessage,
  toneClass,
}: ConceptListProps): JSX.Element {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold text-gray-800">
        {title}
        <span className="ml-1.5 font-normal text-gray-500">({concepts.length})</span>
      </h3>
      {concepts.length === 0 ? (
        <p role="status" className="text-sm text-gray-500">
          {emptyMessage}
        </p>
      ) : (
        <ul aria-label={title} className="flex flex-wrap gap-2">
          {concepts.map((concept) => (
            <li
              key={concept}
              className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${toneClass}`}
            >
              {concept}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MatchPanel({ result }: IMatchPanelProps): JSX.Element {
  return (
    <section aria-labelledby="match-panel-heading" className="flex flex-col gap-4">
      <h2 id="match-panel-heading" className="text-lg font-semibold text-gray-900">
        Job match analysis
      </h2>
      <ScoreGauge score={result.score} label="Match score" />
      <div className="grid gap-4 sm:grid-cols-2">
        <ConceptList
          headingId="matched-concepts-heading"
          title="Matched concepts"
          concepts={result.matchedConcepts}
          emptyMessage="No matched concepts yet."
          toneClass="bg-accent-green/30 text-gray-800"
        />
        <ConceptList
          headingId="missing-concepts-heading"
          title="Missing concepts"
          concepts={result.missingConcepts}
          emptyMessage="No missing concepts — strong alignment."
          toneClass="bg-accent-pink/50 text-gray-800"
        />
      </div>
    </section>
  );
}
