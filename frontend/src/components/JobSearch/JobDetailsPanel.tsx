/**
 * JobDetailsPanel — right-column "Job Detailed Page" for the Job Search
 * recruitment dashboard (Bauhaus redesign).
 *
 * Renders the full detail view for the listing currently selected in the
 * left-column feed: company information, description, requirements, benefits,
 * and salary information, with Save Job / Apply Now actions pinned to the
 * bottom.
 *
 * The listing data model carries a single free-text `description`, so the
 * Requirements and Benefits sections are derived from it via a light heading
 * parser ({@link extractSection}). When a section cannot be found the panel
 * shows an honest muted fallback rather than fabricating content.
 *
 * Named exports only. No `any`.
 */

import type { JSX } from 'react';

import { Button } from '../Button';
import type { IListing, WorkMode } from '../../types/jobsearch.types';

export interface IJobDetailsPanelProps {
  /** The listing to display, or null when nothing is selected. */
  listing: IListing | null;
  /** Whether the listing has already been saved to the tracker. */
  isSaved: boolean;
  /** True while a save request is in flight. */
  isSaving: boolean;
  /** Save the listing to the application tracker. */
  onSave: (listing: IListing) => void;
}

const WORK_MODE_STYLES: Record<WorkMode, string> = {
  Remote: 'bg-accent-blue/10 text-accent-blue',
  Hybrid: 'bg-accent-yellow/20 text-ink',
  Onsite: 'bg-accent-red/10 text-accent-red',
};

/** Format a peso salary range, or null when no bounds are known. */
function formatSalary(min: number | null, max: number | null): string | null {
  if (min === null && max === null) {
    return null;
  }
  const fmt = (n: number): string =>
    n >= 1000 ? `₱${String(Math.round(n / 1000))}k` : `₱${String(n)}`;
  if (min !== null && max !== null) {
    return `${fmt(min)} – ${fmt(max)} / month`;
  }
  if (min !== null) {
    return `From ${fmt(min)} / month`;
  }
  return `Up to ${fmt(max as number)} / month`;
}

/**
 * Pull a labelled section ("requirements", "benefits", …) out of a free-text
 * description by scanning for a heading line. Returns the lines that follow the
 * heading until the next blank line / heading, or null when not present.
 */
function extractSection(description: string, heading: string): string | null {
  const lines = description.split(/\r?\n/);
  const headingRe = new RegExp(`^\\s*${heading}\\b\\s*:?\\s*$`, 'i');
  const startIdx = lines.findIndex((line) => headingRe.test(line));
  if (startIdx === -1) {
    return null;
  }
  const collected: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    // Stop at the next blank line that precedes another heading-like line.
    if (line.trim().length === 0 && collected.length > 0) {
      break;
    }
    if (line.trim().length > 0) {
      collected.push(line.trim());
    }
  }
  return collected.length > 0 ? collected.join('\n') : null;
}

/** A titled block within the detail panel. */
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Render a section body: bullet list when multi-line, paragraph otherwise. */
function SectionBody({ text }: { text: string | null }): JSX.Element {
  if (text === null || text.trim().length === 0) {
    return <p className="text-sm text-muted">Not specified in this posting.</p>;
  }
  const items = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0);

  if (items.length > 1) {
    return (
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink/80">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{text}</p>;
}

export function JobDetailsPanel({
  listing,
  isSaved,
  isSaving,
  onSave,
}: IJobDetailsPanelProps): JSX.Element {
  if (listing === null) {
    return (
      <section
        aria-label="Job details"
        className="flex min-h-[16rem] items-center justify-center self-start rounded-2xl bg-surface p-8 shadow-panel"
      >
        <p className="max-w-xs text-center text-sm text-muted">
          Select a job from the list to view the full details here.
        </p>
      </section>
    );
  }

  const salary = formatSalary(listing.salaryMin, listing.salaryMax);
  const applyUrl = listing.sourceUrls.length > 0 ? listing.sourceUrls[0] : null;
  const requirements = extractSection(listing.description, 'requirements');
  const benefits =
    extractSection(listing.description, 'benefits') ??
    extractSection(listing.description, 'perks');

  return (
    <section
      aria-label="Job details"
      className="flex flex-col self-start rounded-2xl bg-surface p-6 shadow-panel"
    >
      <div className="flex flex-1 flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-gray-100 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-2xl font-bold text-ink">{listing.title}</h2>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${WORK_MODE_STYLES[listing.workMode]}`}
            >
              {listing.workMode}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="font-semibold text-ink">{listing.company}</span>
            <span>{listing.location}</span>
            {salary !== null && (
              <span className="font-medium text-accent-blue">{salary}</span>
            )}
          </div>
        </header>

        {/* Company Information */}
        <DetailSection title="Company Information">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <dt className="text-muted">Company</dt>
              <dd className="font-medium text-ink">{listing.company}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <dt className="text-muted">Location</dt>
              <dd className="font-medium text-ink">{listing.location}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <dt className="text-muted">Work Mode</dt>
              <dd className="font-medium text-ink">{listing.workMode}</dd>
            </div>
          </dl>
        </DetailSection>

        {/* Description */}
        <DetailSection title="Description">
          <SectionBody text={listing.description} />
        </DetailSection>

        {/* Requirements */}
        <DetailSection title="Requirements">
          <SectionBody text={requirements} />
        </DetailSection>

        {/* Benefits */}
        <DetailSection title="Benefits">
          <SectionBody text={benefits} />
        </DetailSection>

        {/* Salary Information */}
        <DetailSection title="Salary Information">
          <p className="text-sm text-ink/80">
            {salary ?? 'Salary not disclosed for this listing.'}
          </p>
        </DetailSection>
      </div>

      {/* Bottom actions */}
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
        <Button
          variant="outline"
          onClick={(): void => onSave(listing)}
          disabled={isSaved || isSaving}
        >
          {isSaved ? 'Saved' : isSaving ? 'Saving…' : 'Save Job'}
        </Button>
        {applyUrl !== null ? (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-bauhaus-ink px-5 text-sm font-medium text-white transition-colors hover:bg-bauhaus-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2"
          >
            Apply Now
          </a>
        ) : (
          <Button disabled>Apply Now</Button>
        )}
      </div>
    </section>
  );
}
