/**
 * Shared TypeScript types for the Interview module.
 *
 * These definitions are mirrored (duplicated, not symlinked) between
 * `backend/src/types/interview.types.ts` and `frontend/src/types/interview.types.ts`
 * to keep the backend and frontend in sync.
 *
 * Named exports only. No `any`.
 */

// Enumerated domain values
export type DifficultyTier = 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD';
export type LifecycleState = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'SCORED';
export type PassFailTier = 'PASS' | 'FAIL';

export interface IAnswerEvaluation {
  qualityScore: number; // integer 0..100
  grammarScore: number; // integer 0..100
  feedbackComment: string; // 1..2000 chars, non-empty
}

export interface IInterviewQuestion {
  id: string;
  sessionId: string;
  position: number; // 1-based index, unique within session
  text: string; // non-empty, unique within session
  answerText: string | null;
  responseLatencySeconds: number | null; // >= 0
  evaluation: IAnswerEvaluation | null;
}

export interface IInterviewSession {
  id: string;
  userId: string;
  state: LifecycleState;
  difficultyTier: DifficultyTier;
  jobDescription: string; // 1..5000 chars
  questionCount: number; // 5..15 inclusive
  resumeVersionId: string | null; // reference into resume module data
  createdAt: string;
}

export interface IInterviewSessionDetail extends IInterviewSession {
  questions: IInterviewQuestion[]; // ordered by position
  scorecard: IPerformanceScorecard | null;
}

export interface IInterviewSessionSummary {
  id: string;
  state: LifecycleState;
  difficultyTier: DifficultyTier;
  createdAt: string;
  overallScore: number | null; // from scorecard if present
  passFailTier: PassFailTier | null;
}

export interface IPerformanceScorecard {
  sessionId: string;
  answerQualityScore: number; // integer 0..100
  grammarScore: number; // integer 0..100
  latencyScore: number; // integer 0..100
  pressureScore: number; // integer 0..100
  overallScore: number; // integer 0..100
  passFailTier: PassFailTier; // PASS if overall >= 70 else FAIL
  createdAt: string;
}

export interface IStarStory {
  id: string;
  title: string; // 1..200 chars
  situation: string; // 1..2000 chars
  task: string; // 1..2000 chars
  action: string; // 1..2000 chars
  result: string; // 1..2000 chars
  createdAt: string;
}

// Input types (request payloads)

export interface ICreateSessionInput {
  difficultyTier: DifficultyTier;
  jobDescription: string; // 1..5000 chars
  questionCount: number; // 5..15 inclusive
  resumeVersionId?: string; // optional reference into resume module data
}

export interface ISubmitAnswerInput {
  answerText: string; // 1..5000 chars
  responseLatencySeconds: number; // >= 0
}

export interface ICreateStarInput {
  title: string; // 1..200 chars
  situation: string; // 1..2000 chars
  task: string; // 1..2000 chars
  action: string; // 1..2000 chars
  result: string; // 1..2000 chars
}

export interface IUpdateStarInput {
  title?: string; // 1..200 chars
  situation?: string; // 1..2000 chars
  task?: string; // 1..2000 chars
  action?: string; // 1..2000 chars
  result?: string; // 1..2000 chars
}

// API envelope (platform-consistent { data, error, meta } shape)

export interface IApiResponse<T> {
  data: T | null;
  error: IApiError | null;
  meta: IApiMeta;
}

// Single-resource responses set meta to null; list responses carry { total }.
export type IApiMeta =
  | ({ requestId: string; timestamp: string } & { total?: number })
  | null;

export interface IApiError {
  code: string;
  message: string;
  details?: unknown;
}
