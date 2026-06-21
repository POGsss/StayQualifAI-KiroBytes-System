/**
 * Shared TypeScript types for the Job Search module.
 *
 * These definitions are mirrored (duplicated, not symlinked) between
 * `backend/src/types/jobsearch.types.ts` and `frontend/src/types/jobsearch.types.ts`
 * to keep the backend and frontend in sync.
 *
 * Named exports only. No `any`.
 */

export type WorkMode = 'Remote' | 'Hybrid' | 'Onsite';
export type Stage = 'Wishlist' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export interface IListing {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  description: string;
  sourceUrls: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  datePosted: string;
  dateScraped: string;
}

export interface IApplication {
  id: string;
  listingId: string;
  stage: Stage;
  notes: string | null;
  dateAdded: string;
  dateStageChanged: string;
  /** Denormalized listing fields for card display */
  listingTitle: string;
  listingCompany: string;
}

export interface IApplicationDetail {
  application: IApplication;
  listing: IListing;
  stageHistory: IStageTransition[];
}

export interface IStageTransition {
  stage: Stage;
  changedAt: string;
}

export interface IListingIngestInput {
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  description: string;
  sourceUrl: string;
  salaryMin?: number;
  salaryMax?: number;
  datePosted: string;
}

export interface IPaginationMeta {
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface IListingFilters {
  workMode?: WorkMode;
  location?: string;
  keyword?: string;
  salaryMin?: number;
}

// AI Writer types

export interface ICoverLetterRequest {
  applicationId: string;
}

export interface ILinkedInOutreachRequest {
  applicationId: string;
  recipientName?: string;
  recipientRole?: string;
}

export interface IFollowUpEmailRequest {
  applicationId: string;
}

export interface IAiWriterResponse {
  generatedText: string;
}
