import type { JSX } from 'react';

import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { JobSearchTab } from '../../stores/jobsearch.store';
import { TrackerTab } from './TrackerTab';
import { AiWriterTab } from './AiWriterTab';
import { ListingsTab } from './ListingsTab';

/**
 * JobSearchPage — root layout for the Job Search module.
 *
 * Renders a three-tab navigation bar (Listings, Tracker, AI Writer) driven by
 * Zustand store state. The active tab is highlighted with a bottom border in
 * primary purple. Tab content switches without page reload. Defaults to the
 * Listings tab on load.
 *
 * Accessibility:
 * - Tab bar uses `role="tablist"` with individual `role="tab"` buttons
 * - Active tab indicated by `aria-selected="true"`
 * - Tab panels use `role="tabpanel"` with `aria-labelledby`
 * - All tabs keyboard-navigable with visible focus indicators
 */

interface TabDefinition {
  id: JobSearchTab;
  label: string;
}

const TABS: ReadonlyArray<TabDefinition> = [
  { id: 'listings', label: 'Listings' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'ai-writer', label: 'AI Writer' },
];

export function JobSearchPage(): JSX.Element {
  const activeTab = useJobSearchStore((s) => s.activeTab);
  const setActiveTab = useJobSearchStore((s) => s.setActiveTab);

  return (
    <section className="flex flex-col gap-6">
      {/* Tab navigation bar */}
      <nav aria-label="Job Search sections">
        <div role="tablist" className="flex items-center gap-0 border-b border-gray-200">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, tab.id, setActiveTab)}
                className={[
                  'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
                  isActive
                    ? 'text-primary border-primary'
                    : 'text-gray-600 border-transparent hover:text-gray-800',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab panels */}
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {activeTab === tab.id && renderTabContent(tab.id)}
        </div>
      ))}
    </section>
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

/**
 * Handles arrow-key navigation between tabs (WAI-ARIA Tabs pattern).
 * Left/Right arrows move focus between tabs; Home/End jump to first/last.
 */
function handleTabKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentTabId: JobSearchTab,
  setActiveTab: (tab: JobSearchTab) => void,
): void {
  const tabIds = TABS.map((t) => t.id);
  const currentIndex = tabIds.indexOf(currentTabId);

  let nextIndex: number | null = null;

  switch (event.key) {
    case 'ArrowRight':
      nextIndex = (currentIndex + 1) % tabIds.length;
      break;
    case 'ArrowLeft':
      nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabIds.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  const nextTab = tabIds[nextIndex];
  if (!nextTab) return;
  setActiveTab(nextTab);

  // Move focus to the newly activated tab button
  const nextElement = document.getElementById(`tab-${nextTab}`);
  nextElement?.focus();
}
