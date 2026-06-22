/**
 * JobSearchToolbar — top search controls for the Job Search recruitment
 * dashboard (Bauhaus redesign).
 *
 * A single "Search Job" panel with three equally sized, label-less controls —
 * Keyword (text), Job Type (select), Salary (select) — and a primary "Find
 * Jobs" action. Controls are accessible via `aria-label`/placeholder rather
 * than visible labels. Filters commit to the parent only when the user presses
 * Find Jobs or hits Enter inside the keyword field.
 *
 * Built entirely from shared primitives ({@link Input}, {@link Select},
 * {@link Button}) so it matches every other toolbar in the app.
 *
 * Named exports only. No `any`.
 */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import { Button } from '../Button';
import { Input } from '../Input';
import { Panel } from '../Panel';
import { Select } from '../Select';
import type { ISelectOption } from '../Select';
import type { IListingFilters, WorkMode } from '../../types/jobsearch.types';

export interface IJobSearchToolbarProps {
  /** Current committed filters (used to seed the controlled inputs). */
  filters: IListingFilters;
  /** Called with the assembled filters when the user runs a search. */
  onSearch: (filters: IListingFilters) => void;
}

const WORK_MODE_OPTIONS: ReadonlyArray<ISelectOption> = [
  { value: '', label: 'Any type' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Onsite', label: 'Onsite' },
];

/** Preset minimum-salary thresholds (PHP) offered in the Salary select. */
const SALARY_OPTIONS: ReadonlyArray<ISelectOption> = [
  { value: '0', label: 'Any salary' },
  { value: '20000', label: '₱20k+' },
  { value: '40000', label: '₱40k+' },
  { value: '60000', label: '₱60k+' },
  { value: '100000', label: '₱100k+' },
  { value: '150000', label: '₱150k+' },
];

export function JobSearchToolbar({
  filters,
  onSearch,
}: IJobSearchToolbarProps): JSX.Element {
  const [keyword, setKeyword] = useState(filters.keyword ?? '');
  const [workMode, setWorkMode] = useState<'' | WorkMode>(filters.workMode ?? '');
  const [salaryMin, setSalaryMin] = useState(filters.salaryMin ?? 0);

  // Keep local inputs in sync if the committed filters change elsewhere.
  useEffect(() => {
    setKeyword(filters.keyword ?? '');
    setWorkMode(filters.workMode ?? '');
    setSalaryMin(filters.salaryMin ?? 0);
  }, [filters.keyword, filters.workMode, filters.salaryMin]);

  const handleSearch = (): void => {
    const next: IListingFilters = {};
    const trimmed = keyword.trim();
    if (trimmed.length > 0) {
      next.keyword = trimmed;
    }
    if (workMode !== '') {
      next.workMode = workMode;
    }
    if (salaryMin > 0) {
      next.salaryMin = salaryMin;
    }
    onSearch(next);
  };

  return (
    <Panel aria-label="Search jobs" title="Search Job">
      <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          type="text"
          value={keyword}
          aria-label="Keyword"
          placeholder="Keyword"
          onChange={(e): void => setKeyword(e.target.value)}
          onKeyDown={(e): void => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />

        <Select
          value={workMode}
          aria-label="Job type"
          options={WORK_MODE_OPTIONS}
          onChange={(e): void => setWorkMode(e.target.value as '' | WorkMode)}
        />

        <Select
          value={String(salaryMin)}
          aria-label="Minimum salary"
          options={SALARY_OPTIONS}
          onChange={(e): void => setSalaryMin(Number(e.target.value))}
        />

        <Button onClick={handleSearch}>Find Jobs</Button>
      </div>
    </Panel>
  );
}
