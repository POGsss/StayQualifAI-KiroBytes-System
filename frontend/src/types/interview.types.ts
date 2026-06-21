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

// ─────────────────────────────────────────────────────────────────────────────
// UI Types (frontend-only)
//
// These types describe view/device state that never crosses the API boundary.
// They have no backend counterpart — the type-mirroring rule does not apply.
// Named exports, explicit shapes, no `any`.
// ─────────────────────────────────────────────────────────────────────────────

/** Answering mode chosen at Session_Setup (Req 1.1, 1.3). */
export type InterviewMode = 'text' | 'voice';

/** Role of a single Chat_Message (Req 2.1). */
export type ChatRole = 'assistant' | 'user';

/**
 * A single entry in the Chat_Thread. Derived from a session's questions and
 * answers — NOT persisted and NOT sent to the backend (Req 2.1).
 */
export interface ChatMessage {
  /** Stable key: `${questionId}:${role}`. */
  id: string;
  role: ChatRole;
  /** Caption text always rendered (Req 10.1). */
  text: string;
  /** 1-based source question position, for ordering/keys (Req 2.2). */
  position: number;
}

/** Result of deriving the thread from session state (Req 2.2–2.8). */
export interface IDerivedThread {
  messages: ChatMessage[];
  /** Lowest-positioned unanswered question, or null when none remain (Req 2.5). */
  currentQuestion: IInterviewQuestion | null;
  answeredCount: number;
  totalCount: number;
}

/** Pure speech-accumulator state for the STT reducer (Req 5.5–5.7). */
export interface ISpeechState {
  /** Committed, finalized transcript segments joined. */
  finalText: string;
  /** Current interim (not yet finalized) text. */
  interimText: string;
  /** True while the user intends capture to continue (drives auto-restart). */
  capturing: boolean;
}

/** Events fed to the pure `speechReducer`. */
export type SpeechEvent =
  | { kind: 'start' }
  | { kind: 'result'; finalChunk: string | null; interim: string }
  | { kind: 'end' } // session ended (may auto-restart if still capturing)
  | { kind: 'stop' }; // user stopped → flush interim, no restart

/** Microphone permission state derived from prompt/onerror (Req 9). */
export type SpeechPermission = 'unknown' | 'granted' | 'denied' | 'dismissed';

/** Error kind reported by the SpeechRecognition API (Req 8.3, 9.3). */
export type SpeechRecognitionErrorKind = string;
