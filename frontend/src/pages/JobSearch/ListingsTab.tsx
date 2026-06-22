import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';

import { FindJobsButton } from '../../components/FindJobsButton';
import { JobDetailsPanel } from '../../components/JobSearch/JobDetailsPanel';
import { JobSearchToolbar } from '../../components/JobSearch/JobSearchToolbar';
import { ListingCard } from '../../components/JobSearch/ListingCard';
import { KpiCard } from '../../components/KpiCard';
import { Panel } from '../../components/Panel';
import { useJobSearchStore } from '../../stores/jobsearch.store';
import { useResumeStore } from '../../stores/resume.store';
import type { IListing, IListingFilters } from '../../types/jobsearch.types';

/**
 * ListingsTab — the Job Search recruitment dashboard (Bauhaus redesign).
 *
 * Layout (see docs/GLOBAL_REDESIGN.md §3):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Search toolbar (Keyword · Job Type · Salary · Search)        │
 *   ├───────────────────────────────┬─────────────────────────────┤
 *   │  KPI cards (Matched · Saved ·  │  Job Details panel           │
 *   │  Applications Sent)            │  - company / description     │
 *   │  ─────────────────────────────│  - requirements / benefits   │
 *   │  Available Jobs (scrollable)   │  - salary                    │
 *   │  - selectable listing cards    │  - Save Job / Apply Now      │
 *   └───────────────────────────────┴─────────────────────────────┘
 *
 * The left column (≈35%) holds the KPI cards and the selectable listing feed;
 * the right column (≈65%) shows the full detail view for the selected listing.
 * KPI values are derived from the live listings meta and the saved-application
 * set, both sourced from the Job Search Zustand store.
 */
export function ListingsTab(): JSX.Element {
  const listings = useJobSearchStore((s) => s.listings);
  const listingsMeta = useJobSearchStore((s) => s.listingsMeta);
  const filters = useJobSearchStore((s) => s.filters);
  const applications = useJobSearchStore((s) => s.applications);
  const status = useJobSearchStore((s) => s.status);
  const error = useJobSearchStore((s) => s.error);
  const fetchListings = useJobSearchStore((s) => s.fetchListings);
  const fetchApplications = useJobSearchStore((s) => s.fetchApplications);
  const addApplication = useJobSearchStore((s) => s.addApplication);
  const setFilters = useJobSearchStore((s) => s.setFilters);
  const setPage = useJobSearchStore((s) => s.setPage);

  const hasResume = useResumeStore((s) => s.activeVersion !== null);
  const loadVersions = useResumeStore((s) => s.loadVersions);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Initial data load: listings, saved applications, and resume versions.
  useEffect(() => {
    void fetchListings();
    void fetchApplications();
    void loadVersions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a valid selection: default to the first listing whenever the current
  // selection is absent from the freshly loaded feed.
  useEffect(() => {
    if (listings.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current !== null && listings.some((l) => l.id === current)) {
        return current;
      }
      return listings[0]?.id ?? null;
    });
  }, [listings]);

  // Set of listing IDs already saved to the tracker (drives Save button state).
  const savedListingIds = useMemo(
    () => new Set(applications.map((app) => app.listingId)),
    [applications],
  );

  const selectedListing = useMemo<IListing | null>(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  const jobsMatched = listingsMeta?.totalCount ?? listings.length;
  const savedJobs = applications.length;
  const applicationsSent = useMemo(
    () => applications.filter((app) => app.stage !== 'Wishlist').length,
    [applications],
  );

  const handleSearch = useCallback(
    (next: IListingFilters): void => {
      void setFilters(next);
    },
    [setFilters],
  );

  const handleSelect = useCallback((listing: IListing): void => {
    setSelectedId(listing.id);
  }, []);

  const handleSave = useCallback(
    (listing: IListing): void => {
      if (savedListingIds.has(listing.id) || savingId !== null) {
        return;
      }
      setSavingId(listing.id);
      void (async (): Promise<void> => {
        await addApplication(listing.id);
        setSavingId(null);
      })();
    },
    [addApplication, savedListingIds, savingId],
  );

  const handleScrapeComplete = useCallback((): void => {
    void setPage(1);
  }, [setPage]);

  const handlePrevPage = (): void => {
    if (listingsMeta !== null && listingsMeta.currentPage > 1) {
      void setPage(listingsMeta.currentPage - 1);
    }
  };

  const handleNextPage = (): void => {
    if (listingsMeta !== null && listingsMeta.hasNextPage) {
      void setPage(listingsMeta.currentPage + 1);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search toolbar */}
      <JobSearchToolbar filters={filters} onSearch={handleSearch} />

      {/* Two-column dashboard: listings (≈35%) + details (≈65%) */}
      <div className="grid gap-6 lg:grid-cols-[35fr_65fr]">
        {/* LEFT: KPI cards + Available Jobs feed */}
        <div className="flex flex-col gap-6">
          {/* KPI cards */}
          <section aria-label="Job search metrics" className="grid gap-4 sm:grid-cols-2">
            <KpiCard label="Jobs Matched" value={jobsMatched} tone="blue" />
            <KpiCard label="Saved Jobs" value={savedJobs} tone="yellow" />
            <div className="sm:col-span-2">
              <KpiCard
                label="Applications Sent"
                value={applicationsSent}
                tone="red"
              />
            </div>
          </section>

          {/* Available Jobs */}
          <Panel
            aria-label="Available jobs"
            title="Available Jobs"
            actions={
              <FindJobsButton
                hasResume={hasResume}
                onScrapeComplete={handleScrapeComplete}
              />
            }
          >
            <div className="flex flex-col gap-4">
            {/* Loading skeletons */}
            {status === 'loading' && (
              <div className="flex flex-col gap-3" aria-label="Loading listings">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="animate-pulse rounded-2xl bg-canvas p-4">
                    <div className="flex flex-col gap-3">
                      <div className="h-4 w-3/5 rounded bg-gray-200" />
                      <div className="h-3 w-2/5 rounded bg-gray-200" />
                      <div className="h-3 w-1/4 rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {status === 'error' && error !== null && (
              <div className="rounded-2xl bg-accent-red/10 p-5 text-center">
                <p className="text-sm text-accent-red">{error.message}</p>
              </div>
            )}

            {/* Empty state */}
            {status === 'idle' && listings.length === 0 && (
              <div className="rounded-2xl bg-canvas p-6 text-center">
                <p className="text-sm text-muted">
                  No listings match your search. Try adjusting your criteria.
                </p>
              </div>
            )}

            {/* Listing cards */}
            {status === 'idle' && listings.length > 0 && (
              <div className="flex flex-col gap-3">
                {listings.slice(0, 10).map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    selected={listing.id === selectedId}
                    onSelect={handleSelect}
                    isSaved={savedListingIds.has(listing.id)}
                    isSaving={savingId === listing.id}
                    onSave={handleSave}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {listingsMeta !== null &&
              listingsMeta.totalPages > 1 &&
              status === 'idle' && (
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={listingsMeta.currentPage <= 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted">
                    Page {listingsMeta.currentPage} of {listingsMeta.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!listingsMeta.hasNextPage}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/40"
                  >
                    Next
                  </button>
                </div>
              )}
          </div>
          </Panel>
        </div>

        {/* RIGHT: Job Details panel */}
        <JobDetailsPanel
          listing={selectedListing}
          isSaved={selectedListing !== null && savedListingIds.has(selectedListing.id)}
          isSaving={selectedListing !== null && savingId === selectedListing.id}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
