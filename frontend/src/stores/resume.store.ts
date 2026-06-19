/**
 * Resume module Zustand store.
 *
 * Single domain store for the Resume feature. It owns all client-side UI state
 * (versions, active version, scan/match results, keyword suggestions, parsed or
 * built resume content, templates) plus an async status machine and the last
 * error. Every action delegates to the data-access service
 * (`services/resume.service.ts`); this store NEVER calls `fetch` or the Supabase
 * client directly.
 *
 * Async convention: each action sets status `'loading'` before the call,
 * `'idle'` on success, and `'error'` (capturing a typed `IStoreError`) on
 * failure. Service exceptions are caught and recorded — they do not escape.
 *
 * Single-active invariant (Req 10.2): exactly one version may have
 * `isActive === true`. `activateVersion`/`listVersions` keep `versions` and the
 * derived `activeVersion` consistent with that invariant.
 *
 * Named exports only. No `any`.
 */

import { create } from 'zustand';

import {
  ResumeApiError,
  activateVersion as activateVersionRequest,
  cloneVersion as cloneVersionRequest,
  createVersion as createVersionRequest,
  generateBullets as generateBulletsRequest,
  listTemplates as listTemplatesRequest,
  listVersions as listVersionsRequest,
  matchJob as matchJobRequest,
  renameVersion as renameVersionRequest,
  scanResume as scanResumeRequest,
  suggestKeywords as suggestKeywordsRequest,
  uploadResume as uploadResumeRequest,
} from '../services/resume.service';
import type {
  IAtsScanResult,
  IKeywordSuggestion,
  IMatchResult,
  IResumeTemplate,
  IResumeVersion,
  IStructuredResume,
  XyzBullet,
} from '../types/resume.types';

/** Async lifecycle status shared by every store action. */
export type ResumeStatus = 'idle' | 'loading' | 'error';

/** Normalized error shape captured from a failed service call. */
export interface IStoreError {
  /** Machine-readable error category (from `ResumeApiError.type` when available). */
  type: string;
  /** Human-readable message for display. */
  message: string;
  /** HTTP status when the failure originated from a `ResumeApiError`. */
  status?: number;
}

/** Serializable state slice of the resume store. */
export interface IResumeState {
  versions: IResumeVersion[];
  activeVersion: IResumeVersion | null;
  scanResult: IAtsScanResult | null;
  matchResult: IMatchResult | null;
  keywordSuggestions: IKeywordSuggestion[];
  bullets: XyzBullet[];
  resumeContent: IStructuredResume | null;
  templates: IResumeTemplate[];
  status: ResumeStatus;
  error: IStoreError | null;
}

/** Action surface of the resume store. */
export interface IResumeActions {
  loadTemplates: () => Promise<void>;
  uploadResume: (file: File) => Promise<IStructuredResume | null>;
  scan: (
    content: IStructuredResume,
    jobDescription?: string,
  ) => Promise<IAtsScanResult | null>;
  suggestKeywords: (
    content: IStructuredResume,
    jobDescription: string,
  ) => Promise<IKeywordSuggestion[] | null>;
  matchJob: (
    content: IStructuredResume,
    jobDescription: string,
  ) => Promise<IMatchResult | null>;
  generateBullets: (experience: string) => Promise<XyzBullet[] | null>;
  loadVersions: () => Promise<void>;
  createVersion: (
    name: string,
    content: IStructuredResume,
    sourceVersionId?: string,
  ) => Promise<IResumeVersion | null>;
  cloneVersion: (id: string) => Promise<IResumeVersion | null>;
  renameVersion: (id: string, name: string) => Promise<IResumeVersion | null>;
  activateVersion: (id: string) => Promise<IResumeVersion | null>;
  setResumeContent: (content: IStructuredResume | null) => void;
  clearError: () => void;
  reset: () => void;
}

/** Full store type combining state and actions. */
export type IResumeStore = IResumeState & IResumeActions;

/** Initial (empty) state used at creation time and by `reset`. */
const initialState: IResumeState = {
  versions: [],
  activeVersion: null,
  scanResult: null,
  matchResult: null,
  keywordSuggestions: [],
  bullets: [],
  resumeContent: null,
  templates: [],
  status: 'idle',
  error: null,
};

/** Convert any thrown value into the normalized `IStoreError` shape. */
function toStoreError(cause: unknown): IStoreError {
  if (cause instanceof ResumeApiError) {
    return { type: cause.type, message: cause.message, status: cause.status };
  }
  if (cause instanceof Error) {
    return { type: 'unknown_error', message: cause.message };
  }
  return { type: 'unknown_error', message: 'An unexpected error occurred' };
}

/**
 * Apply the single-active invariant to a version list: replace the activated
 * entry with the authoritative server version (marked active), and mark every
 * other version inactive.
 */
function applyActiveFlags(
  versions: IResumeVersion[],
  activated: IResumeVersion,
): IResumeVersion[] {
  return versions.map((version) =>
    version.id === activated.id
      ? { ...activated, isActive: true }
      : { ...version, isActive: false },
  );
}

/** Derive the active version from a list using the `isActive` flag. */
function deriveActiveVersion(versions: IResumeVersion[]): IResumeVersion | null {
  return versions.find((version) => version.isActive) ?? null;
}

export const useResumeStore = create<IResumeStore>((set, get) => ({
  ...initialState,

  loadTemplates: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const templates = await listTemplatesRequest();
      set({ templates, status: 'idle' });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  uploadResume: async (file: File): Promise<IStructuredResume | null> => {
    set({ status: 'loading', error: null });
    try {
      const content = await uploadResumeRequest(file);
      set({ resumeContent: content, status: 'idle' });
      return content;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  scan: async (
    content: IStructuredResume,
    jobDescription?: string,
  ): Promise<IAtsScanResult | null> => {
    set({ status: 'loading', error: null });
    try {
      const scanResult = await scanResumeRequest(content, jobDescription);
      set({
        scanResult,
        keywordSuggestions: scanResult.keywordSuggestions,
        status: 'idle',
      });
      return scanResult;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  suggestKeywords: async (
    content: IStructuredResume,
    jobDescription: string,
  ): Promise<IKeywordSuggestion[] | null> => {
    set({ status: 'loading', error: null });
    try {
      const keywordSuggestions = await suggestKeywordsRequest(content, jobDescription);
      set({ keywordSuggestions, status: 'idle' });
      return keywordSuggestions;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  matchJob: async (
    content: IStructuredResume,
    jobDescription: string,
  ): Promise<IMatchResult | null> => {
    set({ status: 'loading', error: null });
    try {
      const matchResult = await matchJobRequest(content, jobDescription);
      set({ matchResult, status: 'idle' });
      return matchResult;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  generateBullets: async (experience: string): Promise<XyzBullet[] | null> => {
    set({ status: 'loading', error: null });
    try {
      const bullets = await generateBulletsRequest(experience);
      set({ bullets, status: 'idle' });
      return bullets;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  loadVersions: async (): Promise<void> => {
    set({ status: 'loading', error: null });
    try {
      const versions = await listVersionsRequest();
      set({
        versions,
        activeVersion: deriveActiveVersion(versions),
        status: 'idle',
      });
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
    }
  },

  createVersion: async (
    name: string,
    content: IStructuredResume,
    sourceVersionId?: string,
  ): Promise<IResumeVersion | null> => {
    set({ status: 'loading', error: null });
    try {
      const created = await createVersionRequest(name, content, sourceVersionId);
      const versions = [...get().versions, created];
      set({
        versions,
        activeVersion: created.isActive ? created : get().activeVersion,
        status: 'idle',
      });
      return created;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  cloneVersion: async (id: string): Promise<IResumeVersion | null> => {
    set({ status: 'loading', error: null });
    try {
      const cloned = await cloneVersionRequest(id);
      const versions = [...get().versions, cloned];
      set({
        versions,
        activeVersion: cloned.isActive ? cloned : get().activeVersion,
        status: 'idle',
      });
      return cloned;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  renameVersion: async (id: string, name: string): Promise<IResumeVersion | null> => {
    set({ status: 'loading', error: null });
    try {
      const renamed = await renameVersionRequest(id, name);
      const versions = get().versions.map((version) =>
        version.id === renamed.id ? renamed : version,
      );
      const current = get().activeVersion;
      set({
        versions,
        activeVersion: current !== null && current.id === renamed.id ? renamed : current,
        status: 'idle',
      });
      return renamed;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  activateVersion: async (id: string): Promise<IResumeVersion | null> => {
    set({ status: 'loading', error: null });
    try {
      const activated = await activateVersionRequest(id);
      // Enforce the single-active invariant against the returned version so
      // exactly one entry in local state is active.
      const versions = applyActiveFlags(get().versions, activated);
      set({
        versions,
        activeVersion: deriveActiveVersion(versions),
        status: 'idle',
      });
      return activated;
    } catch (cause) {
      set({ status: 'error', error: toStoreError(cause) });
      return null;
    }
  },

  setResumeContent: (content: IStructuredResume | null): void => {
    set({ resumeContent: content });
  },

  clearError: (): void => {
    set({ error: null, status: 'idle' });
  },

  reset: (): void => {
    set({ ...initialState });
  },
}));
