/**
 * Interview module Zustand store.
 *
 * Single domain store for the Interview feature (one store per module). It owns
 * all client-side state for the simulator, scorecard, and STAR story organizer:
 * the active session detail, the session summary list, the active session's
 * questions, the latest performance scorecard, and the STAR story list — plus a
 * boolean `isLoading` flag and the last normalized `error`.
 *
 * Every action delegates to the data-access service
 * (`services/interview.service.ts`); this store NEVER calls `fetch` or the
 * Supabase client directly.
 *
 * Async convention (Req 6.1, 6.2): each action sets `isLoading = true` and
 * `error = null` before the service call. On success it sets `isLoading = false`
 * and updates the relevant slice. On failure it catches the service exception
 * (exceptions do NOT escape), sets `isLoading = false` and
 * `error = toStoreError(cause)`, and PRESERVES the prior data slices so a failed
 * request never wipes already-loaded data.
 *
 * Named exports only. No `any`.
 */

import { create } from 'zustand';

import {
  InterviewApiError,
  computeScorecard as computeScorecardRequest,
  createSession as createSessionRequest,
  createStory as createStoryRequest,
  deleteSession as deleteSessionRequest,
  deleteStory as deleteStoryRequest,
  evaluateAnswer as evaluateAnswerRequest,
  forceEndSession as forceEndSessionRequest,
  getScorecard as getScorecardRequest,
  getSession as getSessionRequest,
  getStory as getStoryRequest,
  listSessions as listSessionsRequest,
  listStories as listStoriesRequest,
  startSession as startSessionRequest,
  submitAnswer as submitAnswerRequest,
  updateStory as updateStoryRequest,
} from '../services/interview.service';
import type {
  IAnswerEvaluation,
  ICreateSessionInput,
  ICreateStarInput,
  IInterviewQuestion,
  IInterviewSession,
  IInterviewSessionDetail,
  IInterviewSessionSummary,
  IPerformanceScorecard,
  IStarStory,
  ISubmitAnswerInput,
  IUpdateStarInput,
} from '../types/interview.types';

/** Normalized error shape captured from a failed service call. */
export interface IStoreError {
  /** Machine-readable error category (from `InterviewApiError.code` when available). */
  type: string;
  /** Human-readable message for display. */
  message: string;
  /** HTTP status when the failure originated from an `InterviewApiError`. */
  status?: number;
}

/** Serializable state slice of the interview store. */
export interface IInterviewState {
  /** Full detail of the session currently open in the simulator. */
  activeSession: IInterviewSessionDetail | null;
  /** Questions for the active session (mirrors `activeSession.questions`). */
  activeQuestions: IInterviewQuestion[];
  /** Summaries for the authenticated user's sessions. */
  sessions: IInterviewSessionSummary[];
  /** Latest computed/fetched performance scorecard. */
  scorecard: IPerformanceScorecard | null;
  /** The authenticated user's STAR stories. */
  stories: IStarStory[];
  /** True while any action's service call is in flight. */
  isLoading: boolean;
  /** The most recent failure, or `null` when the last action succeeded. */
  error: IStoreError | null;
}

/** Action surface of the interview store. */
export interface IInterviewActions {
  loadSessions: () => Promise<void>;
  createSession: (
    input: ICreateSessionInput,
  ) => Promise<IInterviewSession | null>;
  openSession: (sessionId: string) => Promise<IInterviewSessionDetail | null>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  startSession: (sessionId: string) => Promise<IInterviewQuestion[] | null>;
  submitAnswer: (
    sessionId: string,
    questionId: string,
    input: ISubmitAnswerInput,
  ) => Promise<IInterviewQuestion | null>;
  evaluateAnswer: (
    sessionId: string,
    questionId: string,
  ) => Promise<IAnswerEvaluation | null>;
  computeScorecard: (
    sessionId: string,
  ) => Promise<IPerformanceScorecard | null>;
  loadScorecard: (sessionId: string) => Promise<IPerformanceScorecard | null>;
  loadStories: () => Promise<void>;
  createStory: (input: ICreateStarInput) => Promise<IStarStory | null>;
  getStory: (id: string) => Promise<IStarStory | null>;
  updateStory: (
    id: string,
    input: IUpdateStarInput,
  ) => Promise<IStarStory | null>;
  deleteStory: (id: string) => Promise<boolean>;
  forceEndSession: (sessionId: string) => Promise<IInterviewSessionDetail | null>;
  clearError: () => void;
  reset: () => void;
}

/** Full store type combining state and actions. */
export type IInterviewStore = IInterviewState & IInterviewActions;

/** Initial (empty) state used at creation time and by `reset`. */
const initialState: IInterviewState = {
  activeSession: null,
  activeQuestions: [],
  sessions: [],
  scorecard: null,
  stories: [],
  isLoading: false,
  error: null,
};

/** Convert any thrown value into the normalized `IStoreError` shape. */
function toStoreError(cause: unknown): IStoreError {
  if (cause instanceof InterviewApiError) {
    return { type: cause.code, message: cause.message, status: cause.status };
  }
  if (cause instanceof Error) {
    return { type: 'unknown_error', message: cause.message };
  }
  return { type: 'unknown_error', message: 'An unexpected error occurred' };
}

/**
 * Replace a question (matched by id) within a list, returning a new array.
 * Returns the original array reference when no match is found.
 */
function replaceQuestion(
  questions: IInterviewQuestion[],
  updated: IInterviewQuestion,
): IInterviewQuestion[] {
  return questions.map((question) =>
    question.id === updated.id ? updated : question,
  );
}

export const useInterviewStore = create<IInterviewStore>((set, get) => ({
  ...initialState,

  loadSessions: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await listSessionsRequest();
      set({ sessions, isLoading: false });
    } catch (cause) {
      // Preserve prior `sessions` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
    }
  },

  createSession: async (
    input: ICreateSessionInput,
  ): Promise<IInterviewSession | null> => {
    set({ isLoading: true, error: null });
    try {
      const created = await createSessionRequest(input);
      // `createSession` returns `IInterviewSession` (no questions/scorecard yet),
      // not a detail; do not coerce it into `activeSession`. Callers `openSession`
      // to load the full detail. Just record success.
      set({ isLoading: false });
      return created;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  openSession: async (
    sessionId: string,
  ): Promise<IInterviewSessionDetail | null> => {
    set({ isLoading: true, error: null });
    try {
      const detail = await getSessionRequest(sessionId);
      set({
        activeSession: detail,
        activeQuestions: detail.questions,
        scorecard: detail.scorecard,
        isLoading: false,
      });
      return detail;
    } catch (cause) {
      // Preserve prior `activeSession`/`activeQuestions`/`scorecard` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  deleteSession: async (sessionId: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      await deleteSessionRequest(sessionId);
      const current = get();
      // Drop the deleted session from the list, and clear the active session /
      // scorecard when they belonged to the deleted session.
      const sessions = current.sessions.filter((s) => s.id !== sessionId);
      const wasActive = current.activeSession?.id === sessionId;
      set({
        sessions,
        isLoading: false,
        ...(wasActive
          ? { activeSession: null, activeQuestions: [], scorecard: null }
          : {}),
      });
      return true;
    } catch (cause) {
      // Preserve prior `sessions` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
      return false;
    }
  },

  startSession: async (
    sessionId: string,
  ): Promise<IInterviewQuestion[] | null> => {
    set({ isLoading: true, error: null });
    try {
      const questions = await startSessionRequest(sessionId);
      const current = get().activeSession;
      // Sync the active session's questions when it matches the started session.
      const activeSession =
        current !== null && current.id === sessionId
          ? { ...current, questions }
          : current;
      set({ activeQuestions: questions, activeSession, isLoading: false });
      return questions;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  submitAnswer: async (
    sessionId: string,
    questionId: string,
    input: ISubmitAnswerInput,
  ): Promise<IInterviewQuestion | null> => {
    set({ isLoading: true, error: null });
    try {
      const updated = await submitAnswerRequest(sessionId, questionId, input);
      const current = get().activeSession;
      const activeQuestions = replaceQuestion(get().activeQuestions, updated);
      const activeSession =
        current !== null && current.id === sessionId
          ? { ...current, questions: replaceQuestion(current.questions, updated) }
          : current;
      set({ activeQuestions, activeSession, isLoading: false });
      return updated;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  evaluateAnswer: async (
    sessionId: string,
    questionId: string,
  ): Promise<IAnswerEvaluation | null> => {
    set({ isLoading: true, error: null });
    try {
      const evaluation = await evaluateAnswerRequest(sessionId, questionId);
      const current = get().activeSession;
      const applyEvaluation = (question: IInterviewQuestion): IInterviewQuestion =>
        question.id === questionId ? { ...question, evaluation } : question;
      const activeQuestions = get().activeQuestions.map(applyEvaluation);
      const activeSession =
        current !== null && current.id === sessionId
          ? { ...current, questions: current.questions.map(applyEvaluation) }
          : current;
      set({ activeQuestions, activeSession, isLoading: false });
      return evaluation;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  computeScorecard: async (
    sessionId: string,
  ): Promise<IPerformanceScorecard | null> => {
    set({ isLoading: true, error: null });
    try {
      const scorecard = await computeScorecardRequest(sessionId);
      const current = get().activeSession;
      const activeSession =
        current !== null && current.id === sessionId
          ? { ...current, scorecard }
          : current;
      set({ scorecard, activeSession, isLoading: false });
      return scorecard;
    } catch (cause) {
      // Preserve prior `scorecard` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  loadScorecard: async (
    sessionId: string,
  ): Promise<IPerformanceScorecard | null> => {
    set({ isLoading: true, error: null });
    try {
      const scorecard = await getScorecardRequest(sessionId);
      const current = get().activeSession;
      const activeSession =
        current !== null && current.id === sessionId
          ? { ...current, scorecard }
          : current;
      set({ scorecard, activeSession, isLoading: false });
      return scorecard;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  loadStories: async (): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const stories = await listStoriesRequest();
      set({ stories, isLoading: false });
    } catch (cause) {
      // Preserve prior `stories` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
    }
  },

  createStory: async (input: ICreateStarInput): Promise<IStarStory | null> => {
    set({ isLoading: true, error: null });
    try {
      const created = await createStoryRequest(input);
      set({ stories: [...get().stories, created], isLoading: false });
      return created;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  getStory: async (id: string): Promise<IStarStory | null> => {
    set({ isLoading: true, error: null });
    try {
      const story = await getStoryRequest(id);
      // Sync the fetched story into the list when it is already present.
      const stories = get().stories.map((existing) =>
        existing.id === story.id ? story : existing,
      );
      set({ stories, isLoading: false });
      return story;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  updateStory: async (
    id: string,
    input: IUpdateStarInput,
  ): Promise<IStarStory | null> => {
    set({ isLoading: true, error: null });
    try {
      const updated = await updateStoryRequest(id, input);
      const stories = get().stories.map((existing) =>
        existing.id === updated.id ? updated : existing,
      );
      set({ stories, isLoading: false });
      return updated;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  deleteStory: async (id: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      await deleteStoryRequest(id);
      const stories = get().stories.filter((existing) => existing.id !== id);
      set({ stories, isLoading: false });
      return true;
    } catch (cause) {
      // Preserve prior `stories` on failure.
      set({ isLoading: false, error: toStoreError(cause) });
      return false;
    }
  },

  clearError: (): void => {
    set({ error: null });
  },

  forceEndSession: async (
    sessionId: string,
  ): Promise<IInterviewSessionDetail | null> => {
    set({ isLoading: true, error: null });
    try {
      const detail = await forceEndSessionRequest(sessionId);
      set({
        activeSession: detail,
        activeQuestions: detail.questions,
        scorecard: detail.scorecard,
        isLoading: false,
      });
      return detail;
    } catch (cause) {
      set({ isLoading: false, error: toStoreError(cause) });
      return null;
    }
  },

  reset: (): void => {
    set({ ...initialState });
  },
}));
