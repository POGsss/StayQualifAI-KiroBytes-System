import { useCallback, useState } from 'react';
import type { JSX } from 'react';

import type { IApplication, Stage } from '../../types/jobsearch.types';
import { ApplicationCard } from './ApplicationCard';

interface KanbanColumnProps {
  stage: Stage;
  applications: IApplication[];
  onDrop: (applicationId: string, targetStage: Stage) => void;
  onClickDetail: (id: string) => void;
}

/**
 * KanbanColumn — a single stage column in the Kanban tracker board.
 *
 * Displays a header with the stage name and application count, acts as a
 * drop zone for dragged ApplicationCards, and lists cards ordered by
 * dateStageChanged descending.
 *
 * Uses native HTML5 Drag and Drop — no third-party libraries.
 *
 * Accessibility:
 * - Column uses aria-label describing its purpose
 * - Drop zone provides visual feedback during drag-over
 */
export function KanbanColumn({
  stage,
  applications,
  onDrop,
  onClickDetail,
}: KanbanColumnProps): JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only set false if leaving the column itself, not its children
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const applicationId = e.dataTransfer.getData('text/plain');
      if (applicationId) {
        onDrop(applicationId, stage);
      }
    },
    [onDrop, stage],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={`${stage} column, ${applications.length} applications`}
      className={[
        'flex flex-col gap-3 rounded-2xl p-4 min-h-[400px] flex-1 min-w-[260px] lg:min-w-0 border transition-colors',
        isDragOver
          ? 'bg-accent-blue/5 border-accent-blue/30 border-dashed border-2'
          : 'bg-canvas border-gray-200/60 shadow-sm',
      ].join(' ')}
    >
      {/* Column header */}
      <div className="text-sm font-bold text-ink flex items-center justify-between">
        <span>{stage}</span>
        <span className="rounded-full bg-accent-blue/10 text-accent-blue px-2.5 py-0.5 text-xs font-semibold">
          {applications.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex flex-col gap-2 flex-1">
        {applications.map((app) => (
          <ApplicationCard
            key={app.id}
            application={app}
            onClickDetail={onClickDetail}
          />
        ))}
      </div>
    </div>
  );
}
