import { useEffect, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { CourseCard } from '../../components/Upskilling/CourseCard';
import { SavedCourseCard } from '../../components/Upskilling/SavedCourseCard';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Panel } from '../../components/Panel';
import { Select } from '../../components/Select';
import type { ISelectOption } from '../../components/Select';
import { useUpskillingStore } from '../../stores/upskilling.store';
import type {
  CostClassification,
  ICourseRecommendation,
} from '../../types/upskilling.types';

/**
 * CoursesTab — Course & Certificate Finder (Bauhaus redesign).
 *
 * Adopts the Projects tab page structure: a single-row search/filter toolbar
 * (label-less, placeholders only, action button on the same row), followed by
 * a responsive grid of recommendation cards and a "Saved courses" grid that
 * matches "Saved projects" exactly. No KPI cards on this tab.
 *
 * Lets a learner search for course/certificate recommendations by query with
 * an optional Free/Paid cost filter (Req 5.1, 5.3). Results are rendered in the
 * exact order returned by the API — the deterministic Free-before-Paid, then
 * case-insensitive title ordering is owned by the backend and is NOT re-sorted
 * here (Req 5.9). Each result can be bookmarked, and saved bookmarks can be
 * deleted (Req 6.1, 6.3, 6.5). A friendly empty state appears when a search
 * returns zero results (Req 5.5), and a dismissible banner surfaces errors.
 */

/** Local cost-filter selection. `'All'` sends no cost filter to the API. */
type CostFilter = 'All' | CostClassification;

const COST_OPTIONS: ReadonlyArray<ISelectOption> = [
  { value: 'All', label: 'Any cost' },
  { value: 'Free', label: 'Free' },
  { value: 'Paid', label: 'Paid' },
];

export function CoursesTab(): JSX.Element {
  const searchResults = useUpskillingStore((s) => s.searchResults);
  const savedCourses = useUpskillingStore((s) => s.savedCourses);
  const status = useUpskillingStore((s) => s.status);
  const error = useUpskillingStore((s) => s.error);
  const searchCourses = useUpskillingStore((s) => s.searchCourses);
  const saveCourse = useUpskillingStore((s) => s.saveCourse);
  const fetchSavedCourses = useUpskillingStore((s) => s.fetchSavedCourses);
  const deleteSavedCourse = useUpskillingStore((s) => s.deleteSavedCourse);
  const clearError = useUpskillingStore((s) => s.clearError);

  const [query, setQuery] = useState('');
  const [costFilter, setCostFilter] = useState<CostFilter>('All');
  const [hasSearched, setHasSearched] = useState(false);

  // Load the user's saved courses on mount.
  useEffect(() => {
    void fetchSavedCourses();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= 2 && status !== 'loading';

  const handleSearch = async (): Promise<void> => {
    if (!canSearch) {
      return;
    }
    const result = await searchCourses(
      costFilter === 'All'
        ? { query: trimmedQuery }
        : { query: trimmedQuery, cost: costFilter },
    );
    if (result !== null) {
      setHasSearched(true);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void handleSearch();
  };

  const handleSave = async (
    recommendation: ICourseRecommendation,
  ): Promise<boolean> => {
    const saved = await saveCourse({
      title: recommendation.title,
      provider: recommendation.provider,
      url: recommendation.url,
      cost: recommendation.cost,
    });
    return saved !== null;
  };

  const handleDelete = async (id: string): Promise<void> => {
    await deleteSavedCourse(id);
  };

  const showEmptyState =
    hasSearched && status === 'idle' && searchResults.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Search/filter row — mirrors the Projects + Job Search toolbars */}
      <Panel aria-label="Search courses and certificates" title="Find Courses">
        <form
          className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
          onSubmit={handleSubmit}
        >
          <Input
            type="text"
            value={query}
            aria-label="Course search query"
            placeholder="Search courses (e.g. React, AWS certification)"
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            value={costFilter}
            aria-label="Cost filter"
            options={COST_OPTIONS}
            onChange={(e) => setCostFilter(e.target.value as CostFilter)}
          />
          <Button type="submit" disabled={!canSearch}>
            {status === 'loading' ? 'Searching…' : 'Search'}
          </Button>
        </form>
      </Panel>

      {/* Dismissible error banner */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl bg-accent-red/10 p-4"
        >
          <p className="text-sm text-accent-red">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="shrink-0 rounded-md p-1 text-accent-red transition-colors hover:bg-accent-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading state — skeleton grid */}
      {status === 'loading' && (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Loading courses"
        >
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-surface p-6 shadow-card">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="h-5 w-3/5 rounded bg-canvas" />
                  <div className="h-6 w-16 rounded-full bg-canvas" />
                </div>
                <div className="h-4 w-32 rounded bg-canvas" />
                <div className="flex gap-2">
                  <div className="h-8 w-28 rounded-lg bg-canvas" />
                  <div className="h-8 w-20 rounded-lg bg-canvas" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — search returned zero results (Req 5.5) */}
      {showEmptyState && (
        <Panel aria-label="No courses found" className="text-center">
          <p className="text-sm text-muted">
            No courses matched your search. Try a different topic or cost filter.
          </p>
        </Panel>
      )}

      {/* Search results — rendered in API order, NOT re-sorted (Req 5.9) */}
      {status === 'idle' && searchResults.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">Recommendations</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {searchResults.map((recommendation) => (
              <CourseCard
                key={recommendation.url}
                recommendation={recommendation}
                onSave={handleSave}
              />
            ))}
          </div>
        </section>
      )}

      {/* Saved courses — matches the Saved projects grid exactly */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Saved courses</h2>
        {savedCourses.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {savedCourses.map((course) => (
              <SavedCourseCard key={course.id} course={course} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <Panel aria-label="No saved courses" className="text-center">
            <p className="text-sm text-muted">
              No saved courses yet. Bookmark a recommendation to find it here.
            </p>
          </Panel>
        )}
      </section>
    </div>
  );
}
