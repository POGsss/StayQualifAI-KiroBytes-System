import { useCallback, useEffect, useMemo } from 'react';
import type { JSX } from 'react';

import { ApplicationDetailDialog } from '../../components/JobSearch/ApplicationDetailDialog';
import { KanbanColumn } from '../../components/JobSearch/KanbanColumn';
import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { IApplication, Stage } from '../../types/jobsearch.types';

/**
 * The five Kanban stages in display order.
 */
const STAGES: ReadonlyArray<Stage> = [
  'Wishlist',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
];

/**
 * TrackerTab — Kanban board view for the application tracker.
 *
 * Fetches applications on mount, groups them by stage, and renders five
 * KanbanColumn components in a horizontal flex layout. Cards within each
 * column are sorted by dateStageChanged descending (most recent first).
 *
 * Drag-and-drop uses native HTML5 DnD. Stage updates are optimistic —
 * the card moves immediately, then reverts if the API call fails.
 */
export function TrackerTab(): JSX.Element {
  const fetchApplications = useJobSearchStore((s) => s.fetchApplications);
  const applications = useJobSearchStore((s) => s.applications);
  const updateStage = useJobSearchStore((s) => s.updateStage);
  const fetchApplicationDetail = useJobSearchStore((s) => s.fetchApplicationDetail);
  const status = useJobSearchStore((s) => s.status);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  /**
   * Group applications by stage and sort each group by dateStageChanged DESC.
   */
  const columnData = useMemo(() => {
    const grouped: Record<Stage, IApplication[]> = {
      Wishlist: [],
      Applied: [],
      Interviewing: [],
      Offer: [],
      Rejected: [],
    };

    for (const app of applications) {
      if (grouped[app.stage]) {
        grouped[app.stage].push(app);
      }
    }

    // Sort each column by dateStageChanged descending
    for (const stage of STAGES) {
      grouped[stage].sort(
        (a, b) => new Date(b.dateStageChanged).getTime() - new Date(a.dateStageChanged).getTime(),
      );
    }

    return grouped;
  }, [applications]);

  const handleDrop = useCallback(
    (applicationId: string, targetStage: Stage) => {
      // Only update if the stage is actually different
      const app = applications.find((a) => a.id === applicationId);
      if (!app || app.stage === targetStage) return;

      void updateStage(applicationId, targetStage);
    },
    [applications, updateStage],
  );

  const handleClickDetail = useCallback(
    (id: string) => {
      void fetchApplicationDetail(id);
    },
    [fetchApplicationDetail],
  );

  if (status === 'loading' && applications.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">Loading applications…</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            applications={columnData[stage]}
            onDrop={handleDrop}
            onClickDetail={handleClickDetail}
          />
        ))}
      </div>
      <ApplicationDetailDialog />
    </>
  );
}
