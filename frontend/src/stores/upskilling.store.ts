/**
 * Upskilling module Zustand store (Career Roadmap & Learning Engine).
 *
 * Single domain store for the Upskilling feature. It owns all client-side UI
 * state across the three sub-features — Project Generator, Career Roadmap, and
 * Course Finder — plus an async status machine and the last error. Every action
 * delegates to the data-access service (`services/upskilling.service.ts`); this
 * store NEVER calls `fetch` or the Supabase client directly.
 *
 * Async convention: each action sets status `'loading'` before the call,
 * `'idle'` on success, and `'error'` (capturing a typed `IStoreError`) on
 * failure. Service exceptions are caught and recorded — they do not escape.
 *
 * Navigation invariant (Req 8.5): the store holds a single `activeTab` string,
 * which structurally guarantees exactly one active tab after every action.
 * `setActiveTab(tab)` simply assigns that one value.
 *
 * Milestone progress (supports Req 4.7): after `toggleMilestone` the updated
 * milestone is merged into `currentRoadmap.milestones` and the
 * `completedCount`/`totalCount` are recomputed so the progress display stays
 * consistent.
 *
 * Named exports only. No `any`.
 */

import { create } from 'zustand';

import {
  UpskillingApiError,
  deleteProject as deleteProjectRequest,
  deleteRoadmap as deleteRoadmapRequest,
  deleteSavedCourse as deleteSavedCourseRequest,
  generateProjects as generateProjectsRequest,
  generateRoadmap as generateRoadmapRequest,
  getRoadmap as getRoadmapRequest,
  listProjects as listProjectsRequest,
  listRoadmaps as listRoadmapsRequest,
  listSavedCourses as listSavedCoursesRequest,
  saveCourse as saveCourseRequest,
  saveProject as saveProjectRequest,
  saveRoadmap as saveRoadmapRequest,
  searchCourses as searchCoursesRequest,
  updateMilestone as updateMilestoneRequest,
} from '../services/upskilling.service';
import type {
  ISaveCourseInput,
  ISaveProjectInput,
} from '../services/upskilling.service';
import type {
  ICourseRecommendation,
  IGenerateProjectsInput,
  IGenerateRoadmapInput,
  IMilestone,
  IProjectSuggestion,
  IRoadmap,
  IRoadmapDetail,
  IRoadmapDraft,
  IRoadmapSummary,
  ISavedCourse,
  ISearchCoursesInput,
} from '../types/upskilling.types';

/** Async lifecycle status shared by every store action. */
export type UpskillingStatus = 'idle' | 'loading' | 'error';

/** Tab identifiers for the Upskilling page layout. Default is `'Projects'`. */
export type UpskillingTab = 'Projects' | 'Roadmap' | 'Courses';

/**
 * Normalized client-side error shape. Defined locally because
 * `upskilling.types.ts` mirrors backend records only and does not expose a
 * store error type.
 */
export interface IStoreError {
  message: string;
  code: string;
}

/** Serializable state slice of the upskilling store. */
export interface IUpskillingState {
  activeTab: UpskillingTab;
  // Projects feature
  generatedProjects: IProjectSuggestion[];
  savedProjects: IProjectSuggestion[];
  // Roadmap feature
  generatedRoadmap: IRoadmapDraft | null;
  roadmaps: IRoadmapSummary[];
  currentRoadmap: IRoadmapDetail | null;
  // Courses feature
  searchResults: ICourseRecommendation[];
  savedCourses: ISavedCourse[];
  // Async machine
  status: UpskillingStatus;
  error: IStoreError | null;
}

/** Action surface of the upskilling store. */
export interface IUpskillingActions {
  // Projects
  generateProjects: (input: IGenerateProjectsInput) => Promise<IProjectSuggestion[] | null>;
  saveProject: (input: ISaveProjectInput) => Promise<IProjectSuggestion | null>;
  fetchProjects: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  // Roadmaps
  generateRoadmap: (input: IGenerateRoadmapInput) => Promise<IRoadmapDraft | null>;
  saveRoadmap: (draft: IRoadmapDraft) => Promise<IRoadmap | null>;
  fetchRoadmaps: () => Promise<void>;
  fetchRoadmap: (id: string) => Promise<void>;
  toggleMilestone: (
    roadmapId: string,
    milestoneId: string,
    completed: boolean,
  ) => Promise<IMilestone | null>;
  deleteRoadmap: (id: string) => Promise<void>;
  // Courses
  searchCourses: (input: ISearchCoursesInput) => Promise<ICourseRecommendation[] | null>;
  saveCourse: (input: ISaveCourseInput) => Promise<ISavedCourse | null>;
  fetchSavedCourses: () => Promise<void>;
  deleteSavedCourse: (id: string) => Promise<void>;
  // UI / lifecycle
  setActiveTab: (tab: UpskillingTab) => void;
  clearError: () => void;
  reset: () => void;
}

/** Full store type combining state and actions. */
export type IUpskillingStore = IUpskillingState & IUpskillingActions;

/** Initial (empty) state used at creation time and by `reset`. */
const initialState: IUpskillingState = {
  activeTab: 'Projects',
  generatedProjects: [],
  savedProjects: [],
  generatedRoadmap: null,
  roadmaps: [],
  currentRoadmap: null,
  searchResults: [],
  savedCourses: [],
  status: 'idle',
  error: null,
};

/** Convert any thrown value into the normalized `IStoreError` shape. */
function toStoreError(cause: unknown): IStoreError {
  if (cause instanceof UpskillingApiError) {
    return { message: cause.message, code: cause.type };
  }
  if (cause instanceof Error) {
    return { message: cause.message, code: 'unknown_error' };
  }
  return { message: 'An unexpected error occurred', code: 'unknown_error' };
}

/**
 * Recompute a roadmap detail's completion counts from its milestones, keeping
 * the progress display consistent after a milestone toggle (supports Req 4.7).
 */
function withRecomputedCounts(roadmap: IRoadmapDetail): IRoadmapDetail {
  const totalCount = roadmap.milestones.length;
  const completedCount = roadmap.milestones.filter((m) => m.completed).length;
  return { ...roadmap, completedCount, totalCount };
}

export const useUpskillingStore = create<IUpskillingStore>((set, get) => ({
  ...initialState,

  // --- Projects -----------------------------------------------------------

  generateProjects: async (
    input: IGenerateProjectsInput,
  ): Promise<IProjectSuggestion[] | null> => {
    set({ status: 'loading', error: null });
    try {
      const generatedProjects = await generateProjectsRequest(input);
      set({ generatedProjects, status: 'idle' });
      return generatedProjects;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  saveProject: async (input: ISaveProjectInput): Promise<IProjectSuggestion | null> => {
    set({ status: 'loading', error: null });
    try {
      const saved = await saveProjectRequest(input);
      set({ savedProjects: [saved, ...get().savedProjects], status: 'idle' });
      return saved;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  fetchProjects: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const savedProjects = await listProjectsRequest();
      set({ savedProjects, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  deleteProject: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      await deleteProjectRequest(id);
      set({
        savedProjects: get().savedProjects.filter((project) => project.id !== id),
        status: 'idle',
      });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  // --- Roadmaps -----------------------------------------------------------

  generateRoadmap: async (
    input: IGenerateRoadmapInput,
  ): Promise<IRoadmapDraft | null> => {
    set({ status: 'loading', error: null });
    try {
      const generatedRoadmap = await generateRoadmapRequest(input);
      set({ generatedRoadmap, status: 'idle' });
      return generatedRoadmap;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  saveRoadmap: async (draft: IRoadmapDraft): Promise<IRoadmap | null> => {
    set({ status: 'loading', error: null });
    try {
      const saved = await saveRoadmapRequest(draft);
      set({ status: 'idle' });
      return saved;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  fetchRoadmaps: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const roadmaps = await listRoadmapsRequest();
      set({ roadmaps, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  fetchRoadmap: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const currentRoadmap = await getRoadmapRequest(id);
      set({ currentRoadmap, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  toggleMilestone: async (
    roadmapId: string,
    milestoneId: string,
    completed: boolean,
  ): Promise<IMilestone | null> => {
    set({ status: 'loading', error: null });
    try {
      const updated = await updateMilestoneRequest(roadmapId, milestoneId, completed);
      const { currentRoadmap } = get();
      // Merge the updated milestone into the open roadmap (if it is the open
      // one) and recompute the completion counts so progress stays consistent.
      if (currentRoadmap !== null && currentRoadmap.id === roadmapId) {
        const milestones = currentRoadmap.milestones.map((milestone) =>
          milestone.id === updated.id ? updated : milestone,
        );
        set({
          currentRoadmap: withRecomputedCounts({ ...currentRoadmap, milestones }),
          status: 'idle',
        });
      } else {
        set({ status: 'idle' });
      }
      return updated;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  deleteRoadmap: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      await deleteRoadmapRequest(id);
      const { currentRoadmap } = get();
      const cleared = currentRoadmap !== null && currentRoadmap.id === id;
      set({
        roadmaps: get().roadmaps.filter((roadmap) => roadmap.id !== id),
        currentRoadmap: cleared ? null : currentRoadmap,
        status: 'idle',
      });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  // --- Courses ------------------------------------------------------------

  searchCourses: async (
    input: ISearchCoursesInput,
  ): Promise<ICourseRecommendation[] | null> => {
    set({ status: 'loading', error: null });
    try {
      const searchResults = await searchCoursesRequest(input);
      set({ searchResults, status: 'idle' });
      return searchResults;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  saveCourse: async (input: ISaveCourseInput): Promise<ISavedCourse | null> => {
    set({ status: 'loading', error: null });
    try {
      const saved = await saveCourseRequest(input);
      set({ savedCourses: [saved, ...get().savedCourses], status: 'idle' });
      return saved;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  fetchSavedCourses: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const savedCourses = await listSavedCoursesRequest();
      set({ savedCourses, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  deleteSavedCourse: async (id: string): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      await deleteSavedCourseRequest(id);
      set({
        savedCourses: get().savedCourses.filter((course) => course.id !== id),
        status: 'idle',
      });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  // --- UI / lifecycle -----------------------------------------------------

  setActiveTab: (tab: UpskillingTab): void => {
    // Assigning the single `activeTab` value structurally guarantees exactly
    // one active tab after the action (Req 8.5).
    set({ activeTab: tab });
  },

  clearError: (): void => {
    set({ error: null, status: 'idle' });
  },

  reset: (): void => {
    set({ ...initialState });
  },
}));
