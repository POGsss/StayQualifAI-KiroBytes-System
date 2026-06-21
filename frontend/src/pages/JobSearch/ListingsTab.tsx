import { useEffect } from 'react';
import type { JSX } from 'react';

import { FilterBar } from '../../components/JobSearch/FilterBar';
import { ListingCard } from '../../components/JobSearch/ListingCard';
import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { IListingFilters } from '../../types/jobsearch.types';

/**
 * ListingsTab — paginated, filterable job listings feed.
 *
 * Uses the Zustand store to fetch listings on mount, apply filters via the
 * FilterBar, render ListingCard components, and provide pagination controls.
 *
 * States:
 * - Loading: spinner/skeleton
 * - Empty: friendly message when no results match
 * - Error: error message from the store
 * - Populated: listing cards + pagination
 */

export function ListingsTab(): JSX.Element {
  const listings = useJobSearchStore((s) => s.listings);
  const listingsMeta = useJobSearchStore((s) => s.listingsMeta);
  const filters = useJobSearchStore((s) => s.filters);
  const status = useJobSearchStore((s) => s.status);
  const error = useJobSearchStore((s) => s.error);
  const fetchListings = useJobSearchStore((s) => s.fetchListings);
  const setFilters = useJobSearchStore((s) => s.setFilters);
  const setPage = useJobSearchStore((s) => s.setPage);

  // Fetch listings on mount
  useEffect(() => {
    void fetchListings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (newFilters: IListingFilters): void => {
    void setFilters(newFilters);
  };

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
    <div className="flex flex-col gap-4">
      {/* Filter Bar */}
      <FilterBar filters={filters} onFilterChange={handleFilterChange} />

      {/* Loading state */}
      {status === 'loading' && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary"
              role="status"
              aria-label="Loading listings"
            />
            <p className="text-sm text-gray-500">Loading listings…</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && error !== null && (
        <div className="rounded-2xl bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      {/* Empty state */}
      {status === 'idle' && listings.length === 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
          <p className="text-sm text-gray-500">
            No listings match your filters. Try adjusting your search criteria.
          </p>
        </div>
      )}

      {/* Listing cards */}
      {status === 'idle' && listings.length > 0 && (
        <div className="flex flex-col gap-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {listingsMeta !== null && listingsMeta.totalPages > 0 && status === 'idle' && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={listingsMeta.currentPage <= 1}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium
              text-gray-700 transition-colors hover:bg-gray-50
              disabled:cursor-not-allowed disabled:opacity-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {listingsMeta.currentPage} of {listingsMeta.totalPages}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!listingsMeta.hasNextPage}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium
              text-gray-700 transition-colors hover:bg-gray-50
              disabled:cursor-not-allowed disabled:opacity-50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
