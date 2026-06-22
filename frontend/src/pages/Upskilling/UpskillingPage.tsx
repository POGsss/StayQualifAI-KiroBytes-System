import type { JSX } from 'react';

import { useUpskillingStore } from '../../stores/upskilling.store';
import type { UpskillingTab } from '../../stores/upskilling.store';
import { ProjectsTab } from './ProjectsTab';
import { RoadmapTab } from './RoadmapTab';
import { CoursesTab } from './CoursesTab';

/**
 * UpskillingPage — root layout for the Upskilling module (Career Roadmap &
 * Learning Engine).
 *
 * The feature navigation (Projects / Roadmap / Courses) now lives in the global
 * top bar (see `App.tsx`), which reads and writes the active tab through the
 * shared Zustand store. This page simply renders the content for whichever tab
 * is currently active. Defaults to the Projects tab on load.
 */
export function UpskillingPage(): JSX.Element {
  const activeTab = useUpskillingStore((s) => s.activeTab);

  return (
    <section className="flex flex-col gap-6">{renderTabContent(activeTab)}</section>
  );
}

/** Renders the appropriate content for the given tab. */
function renderTabContent(tabId: UpskillingTab): JSX.Element {
  switch (tabId) {
    case 'Projects':
      return <ProjectsTab />;
    case 'Roadmap':
      return <RoadmapTab />;
    case 'Courses':
      return <CoursesTab />;
  }
}
