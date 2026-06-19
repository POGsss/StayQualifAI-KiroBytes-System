/**
 * Shared TypeScript types for the Resume module.
 *
 * These definitions are mirrored (duplicated, not symlinked) between
 * `backend/src/types/resume.types.ts` and `frontend/src/types/resume.types.ts`
 * to keep the backend and frontend in sync.
 *
 * Named exports only. No `any`.
 */

export type ResumeSectionType =
  | 'contact'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'additional';

export interface IResumeSection {
  type: ResumeSectionType;
  heading: string;
  items: string[]; // serialized section content lines
}

export interface IStructuredResume {
  contact: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    links: string[];
  };
  summary: string;
  experience: IResumeSection[];
  education: IResumeSection[];
  skills: string[];
  additional: IResumeSection[];
}

export interface IResumeVersion {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  content: IStructuredResume;
  createdAt: string;
  updatedAt: string;
}

export interface IAtsScanResult {
  score: number; // 0..100 inclusive (Compatibility_Score)
  factors: IScoreFactor[]; // contributing factors
  keywordSuggestions: IKeywordSuggestion[];
}

export interface IScoreFactor {
  label: string;
  impact: number;
  detail: string;
}

export interface IKeywordSuggestion {
  term: string;
  reason: string;
}

export interface IMatchResult {
  score: number; // 0..100 inclusive (Match_Score)
  matchedConcepts: string[];
  missingConcepts: string[];
}

export type XyzBullet = string; // "Accomplished X as measured by Y by doing Z"

export interface IResumeTemplate {
  id: string;
  name: string;
  sections: ResumeSectionType[];
}

// API envelope
export interface IApiResponse<T> {
  data: T | null;
  error: IApiError | null;
  meta: { requestId: string; timestamp: string } & Record<string, unknown>;
}

export interface IApiError {
  type: string;
  message: string;
  details?: unknown;
}
