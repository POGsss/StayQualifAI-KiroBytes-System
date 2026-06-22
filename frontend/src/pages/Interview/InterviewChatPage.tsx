/**
 * InterviewChatPage — Chat_View composition for the Interview Chat & Voice feature.
 *
 * Two views based on store state:
 *  - Session_Setup: mode/difficulty/count/JD/resume form, create → open → start lifecycle.
 *  - Chat_View: ChatThread, AnswerComposer, VoiceStage (orb), progress, completion + scorecard.
 *
 * Requirements: 1.1-1.9, 2.1-2.8, 4.1-4.7, 6.1-6.4, 7.1-7.6, 8.2-8.5, 9.3-9.6, 10.2-10.7
 */

import { type JSX, useEffect, useId, useRef, useState } from 'react';

import { AnswerComposer } from '../../components/AnswerComposer';
import { ChatThread } from '../../components/ChatThread';
import { ScoreDial } from '../../components/ScoreDial';
import { SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { VoiceOrb } from '../../components/VoiceOrb';
import { VoiceStage } from '../../components/VoiceStage';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { useInterviewStore } from '../../stores/interview.store';
import type {
  DifficultyTier,
  InterviewMode,
} from '../../types/interview.types';
import {
  computeResponseLatencySeconds,
  deriveChatThread,
} from '../../utils/interview.chat';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ANSWER_LENGTH = 5000;
const MIN_QUESTION_COUNT = 5;
const MAX_QUESTION_COUNT = 15;
const DEFAULT_QUESTION_COUNT = 5;
const MAX_JD_LENGTH = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// Shared Tailwind helpers
// ─────────────────────────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#1a1a1a] ' +
  'shadow-sm transition-colors placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus:border-[#9b5de5] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const INPUT_ERROR = 'border-red-400 focus:border-red-400 focus:ring-red-400/40';

const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium ' +
  'bg-[#9b5de5] text-white hover:bg-[#8a4fd4] active:bg-[#7a3fc4] transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus-visible:ring-2 ' +
  'focus-visible:ring-[#9b5de5]/50 disabled:cursor-not-allowed disabled:opacity-50';

// ─────────────────────────────────────────────────────────────────────────────
// Session Setup Form
// ─────────────────────────────────────────────────────────────────────────────

interface ISetupFormProps {
  isSttSupported: boolean;
  isLoading: boolean;
  onSubmit: (params: {
    mode: InterviewMode;
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }) => void;
}

function SessionSetupForm({ isSttSupported, isLoading, onSubmit }: ISetupFormProps): JSX.Element {
  const [mode, setMode] = useState<InterviewMode>('text');
  const [difficulty, setDifficulty] = useState<DifficultyTier>('ENTRY');
  const [questionCount, setQuestionCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [resumeVersionId, setResumeVersionId] = useState<string>('');

  const jdErrorId = useId();
  const countErrorId = useId();
  const voiceDisabledId = useId();

  const jdTrimmedLen = jobDescription.trim().length;
  const isJdEmpty = jdTrimmedLen === 0;
  const isJdOverLimit = jobDescription.length > MAX_JD_LENGTH;
  const isCountOutOfRange =
    !Number.isInteger(questionCount) ||
    questionCount < MIN_QUESTION_COUNT ||
    questionCount > MAX_QUESTION_COUNT;

  const isSubmitDisabled = isLoading || isJdEmpty || isJdOverLimit || isCountOutOfRange;

  const jdDescBy = [
    isJdOverLimit ? jdErrorId : null,
    isJdEmpty && jobDescription.length > 0 ? jdErrorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  const countDescBy = isCountOutOfRange ? countErrorId : undefined;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    onSubmit({ mode, difficulty, questionCount, jobDescription, resumeVersionId });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* ── Mode select (Req 1.1, 1.2, 8.2) ─────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-[#1a1a1a]">Answering mode</legend>
        <div className="flex gap-3">
          {(['text', 'voice'] as InterviewMode[]).map((m) => {
            const isVoice = m === 'voice';
            const isDisabled = isVoice && !isSttSupported;
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors
                  ${mode === m ? 'border-[#9b5de5] bg-[#9b5de5]/10 font-medium text-[#9b5de5]' : 'border-gray-200 bg-white text-[#1a1a1a] hover:border-[#9b5de5]/40'}
                  ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="interview-mode"
                  value={m}
                  checked={mode === m}
                  disabled={isDisabled}
                  onChange={() => setMode(m)}
                  aria-describedby={isDisabled ? voiceDisabledId : undefined}
                  className="sr-only"
                />
                {m === 'text' ? '⌨ Text' : '🎤 Voice'}
              </label>
            );
          })}
        </div>
        {!isSttSupported && (
          <p id={voiceDisabledId} className="mt-2 text-xs text-gray-500">
            Voice mode is not available in this browser. Text mode will be used.
          </p>
        )}

        {/* ── Voice mode preview ─────────────────────────────────────────── */}
        {mode === 'voice' && isSttSupported && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-[#e7d6f8] bg-[#f5eefc] p-5">
            {/* Orb preview — decorative only */}
            <VoiceOrb isActive isAISpeaking size={160} />

            {/* Explain the flow concisely */}
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-xs font-semibold text-[#7d3fd0]">
                This is a preview of your voice answer panel.
              </p>
              <p className="max-w-xs text-xs text-gray-500">
                After you start, the AI reads each question aloud. A large{' '}
                <strong className="text-gray-700">Start Speaking</strong> button
                will appear below the orb — press it to record your answer, then
                press <strong className="text-gray-700">Stop Recording</strong> to
                submit.
              </p>
            </div>

            {/* Mini mockup of the recording button so there's no surprise */}
            <div className="flex items-center gap-2 rounded-full bg-[#9b5de5] px-5 py-2.5 opacity-60">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="white" className="h-4 w-4 flex-shrink-0">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
                <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h-2v2h6v-2h-2v-2.06A9 9 0 0 0 21 11h-2Z" />
              </svg>
              <span className="text-xs font-semibold text-white">Start Speaking</span>
            </div>
            <p className="text-[10px] text-gray-400">← this button will be live during your interview</p>
          </div>
        )}
      </fieldset>

      {/* ── Difficulty select (Req 1.3) ───────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="difficulty-select" className="text-sm font-medium text-[#1a1a1a]">
          Difficulty
        </label>
        <select
          id="difficulty-select"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as DifficultyTier)}
          disabled={isLoading}
          className={INPUT_BASE}
        >
          <option value="ENTRY">Entry</option>
          <option value="MID">Mid</option>
          <option value="SENIOR">Senior</option>
          <option value="LEAD">Lead</option>
        </select>
      </div>

      {/* ── Question count (Req 1.4, 1.6) ────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="question-count" className="text-sm font-medium text-[#1a1a1a]">
          Number of questions
        </label>
        <input
          id="question-count"
          type="number"
          min={MIN_QUESTION_COUNT}
          max={MAX_QUESTION_COUNT}
          value={questionCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          disabled={isLoading}
          aria-describedby={countDescBy}
          className={`${INPUT_BASE} ${isCountOutOfRange ? INPUT_ERROR : ''}`}
        />
        {isCountOutOfRange && (
          <p id={countErrorId} role="alert" className="text-xs text-red-600">
            Question count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.
          </p>
        )}
      </div>

      {/* ── Job Description (Req 1.5) ─────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="job-description" className="text-sm font-medium text-[#1a1a1a]">
          Job description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="job-description"
          rows={6}
          placeholder="Paste the job description here (1–5,000 characters)…"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          disabled={isLoading}
          aria-required="true"
          aria-describedby={jdDescBy || undefined}
          className={`${INPUT_BASE} resize-none ${isJdOverLimit ? INPUT_ERROR : ''}`}
        />
        <div className="flex items-start justify-between gap-2">
          {isJdOverLimit ? (
            <p id={jdErrorId} role="alert" className="text-xs text-red-600">
              Job description is too long (max {MAX_JD_LENGTH.toLocaleString()} characters).
            </p>
          ) : isJdEmpty && jobDescription.length > 0 ? (
            <p id={jdErrorId} role="alert" className="text-xs text-red-600">
              Job description is required.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <span
            className={`ml-auto text-xs tabular-nums ${isJdOverLimit ? 'text-red-600 font-medium' : 'text-gray-400'}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {jobDescription.length.toLocaleString()} / {MAX_JD_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Optional resume version ID (Req 1.5) ─────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="resume-version-id" className="text-sm font-medium text-[#1a1a1a]">
          Resume version ID <span className="text-xs font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="resume-version-id"
          type="text"
          placeholder="e.g. abc123"
          value={resumeVersionId}
          onChange={(e) => setResumeVersionId(e.target.value)}
          disabled={isLoading}
          className={INPUT_BASE}
        />
      </div>

      {/* ── Submit (Req 1.7, 1.9) ─────────────────────────────────────────── */}
      <button type="submit" disabled={isSubmitDisabled} className={BTN_PRIMARY}>
        {isLoading ? 'Starting session…' : 'Start Interview'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorecard section (completion view)
// ─────────────────────────────────────────────────────────────────────────────

interface IScorecardSectionProps {
  sessionId: string;
  isLoading: boolean;
}

function ScorecardSection({ sessionId, isLoading }: IScorecardSectionProps): JSX.Element {
  const { scorecard, computeScorecard, error } = useInterviewStore();

  // One-request guard: track whether compute has been triggered (Req 7.4)
  const computeRequestedRef = useRef<boolean>(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState<boolean>(false);

  // If already SCORED, show existing scorecard without recompute (Req 7.5)
  const hasScorecard = scorecard !== null;

  const handleCompute = async (): Promise<void> => {
    if (computeRequestedRef.current || isComputing) return;
    computeRequestedRef.current = true;
    setIsComputing(true);
    setComputeError(null);
    const result = await computeScorecard(sessionId);
    setIsComputing(false);
    if (result === null) {
      // On failure, re-enable the button (Req 7.6)
      computeRequestedRef.current = false;
      setComputeError(error?.message ?? 'Failed to compute scorecard. Please try again.');
    }
  };

  if (isLoading || isComputing) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard />
      </div>
    );
  }

  if (!hasScorecard) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-base font-medium text-[#1a1a1a]">
          🎉 You completed the interview!
        </p>
        <p className="text-sm text-gray-600 text-center">
          View your performance scorecard with scores across all dimensions.
        </p>
        {computeError !== null && (
          <p role="alert" className="text-xs text-red-600">{computeError}</p>
        )}
        <button
          type="button"
          onClick={() => { void handleCompute(); }}
          disabled={isComputing}
          className={BTN_PRIMARY}
        >
          View Scorecard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">Performance Scorecard</h2>
        <TierBadge tier={scorecard.passFailTier} />
      </div>

      {/* Dimension dials (Req 7.2, 7.3) */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <ScoreDial score={scorecard.answerQualityScore} label="Answer Quality" />
        <ScoreDial score={scorecard.grammarScore} label="Grammar" />
        <ScoreDial score={scorecard.latencyScore} label="Response Speed" />
        <ScoreDial score={scorecard.pressureScore} label="Pressure Handling" />
      </div>

      {/* Overall score (Req 7.1) */}
      <div className="flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-500">Overall Score</p>
        <ScoreDial score={scorecard.overallScore} label="Overall" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * InterviewChatPage composes the full Interview Chat & Voice experience.
 *
 * - Session_Setup when no active session exists.
 * - Chat_View when an ACTIVE, COMPLETED, or SCORED session is loaded.
 *
 * All domain data flows through useInterviewStore. No direct service/Supabase calls.
 */
export function InterviewChatPage(): JSX.Element {
  const {
    activeSession,
    activeQuestions,
    isLoading,
    error: storeError,
    createSession,
    openSession,
    startSession,
    submitAnswer,
    clearError,
  } = useInterviewStore();

  // ── Speech hooks (device/transcript state — local, not in the store) ──────
  const recognition = useSpeechRecognition();
  const synthesis = useSpeechSynthesis();

  // ── Local UI state ────────────────────────────────────────────────────────
  /** Mode is retained for the full session; survives navigation between questions. */
  const [sessionMode, setSessionMode] = useState<InterviewMode>('text');

  /** Fallback notice shown when voice degrades to text (Req 8.3, 9.3). */
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  /** Whether a submit is currently in flight. */
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  /** Error from the setup form submission. */
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Presentation timestamps (Req 6.1): useRef so re-renders never overwrite ──
  const presentedAtMap = useRef<Map<string, number>>(new Map());

  // ── Derive thread from store questions ────────────────────────────────────
  const { messages, currentQuestion, answeredCount, totalCount } =
    deriveChatThread(activeQuestions);

  // ── Track previous question id to detect when a new question appears ─────
  const prevCurrentQuestionIdRef = useRef<string | null>(null);

  // ── Stamp presentation timestamp + trigger TTS on new current question ────
  useEffect(() => {
    if (currentQuestion === null) return;

    const isNew = prevCurrentQuestionIdRef.current !== currentQuestion.id;
    prevCurrentQuestionIdRef.current = currentQuestion.id;

    if (isNew) {
      // Stamp exactly once (Req 6.1)
      if (!presentedAtMap.current.has(currentQuestion.id)) {
        presentedAtMap.current.set(currentQuestion.id, Date.now());
      }

      // TTS: speak when first presented in voice mode (Req 4.1)
      if (sessionMode === 'voice' && synthesis.isSupported) {
        synthesis.speak(currentQuestion.text);
      }

      // Clear the previous transcript for the new question
      recognition.clearTranscript();
    }
  }, [currentQuestion, sessionMode, synthesis, recognition]);

  // ── Fallback orchestration: watch recognition errors/permissions (Req 8.3, 9.3) ──
  useEffect(() => {
    if (sessionMode !== 'voice') return;

    const { error: recogError, permission } = recognition;

    if (recogError === 'audio-capture' || permission === 'denied') {
      setSessionMode('text');
      if (permission === 'denied') {
        setFallbackNotice(
          'Microphone permission was denied. Switched to text mode. ' +
          'Your current transcript has been preserved.',
        );
      } else {
        setFallbackNotice(
          'Voice capture stopped unexpectedly. Switched to text mode. ' +
          'Your current transcript has been preserved.',
        );
      }
    }
  }, [recognition, recognition.error, recognition.permission, sessionMode]);

  // ── Session Setup submit handler (Req 1.7, 1.8) ──────────────────────────
  const handleSetupSubmit = async (params: {
    mode: InterviewMode;
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }): Promise<void> => {
    setSetupError(null);
    clearError();

    // Step 1: createSession
    const created = await createSession({
      difficultyTier: params.difficulty,
      jobDescription: params.jobDescription,
      questionCount: params.questionCount,
      resumeVersionId: params.resumeVersionId.trim() || undefined,
    });

    if (created === null) {
      setSetupError(storeError?.message ?? 'Failed to create session. Please try again.');
      return;
    }

    // Step 2: openSession
    const detail = await openSession(created.id);
    if (detail === null) {
      setSetupError(storeError?.message ?? 'Failed to open session. Please try again.');
      return;
    }

    // Step 3: startSession — retain mode in local state (Req 1.3, 1.4)
    const questions = await startSession(created.id);
    if (questions === null) {
      setSetupError(storeError?.message ?? 'Failed to start session. Please try again.');
      return;
    }

    // Retain selected mode for the entire session (Req 1.3)
    setSessionMode(params.mode);
    setFallbackNotice(null);
    // Reset timestamps for the new session
    presentedAtMap.current.clear();
    prevCurrentQuestionIdRef.current = null;
  };

  // ── Answer submit handler (Req 6.2, 6.3, 6.4, 5.10) ─────────────────────
  const handleSend = async (answerText: string): Promise<void> => {
    if (currentQuestion === null || activeSession === null) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    const presentedAt = presentedAtMap.current.get(currentQuestion.id);
    const responseLatencySeconds = computeResponseLatencySeconds(presentedAt, Date.now());

    await submitAnswer(activeSession.id, currentQuestion.id, {
      answerText,
      responseLatencySeconds,
    });

    setIsSubmitting(false);

    // Cancel any in-flight TTS playback on submit
    if (synthesis.isSpeaking) {
      synthesis.cancel();
    }
  };

  // ── TTS replay/stop handlers ──────────────────────────────────────────────
  const handleReplay = (): void => {
    if (currentQuestion !== null && synthesis.isSupported) {
      synthesis.speak(currentQuestion.text);
    }
  };

  const handleStop = (): void => {
    synthesis.cancel();
  };

  // ── Session state shortcuts ───────────────────────────────────────────────
  const sessionState = activeSession?.state ?? null;
  const isActiveSession =
    sessionState === 'ACTIVE' ||
    sessionState === 'COMPLETED' ||
    sessionState === 'SCORED';
  const isCompleted = sessionState === 'COMPLETED' || sessionState === 'SCORED';

  // ── Render: no active session → Session_Setup ─────────────────────────────
  if (!isActiveSession) {
    return (
      <main className="flex flex-col gap-8 p-6" aria-label="Interview setup">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-[#1a1a1a]">Start an Interview</h1>
          <p className="text-sm text-gray-500">
            Configure your session and practice answering questions in text or voice mode.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {setupError !== null && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800"
            >
              {setupError}
            </div>
          )}
          <SessionSetupForm
            isSttSupported={recognition.isSupported}
            isLoading={isLoading}
            onSubmit={(params) => { void handleSetupSubmit(params); }}
          />
        </div>
      </main>
    );
  }

  // ── Render: Chat_View ─────────────────────────────────────────────────────
  const showComposer = !isCompleted && currentQuestion !== null;
  const showVoiceTtsMissing = sessionMode === 'voice' && !synthesis.isSupported;
  const showTtsError = synthesis.error !== null;

  return (
    <main className="flex flex-col gap-4 p-4 sm:p-6" aria-label="Interview chat">
      {/* ── Header: progress indicator (Req 2.6) ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Interview</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-[#9b5de5]">{answeredCount}</span>
            {' / '}
            <span className="font-semibold">{totalCount}</span>
            {' answered'}
          </span>
          {/* Progress bar */}
          <div
            className="h-2 w-24 overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-label="Interview progress"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
          >
            <div
              className="h-full rounded-full bg-[#9b5de5] transition-all duration-300"
              style={{ width: totalCount > 0 ? `${(answeredCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* ── Store error banner ─────────────────────────────────────────────── */}
      {storeError !== null && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800"
        >
          {storeError.message}
          <button
            type="button"
            onClick={clearError}
            className="ml-3 text-red-600 underline hover:no-underline focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── TTS not supported notice (Req 4.5) ────────────────────────────── */}
      {showVoiceTtsMissing && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800"
        >
          Text-to-speech is not available in this browser. Questions are shown as captions below.
        </p>
      )}

      {/* ── TTS error notice (Req 4.7) ────────────────────────────────────── */}
      {showTtsError && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800"
        >
          Audio playback failed. The question is shown as a caption below.
        </p>
      )}

      {/* ── Chat thread (Req 2.1–2.8, 10.1, 10.5) ───────────────────────── */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        {isLoading && messages.length === 0 ? (
          <div className="p-4">
            <SkeletonCard />
          </div>
        ) : (
          <ChatThread
            messages={messages}
            liveRegionLabel="Interview conversation"
          />
        )}
      </div>

      {/* ── Voice stage: orb + tap-to-speak + status + playback (Req 4.3, 4.4, 12) ── */}
      {sessionMode === 'voice' && !isCompleted && (
        <VoiceStage
          liveTranscript={recognition.transcript}
          isListening={recognition.isListening}
          isSpeaking={synthesis.isSpeaking}
          isProcessing={isSubmitting}
          isSttSupported={recognition.isSupported}
          isTtsSupported={synthesis.isSupported}
          onMicToggle={() => {
            if (recognition.isListening) {
              recognition.stopListening();
            } else {
              recognition.startListening();
            }
          }}
          onReplay={handleReplay}
          onStop={handleStop}
        />
      )}

      {/* ── Answer Composer (hidden when COMPLETED/SCORED — Req 7.1) ──────── */}
      {showComposer && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <AnswerComposer
            mode={sessionMode}
            isSubmitting={isSubmitting}
            recognition={recognition}
            onSend={(answerText) => { void handleSend(answerText); }}
            fallbackNotice={fallbackNotice}
            maxLength={MAX_ANSWER_LENGTH}
          />
        </div>
      )}

      {/* ── Completion / Scorecard (Req 7.1–7.6) ────────────────────────── */}
      {isCompleted && activeSession !== null && (
        <ScorecardSection
          sessionId={activeSession.id}
          isLoading={isLoading}
        />
      )}
    </main>
  );
}
