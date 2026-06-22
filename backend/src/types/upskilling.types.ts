/**
 * Shared TypeScript types for the Upskilling module
 * (Career Roadmap & Learning Engine).
 *
 * The interface and union definitions here are mirrored (duplicated, not
 * symlinked) between `backend/src/types/upskilling.types.ts` and
 * `frontend/src/types/upskilling.types.ts` to keep the backend and frontend in
 * sync. The backend-only `ILearningPlatformAdapter` interface is intentionally
 * excluded from the frontend mirror.
 *
 * Named exports only. No `any`.
 */

export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type CostClassification = 'Free' | 'Paid';

// --- Projects -------------------------------------------------------------

export interface IGenerateProjectsInput {
  targetRole: string; // 2..100 non-whitespace chars
  focusSkills?: string[]; // 1..10 entries, each 1..50 non-whitespace chars
}

export interface IProjectSuggestion {
  id: string; // present once persisted
  targetRole: string;
  title: string; // 3..150 chars
  description: string; // 50..1000 chars
  demonstratedSkills: string[]; // 1..10 unique non-empty, each 1..50 nw chars
  difficulty: DifficultyLevel;
  estimatedEffortHours: number; // integer 1..500
  createdAt: string; // ISO timestamp (persisted records)
}

// --- Roadmaps -------------------------------------------------------------

export interface IGenerateRoadmapInput {
  currentRole: string; // 2..100 non-whitespace chars
  targetRole: string; // 2..100 non-whitespace chars
  targetDurationMonths: number; // integer 1..36
}

export interface IMilestone {
  id: string;
  sequence: number; // contiguous, starts at 1, step 1
  title: string; // 1..150 non-whitespace chars
  description: string; // 20..1000 chars
  skills: string[]; // 0..10 unique, each 1..50 nw chars
  estimatedDurationWeeks: number; // integer 1..156
  completed: boolean; // defaults false
  completedAt: string | null; // defaults null
}

export interface IRoadmapDraft {
  currentRole: string;
  targetRole: string;
  targetDurationMonths: number;
  milestones: Omit<IMilestone, 'id' | 'completed' | 'completedAt'>[];
}

export interface IRoadmap {
  id: string;
  currentRole: string;
  targetRole: string;
  targetDurationMonths: number;
  createdAt: string;
  milestones: IMilestone[];
}

export interface IRoadmapSummary {
  id: string;
  currentRole: string;
  targetRole: string;
  targetDurationMonths: number;
  createdAt: string;
  completedCount: number; // 0..totalCount
  totalCount: number;
}

export interface IRoadmapDetail extends IRoadmap {
  completedCount: number;
  totalCount: number;
}

// --- Courses --------------------------------------------------------------

export interface ISearchCoursesInput {
  query: string; // 2..100 non-whitespace chars
  cost?: CostClassification; // optional filter
}

export interface ICourseRecommendation {
  title: string; // 1..200 chars
  provider: string; // 1..100 chars
  url: string; // HTTPS
  cost: CostClassification;
  rating?: number; // optional
}

export interface ISavedCourse {
  id: string;
  title: string; // 1..150 chars
  provider: string; // 1..100 chars
  url: string; // HTTPS, <= 2048 chars
  cost: CostClassification;
  createdAt: string;
}

// --- Learning platform adapters (backend-only) ----------------------------

/**
 * Each external course/certificate source implements this adapter so the
 * Course_Finder_Service can treat every source uniformly. Implementations
 * normalize their catalog results into `ICourseRecommendation` and honor the
 * provided `AbortSignal` for per-source timeout/cancellation.
 *
 * Backend-only: this interface is NOT mirrored to the frontend.
 */
export interface ILearningPlatformAdapter {
  readonly sourceName: string;
  search(query: string, signal: AbortSignal): Promise<ICourseRecommendation[]>;
}
