import type { JSX } from 'react';

import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { JobSearchTab } from '../../stores/jobsearch.store';
import { TrackerTab } from './TrackerTab';
import { AiWriterTab } from './AiWriterTab';
import { ListingsTab } from './ListingsTab';

/**
 * JobSearchPage — root layout for the Job Search module.
 *
 * The feature navigation (Listings / Tracker / AI Writer) now lives in the
 * global top bar (see `App.tsx`), which reads and writes the active tab through
 * the shared Zustand store. This page simply renders the content for whichever
 * tab is currently active. Defaults to the Listings tab on load.
 */
export function JobSearchPage(): JSX.Element {
  const activeTab = useJobSearchStore((s) => s.activeTab);

  return (
    <section className="flex flex-col gap-6">{renderTabContent(activeTab)}</section>
  );
}

/** Renders the appropriate content for the given tab. */
function renderTabContent(tabId: JobSearchTab): JSX.Element {
  switch (tabId) {
    case 'listings':
      return <ListingsTab />;
    case 'tracker':
      return <TrackerTab />;
    case 'ai-writer':
      return <AiWriterTab />;
  }
}
