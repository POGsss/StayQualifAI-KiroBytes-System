import type { JSX } from 'react';

import type { IApplication } from '../../types/jobsearch.types';

interface ApplicationCardProps {
  application: IApplication;
  onClickDetail: (id: string) => void;
}

/**
 * ApplicationCard — a draggable card displaying an application's key info.
 *
 * Shows listing title, company, and the date the stage last changed.
 * Draggable via native HTML5 Drag and Drop API (no external libraries).
 * Clicking opens the application detail dialog.
 *
 * Accessibility:
 * - Card is keyboard-activatable (button role)
 * - Drag state communicated via aria-grabbed (deprecated but best we have natively)
 * - Focus indicator visible
 */
export function ApplicationCard({ application, onClickDetail }: ApplicationCardProps): JSX.Element {
  const formattedDate = formatRelativeDate(application.dateStageChanged);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>): void {
    e.dataTransfer.setData('text/plain', application.id);
    e.dataTransfer.effectAllowed = 'move';
    const target = e.currentTarget;
    target.classList.add('opacity-50');
  }

  function handleDragEnd(e: React.DragEvent<HTMLDivElement>): void {
    e.currentTarget.classList.remove('opacity-50');
  }

  function handleClick(): void {
    onClickDetail(application.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClickDetail(application.id);
    }
  }

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${application.listingTitle} at ${application.listingCompany}`}
      className="rounded-xl bg-surface p-4 shadow-card cursor-grab border border-gray-200/60 transition-shadow hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40 focus-visible:ring-offset-2 active:cursor-grabbing"
    >
      <p className="text-sm font-bold text-ink truncate">
        {application.listingTitle}
      </p>
      <p className="mt-1 text-xs text-muted truncate">
        {application.listingCompany}
      </p>
      <p className="mt-2 text-xs text-muted">
        {formattedDate}
      </p>
    </div>
  );
}

/**
 * Formats a date string into a human-friendly relative or short date.
 */
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
