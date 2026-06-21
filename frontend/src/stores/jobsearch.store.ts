/**
 * Job Search module Zustand store.
 *
 * Single domain store for the Job Search feature. It owns all client-side UI
 * state (listings, applications, filters, AI-generated content, active tab)
 * plus an async status machine and the last error. Every action delegates to
 * the data-access service (`services/jobsearch.service.ts`); this store NEVER
 * calls `fetch` or the Supabase client directly.
 *
 * Async convention: each action sets status `'loading'` before the call,
 * `'idle'` on success, and `'error'` (capturing a typed `IStoreError`) on
 * failure. Service exceptions are caught and recorded — they do not escape.
 *
 * Optimistic stage update (Req 4.6): `updateStage` immediately moves the
 * application to the new stage in local state, calls the API, and reverts on
 * failure.
 *
 * Named exports only. No `any`.
 */

import { create } from 'zustand';

import {
  JobSearchApiError,
  addApplication as addApplicationRequest,
  deleteApplication as deleteApplicationRequest,
  generateCoverLetter as generateCoverLetterRequest,
  generateFollowUpEmail as generateFollowUpEmailRequest,
  generateLinkedInOutreach as generateLinkedInOutreachRequest,
  getApplicationDetail as getApplicationDetailRequest,
  getListings as getListingsRequest,
  listApplications as listApplicationsRequest,
  updateNotes as updateNotesRequest,
  updateStage as updateStageRequest,
} from '../services/jobsearch.service';
import type {
  IApplication,
  IApplicationDetail,
  IListing,
  IListingFilters,
  IPaginationMeta,
  IStoreError,
  Stage,
} from '../types/jobsearch.types';

/** Async lifecycle status shared by every store action. */
export type JobSearchStatus = 'idle' | 'loading' | 'error';

/** Tab identifiers for the Job Search page layout. */
export type JobSearchTab = 'listings' | 'tracker' | 'ai-writer';

/** AI content generation type. */
export type AiContentType = 'cover-letter' | 'linkedin-outreach' | 'follow-up-email';

/** Serializable state slice of the job search store. */
export interface IJobSearchState {
  listings: IListing[];
  listingsMeta: IPaginationMeta | null;
  filters: IListingFilters;
  applications: IApplication[];
  selectedApplication: IApplicationDetail | null;
  generatedContent: string | null;
  activeTab: JobSearchTab;
  status: JobSearchStatus;
  error: IStoreError | null;
}

/** Action surface of the job search store. */
export interface IJobSearchActions {
  fetchListings: () => Promise<void>;
  setFilters: (filters: IListingFilters) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  fetchApplications: () => Promise<void>;
  addApplication: (listingId: string) => Promise<IApplication | null>;
  updateStage: (id: string, stage: Stage) => Promise<IApplication | null>;
  deleteApplication: (id: string) => Promise<void>;
  updateNotes: (id: string, notes: string) => Promise<IApplication | null>;
  fetchApplicationDetail: (id: string) => Promise<void>;
  generateContent: (
    type: AiContentType,
    applicationId: string,
    recipientName?: string,
    recipientRole?: string,
  ) => Promise<string | null>;
  setActiveTab: (tab: JobSearchTab) => void;
  clearError: () => void;
  reset: () => void;
}

/** Full store type combining state and actions. */
export type IJobSearchStore = IJobSearchState & IJobSearchActions;

/** Initial (empty) state used at creation time and by `reset`. */
const initialState: IJobSearchState = {
  listings: [],
  listingsMeta: null,
  filters: {},
  applications: [],
  selectedApplication: null,
  generatedContent: null,
  activeTab: 'listings',
  status: 'idle',
  error: null,
};

/** Convert any thrown value into the normalized `IStoreError` shape. */
function toStoreError(cause: unknown): IStoreError {
  if (cause instanceof JobSearchApiError) {
    return { message: cause.message, code: cause.type };
  }
  if (cause instanceof Error) {
    return { message: cause.message, code: 'unknown_error' };
  }
  return { message: 'An unexpected error occurred', code: 'unknown_error' };
}

/** Internal page state tracked alongside filters for listing pagination. */
let currentPage = 1;

export const useJobSearchStore = create<IJobSearchStore>((set, get) => ({
  ...initialState,

  fetchListings: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const { filters } = get();
      const response = await getListingsRequest({ ...filters, page: currentPage });
      set({ listings: response.listings, listingsMeta: response.meta, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  setFilters: async (filters: IListingFilters): Promise<void> => {
    currentPage = 1;
    set({ filters });
    await get().fetchListings();
  },

  setPage: async (page: number): Promise<void> => {
    currentPage = page;
    await get().fetchListings();
  },

  fetchApplications: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const applications = await listApplicationsRequest();
      set({ applications, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  addApplication: async (listingId: string): Promise<IApplication | null> => {
    set({ status: 'loading', error: null });
    try {
      const application = await addApplicationRequest(listingId);
      set({ applications: [application, ...get().applications], status: 'idle' });
      return application;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  updateStage: async (id: string, stage: Stage): Promise<IApplication | null> => {
    // 1. Save current applications state for potential revert
    const previousApplications = get().applications;

    // 2. Optimistically update the stage and dateStageChanged in local state
    const now = new Date().toISOString();
    const optimisticApplications = previousApplications.map((app) =>
      app.id === id ? { ...app, stage, dateStageChanged: now } : app,
    );
    set({ applications: optimisticApplications });

    try {
      // 3. Call the API
      const updated = await updateStageRequest(id, stage);

      // 4. On success: use the server response to update the application
      set({
        applications: get().applications.map((app) =>
          app.id === updated.id ? updated : app,
        ),
      });
      return updated;
    } catch (cause) {
      // 5. On failure: revert to saved state, set error
      set({
        applications: previousApplications,
        status: 'error',
        error: toStoreError(cause),
      });
      return null;
    }
  },

  deleteApplication: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      await deleteApplicationRequest(id);
      const applications = get().applications.filter((app) => app.id !== id);
      const { selectedApplication } = get();
      const cleared =
        selectedApplication !== null && selectedApplication.application.id === id;
      set({
        applications,
        selectedApplication: cleared ? null : selectedApplication,
        status: 'idle',
      });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  updateNotes: async (id: string, notes: string): Promise<IApplication | null> => {
    set({ status: 'loading', error: null });
    try {
      const updated = await updateNotesRequest(id, notes);
      set({
        applications: get().applications.map((app) =>
          app.id === updated.id ? updated : app,
        ),
        status: 'idle',
      });
      return updated;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  fetchApplicationDetail: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const detail = await getApplicationDetailRequest(id);
      set({ selectedApplication: detail, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  generateContent: async (
    type: AiContentType,
    applicationId: string,
    recipientName?: string,
    recipientRole?: string,
  ): Promise<string | null> => {
    set({ status: 'loading', error: null, generatedContent: null });
    try {
      let response;
      switch (type) {
        case 'cover-letter':
          response = await generateCoverLetterRequest(applicationId);
          break;
        case 'linkedin-outreach':
          response = await generateLinkedInOutreachRequest(
            applicationId,
            recipientName,
            recipientRole,
          );
          break;
        case 'follow-up-email':
          response = await generateFollowUpEmailRequest(applicationId);
          break;
      }
      set({ generatedContent: response.generatedText, status: 'idle' });
      return response.generatedText;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  setActiveTab: (tab: JobSearchTab): void => {
    set({ activeTab: tab });
  },

  clearError: (): void => {
    set({ error: null, status: 'idle' });
  },

  reset: (): void => {
    currentPage = 1;
    set({ ...initialState });
  },
}));
