import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import type { IListingFilters, WorkMode } from '../../types/jobsearch.types';

/**
 * FilterBar — horizontal bar of filter controls for the job listings feed.
 *
 * Provides work mode (select), location (text), keyword (text), and salary
 * minimum (range slider in PHP Peso). Text inputs are debounced (300 ms).
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

/** Salary slider range: 0 to 200,000 PHP, step 5,000 */
const SALARY_MIN = 0;
const SALARY_MAX = 200_000;
const SALARY_STEP = 5_000;

/** Format peso amount (e.g., 50000 → "₱50k") */
function formatPeso(amount: number): string {
  if (amount === 0) return 'Any';
  if (amount >= 1000) return `₱${String(amount / 1000)}k`;
  return `₱${String(amount)}`;
}

const DEBOUNCE_MS = 300;

export function FilterBar({ filters, onFilterChange }: FilterBarProps): JSX.Element {
  const [location, setLocation] = useState(filters.location ?? '');
  const [keyword, setKeyword] = useState(filters.keyword ?? '');
  const [salaryValue, setSalaryValue] = useState(filters.salaryMin ?? 0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocation(filters.location ?? '');
    setKeyword(filters.keyword ?? '');
    setSalaryValue(filters.salaryMin ?? 0);
  }, [filters.location, filters.keyword, filters.salaryMin]);

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

  const handleSalaryChange = (value: number): void => {
    setSalaryValue(value);
  };

  const handleSalaryCommit = (): void => {
    const updated: IListingFilters = { ...filters };
    if (salaryValue === 0) {
      delete updated.salaryMin;
    } else {
      updated.salaryMin = salaryValue;
    }
    onFilterChange(updated);
  };

  // Calculate slider fill percentage for styling
  const fillPercent = ((salaryValue - SALARY_MIN) / (SALARY_MAX - SALARY_MIN)) * 100;

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
            placeholder="e.g. Manila"
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

        {/* Salary Range Slider */}
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label
            htmlFor="filter-salary"
            className="text-xs font-medium text-gray-600"
          >
            Min Salary: <span className="text-[#9b5de5]">{formatPeso(salaryValue)}</span>
          </label>
          <div className="relative flex items-center py-1">
            <input
              id="filter-salary"
              type="range"
              min={SALARY_MIN}
              max={SALARY_MAX}
              step={SALARY_STEP}
              value={salaryValue}
              onChange={(e) => handleSalaryChange(Number(e.target.value))}
              onMouseUp={handleSalaryCommit}
              onTouchEnd={handleSalaryCommit}
              onKeyUp={handleSalaryCommit}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200
                [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-[#9b5de5] [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125
                [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:bg-[#9b5de5] [&::-moz-range-thumb]:shadow-md
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b5de5]/50"
              style={{
                background: `linear-gradient(to right, #9b5de5 0%, #9b5de5 ${String(fillPercent)}%, #e5e7eb ${String(fillPercent)}%, #e5e7eb 100%)`,
              }}
              aria-valuemin={SALARY_MIN}
              aria-valuemax={SALARY_MAX}
              aria-valuenow={salaryValue}
              aria-valuetext={formatPeso(salaryValue)}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>₱0</span>
            <span>₱200k</span>
          </div>
        </div>
      </div>
    </div>
  );
}
