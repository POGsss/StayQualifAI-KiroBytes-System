import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import type { IListingFilters, WorkMode } from '../../types/jobsearch.types';

/**
 * FilterBar — horizontal bar of filter controls for the job listings feed.
 *
 * Provides work mode (select), location (text), keyword (text), and company
 * (text) filters. Text inputs are debounced (300 ms) before calling the parent
 * `onFilterChange` callback. Work mode changes fire immediately.
 *
 * Accessibility:
 * - All inputs have associated `<label>` elements
 * - Visible focus indicators on all interactive elements
 */

interface FilterBarProps {
  filters: IListingFilters;
  onFilterChange: (filters: IListingFilters) => void;
}

const WORK_MODE_OPTIONS: ReadonlyArray<{ value: '' | WorkMode; label: string }> = [
  { value: '', label: 'All Modes' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Onsite', label: 'Onsite' },
];

const DEBOUNCE_MS = 300;

export function FilterBar({ filters, onFilterChange }: FilterBarProps): JSX.Element {
  // Local state for text inputs (debounced)
  const [location, setLocation] = useState(filters.location ?? '');
  const [keyword, setKeyword] = useState(filters.keyword ?? '');
  const [company, setCompany] = useState(filters.company ?? '');

  // Ref to track the debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when external filters change (e.g. reset)
  useEffect(() => {
    setLocation(filters.location ?? '');
    setKeyword(filters.keyword ?? '');
    setCompany(filters.company ?? '');
  }, [filters.location, filters.keyword, filters.company]);

  const emitDebounced = useCallback(
    (patch: Partial<IListingFilters>, clearKey?: keyof IListingFilters) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        const updated: IListingFilters = { ...filters, ...patch };
        if (clearKey && !(clearKey in patch)) {
          delete updated[clearKey];
        }
        onFilterChange(updated);
      }, DEBOUNCE_MS);
    },
    [filters, onFilterChange],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleWorkModeChange = (value: string): void => {
    const updated: IListingFilters = { ...filters };
    if (value === '') {
      delete updated.workMode;
    } else {
      updated.workMode = value as WorkMode;
    }
    onFilterChange(updated);
  };

  const handleLocationChange = (value: string): void => {
    setLocation(value);
    const patch: Partial<IListingFilters> = {};
    if (value) {
      patch.location = value;
    }
    emitDebounced(patch, 'location');
  };

  const handleKeywordChange = (value: string): void => {
    setKeyword(value);
    const patch: Partial<IListingFilters> = {};
    if (value) {
      patch.keyword = value;
    }
    emitDebounced(patch, 'keyword');
  };

  const handleCompanyChange = (value: string): void => {
    setCompany(value);
    const patch: Partial<IListingFilters> = {};
    if (value) {
      patch.company = value;
    }
    emitDebounced(patch, 'company');
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        {/* Work Mode */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-work-mode"
            className="text-xs font-medium text-gray-600"
          >
            Work Mode
          </label>
          <select
            id="filter-work-mode"
            value={filters.workMode ?? ''}
            onChange={(e) => handleWorkModeChange(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {WORK_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-location"
            className="text-xs font-medium text-gray-600"
          >
            Location
          </label>
          <input
            id="filter-location"
            type="text"
            placeholder="e.g. New York"
            value={location}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>

        {/* Keyword */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-keyword"
            className="text-xs font-medium text-gray-600"
          >
            Keyword
          </label>
          <input
            id="filter-keyword"
            type="text"
            placeholder="e.g. React"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>

        {/* Company */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-company"
            className="text-xs font-medium text-gray-600"
          >
            Company
          </label>
          <input
            id="filter-company"
            type="text"
            placeholder="e.g. Google"
            value={company}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>
      </div>
    </div>
  );
}
