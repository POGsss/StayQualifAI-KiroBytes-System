/**
 * InterviewChatPage — pure-voice mock interview experience.
 *
 * Flow:
 *  - Session_Setup: difficulty / question-count / job-description / optional
 *    resume form → create → open → start.
 *  - Voice_Chat: the AI interviewer SPEAKS each question (text-to-speech) and
 *    the user ANSWERS by speaking (speech recognition). The spoken transcript
 *    is captured live, can be corrected by typing, and submitted to advance to
 *    the next question. When every question is answered the session is refreshed
 *    to its COMPLETED state and the performance scorecard CTA appears.
 *
 * Voice is the primary interaction. When the browser lacks the Web Speech APIs
 * the page degrades gracefully to an editable text box so the interview is
 * still completable.
 *
 * All domain data flows through `useInterviewStore`; no direct service/Supabase
 * calls. Speech device state lives in the local speech hooks.
 */

import { type JSX, useEffect, useRef, useState } from 'react';

import { ChatThread } from '../../components/ChatThread';
import { ScoreDial } from '../../components/ScoreDial';
import { SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { VoiceOrb } from '../../components/VoiceOrb';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { useInterviewStore } from '../../stores/interview.store';
import type { DifficultyTier } from '../../types/interview.types';
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
// Session Setup Form (voice-first — no mode toggle)
// ─────────────────────────────────────────────────────────────────────────────

interface ISetupFormProps {
  isSttSupported: boolean;
  isTtsSupported: boolean;
  isLoading: boolean;
  onSubmit: (params: {
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }) => void;
}

function SessionSetupForm({
  isSttSupported,
  isTtsSupported,
  isLoading,
  onSubmit,
}: ISetupFormProps): JSX.Element {
  const [difficulty, setDifficulty] = useState<DifficultyTier>('ENTRY');
  const [questionCount, setQuestionCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [resumeVersionId, setResumeVersionId] = useState<string>('');

  const jdTrimmedLen = jobDescription.trim().length;
  const isJdEmpty = jdTrimmedLen === 0;
  const isJdOverLimit = jobDescription.length > MAX_JD_LENGTH;
  const isCountOutOfRange =
    !Number.isInteger(questionCount) ||
    questionCount < MIN_QUESTION_COUNT ||
    questionCount > MAX_QUESTION_COUNT;

  const isSubmitDisabled = isLoading || isJdEmpty || isJdOverLimit || isCountOutOfRange;

  const voiceReady = isSttSupported && isTtsSupported;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    onSubmit({ difficulty, questionCount, jobDescription, resumeVersionId });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* ── Voice readiness banner ──────────────────────────────────────── */}
      <div
        role="status"
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
          voiceReady
            ? 'border-[#00F5D4]/40 bg-[#00F5D4]/10 text-[#0b6b60]'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {voiceReady ? '🎙️' : '⚠️'}
        </span>
        <p>
          {voiceReady ? (
            <>
              This is a <strong>voice interview</strong>. The AI interviewer will
              read each question aloud, then listen to your spoken answer. Make
              sure your microphone is enabled.
            </>
          ) : (
            <>
              Your browser doesn&apos;t fully support in-browser speech
              {!isTtsSupported && !isSttSupported
                ? ' (text-to-speech and microphone capture)'
                : !isTtsSupported
                  ? ' (text-to-speech)'
                  : ' (microphone capture)'}
              . You can still complete the interview by typing your answers. For
              the full voice experience, use a recent version of Chrome or Edge.
            </>
          )}
        </p>
      </div>

      {/* ── Difficulty select ─────────────────────────────────────────────── */}
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

      {/* ── Question count ───────────────────────────────────────────────── */}
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
          className={`${INPUT_BASE} ${isCountOutOfRange ? INPUT_ERROR : ''}`}
        />
        {isCountOutOfRange && (
          <p role="alert" className="text-xs text-red-600">
            Question count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.
          </p>
        )}
      </div>

      {/* ── Job Description ───────────────────────────────────────────────── */}
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
          className={`${INPUT_BASE} resize-none ${isJdOverLimit ? INPUT_ERROR : ''}`}
        />
        <div className="flex items-start justify-between gap-2">
          {isJdOverLimit ? (
            <p role="alert" className="text-xs text-red-600">
              Job description is too long (max {MAX_JD_LENGTH.toLocaleString()} characters).
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <span
            className={`ml-auto text-xs tabular-nums ${isJdOverLimit ? 'text-red-600 font-medium' : 'text-gray-400'}`}
            aria-live="polite"
          >
            {jobDescription.length.toLocaleString()} / {MAX_JD_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Optional resume version ID ────────────────────────────────────── */}
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

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <button type="submit" disabled={isSubmitDisabled} className={BTN_PRIMARY}>
        {isLoading ? 'Starting session…' : '🎤 Start Voice Interview'}
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

  const computeRequestedRef = useRef<boolean>(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState<boolean>(false);

  const hasScorecard = scorecard !== null;

  const handleCompute = async (): Promise<void> => {
    if (computeRequestedRef.current || isComputing) return;
    computeRequestedRef.current = true;
    setIsComputing(true);
    setComputeError(null);
    const result = await computeScorecard(sessionId);
    setIsComputing(false);
    if (result === null) {
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
        <p className="text-base font-medium text-[#1a1a1a]">🎉 You completed the interview!</p>
        <p className="text-sm text-gray-600 text-center">
          Generate your performance scorecard with scores across all dimensions.
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

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <ScoreDial score={scorecard.answerQualityScore} label="Answer Quality" />
        <ScoreDial score={scorecard.grammarScore} label="Grammar" />
        <ScoreDial score={scorecard.latencyScore} label="Response Speed" />
        <ScoreDial score={scorecard.pressureScore} label="Pressure Handling" />
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-500">Overall Score</p>
        <ScoreDial score={scorecard.overallScore} label="Overall" />
      </div>

      <p className="text-center text-xs text-gray-400">
        You can revisit this scorecard any time from the Sessions tab.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

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
    reset,
  } = useInterviewStore();

  // ── Speech hooks ──────────────────────────────────────────────────────────
  const recognition = useSpeechRecognition();
  const synthesis = useSpeechSynthesis();

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [answerDraft, setAnswerDraft] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Per-question presentation timestamps (for latency scoring).
  const presentedAtMap = useRef<Map<string, number>>(new Map());
  const prevQuestionIdRef = useRef<string | null>(null);
  // True while we are waiting for the spoken question to finish before listening.
  const pendingAutoListenRef = useRef<boolean>(false);
  const prevSpeakingRef = useRef<boolean>(false);

  // ── Derive thread from store questions ────────────────────────────────────
  const { messages, currentQuestion, answeredCount, totalCount } =
    deriveChatThread(activeQuestions);

  // ── Mirror the live transcript into the editable draft ────────────────────
  useEffect(() => {
    if (recognition.transcript.length > 0) {
      setAnswerDraft(recognition.transcript);
    }
  }, [recognition.transcript]);

  // ── On a new current question: stamp time, speak it, then auto-listen ─────
  useEffect(() => {
    if (currentQuestion === null) return;

    const isNew = prevQuestionIdRef.current !== currentQuestion.id;
    if (!isNew) return;
    prevQuestionIdRef.current = currentQuestion.id;

    if (!presentedAtMap.current.has(currentQuestion.id)) {
      presentedAtMap.current.set(currentQuestion.id, Date.now());
    }

    // Reset answer surfaces for the new question.
    recognition.clearTranscript();
    setAnswerDraft('');

    if (synthesis.isSupported) {
      // Speak the question; auto-start the mic once playback finishes.
      pendingAutoListenRef.current = true;
      synthesis.speak(currentQuestion.text);
    } else if (recognition.isSupported) {
      // No TTS — start listening straight away.
      recognition.startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  // ── Auto-start the mic when the spoken question finishes ──────────────────
  useEffect(() => {
    const wasSpeaking = prevSpeakingRef.current;
    prevSpeakingRef.current = synthesis.isSpeaking;

    if (
      wasSpeaking &&
      !synthesis.isSpeaking &&
      pendingAutoListenRef.current &&
      recognition.isSupported &&
      !recognition.isListening
    ) {
      pendingAutoListenRef.current = false;
      recognition.startListening();
    }
  }, [synthesis.isSpeaking, recognition]);

  // ── Setup submit handler ──────────────────────────────────────────────────
  const handleSetupSubmit = async (params: {
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }): Promise<void> => {
    setSetupError(null);
    clearError();

    // Read the freshest store error after each await — `storeError` from the
    // render closure is stale and would mask the real backend message
    // (e.g. a 401 "Invalid or expired authentication token").
    const latestError = (fallback: string): string =>
      useInterviewStore.getState().error?.message ?? fallback;

    const created = await createSession({
      difficultyTier: params.difficulty,
      jobDescription: params.jobDescription,
      questionCount: params.questionCount,
      ...(params.resumeVersionId.trim().length > 0
        ? { resumeVersionId: params.resumeVersionId.trim() }
        : {}),
    });
    if (created === null) {
      setSetupError(latestError('Failed to create session. Please try again.'));
      return;
    }

    const detail = await openSession(created.id);
    if (detail === null) {
      setSetupError(latestError('Failed to open session. Please try again.'));
      return;
    }

    const questions = await startSession(created.id);
    if (questions === null) {
      setSetupError(latestError('Failed to start session. Please try again.'));
      return;
    }

    // Fresh session — reset all per-question tracking.
    presentedAtMap.current.clear();
    prevQuestionIdRef.current = null;
    pendingAutoListenRef.current = false;
    setAnswerDraft('');
  };

  // ── Answer submit handler ─────────────────────────────────────────────────
  const handleSend = async (): Promise<void> => {
    if (currentQuestion === null || activeSession === null) return;
    if (isSubmitting) return;

    const answerText = answerDraft.trim();
    if (answerText.length === 0 || answerText.length > MAX_ANSWER_LENGTH) return;

    setIsSubmitting(true);

    // Stop any capture/playback before submitting.
    if (recognition.isListening) recognition.stopListening();
    if (synthesis.isSpeaking) synthesis.cancel();
    pendingAutoListenRef.current = false;

    const presentedAt = presentedAtMap.current.get(currentQuestion.id);
    const responseLatencySeconds = computeResponseLatencySeconds(presentedAt, Date.now());

    const updated = await submitAnswer(activeSession.id, currentQuestion.id, {
      answerText,
      responseLatencySeconds,
    });

    // When the final answer is submitted the question list has no more
    // unanswered questions, but the store leaves session.state untouched.
    // Re-open the session so its lifecycle state advances to COMPLETED and the
    // scorecard CTA appears.
    if (updated !== null && answeredCount + 1 >= totalCount) {
      await openSession(activeSession.id);
    }

    setIsSubmitting(false);
  };

  // ── Mic + playback controls ───────────────────────────────────────────────
  const handleMicToggle = (): void => {
    if (recognition.isListening) {
      recognition.stopListening();
    } else {
      recognition.startListening();
    }
  };

  const handleReplay = (): void => {
    if (currentQuestion !== null && synthesis.isSupported) {
      pendingAutoListenRef.current = false;
      synthesis.speak(currentQuestion.text);
    }
  };

  const handleEndSession = (): void => {
    if (recognition.isListening) recognition.stopListening();
    if (synthesis.isSpeaking) synthesis.cancel();
    presentedAtMap.current.clear();
    prevQuestionIdRef.current = null;
    pendingAutoListenRef.current = false;
    setAnswerDraft('');
    reset();
  };

  // ── Session state shortcuts ───────────────────────────────────────────────
  const sessionState = activeSession?.state ?? null;
  const isActiveSession =
    sessionState === 'ACTIVE' || sessionState === 'COMPLETED' || sessionState === 'SCORED';
  const isCompleted = sessionState === 'COMPLETED' || sessionState === 'SCORED';

  // ── Render: Session_Setup ─────────────────────────────────────────────────
  if (!isActiveSession) {
    return (
      <main className="flex flex-col gap-8 p-6" aria-label="Interview setup">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-[#1a1a1a]">Start a Voice Interview</h1>
          <p className="text-sm text-gray-500">
            Configure your session. The AI interviewer speaks each question and
            listens to your spoken answer.
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
            isTtsSupported={synthesis.isSupported}
            isLoading={isLoading}
            onSubmit={(params) => { void handleSetupSubmit(params); }}
          />
        </div>
      </main>
    );
  }

  // ── Render: Voice_Chat ────────────────────────────────────────────────────
  const draftTrimmedLen = answerDraft.trim().length;
  const isOverLimit = answerDraft.length > MAX_ANSWER_LENGTH;
  const isSendDisabled = isSubmitting || draftTrimmedLen === 0 || isOverLimit;
  const showAnswerPanel = !isCompleted && currentQuestion !== null;
  const permissionDenied = recognition.permission === 'denied';

  return (
    <main className="flex flex-col gap-4 p-4 sm:p-6" aria-label="Voice interview">
      {/* ── Header: progress + end-session ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Voice Interview</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-[#9b5de5]">{answeredCount}</span>
            {' / '}
            <span className="font-semibold">{totalCount}</span>
            {' answered'}
          </span>
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
          <button
            type="button"
            onClick={handleEndSession}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/40"
          >
            End session
          </button>
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
            className="ml-3 text-red-600 underline hover:no-underline focus:outline-none"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Chat thread (captions of the conversation) ─────────────────────── */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        {isLoading && messages.length === 0 ? (
          <div className="p-4">
            <SkeletonCard />
          </div>
        ) : (
          <ChatThread messages={messages} liveRegionLabel="Interview conversation" />
        )}
      </div>

      {/* ── Voice answer panel ─────────────────────────────────────────────── */}
      {showAnswerPanel && (
        <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-sm">
          {/* Decorative audio-reactive orb behind the mic */}
          <VoiceOrb isActive={recognition.isListening || synthesis.isSpeaking} />

          {/* Playback status / replay */}
          <div className="relative z-10 flex items-center gap-3">
            {synthesis.isSupported && (
              <button
                type="button"
                onClick={handleReplay}
                disabled={synthesis.isSpeaking}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#9b5de5]/10 px-3 py-1.5 text-xs font-medium text-[#9b5de5] hover:bg-[#9b5de5]/20 focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/40 disabled:opacity-50"
              >
                🔊 Replay question
              </button>
            )}
            <span aria-live="polite" className="text-xs italic text-gray-500">
              {synthesis.isSpeaking
                ? 'Interviewer is speaking…'
                : recognition.isListening
                  ? 'Listening — speak your answer'
                  : 'Press the mic to answer'}
            </span>
          </div>

          {/* Big mic control */}
          {recognition.isSupported ? (
            <button
              type="button"
              onClick={handleMicToggle}
              disabled={synthesis.isSpeaking || isSubmitting}
              aria-pressed={recognition.isListening}
              aria-label={recognition.isListening ? 'Stop speaking' : 'Start speaking'}
              className={`relative z-10 inline-flex h-20 w-20 items-center justify-center rounded-full text-3xl shadow-md transition-transform focus:outline-none focus:ring-4 focus:ring-[#9b5de5]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                recognition.isListening
                  ? 'animate-pulse bg-red-500 text-white hover:scale-105'
                  : 'bg-[#9b5de5] text-white hover:scale-105 hover:bg-[#8a4fd4]'
              }`}
            >
              {recognition.isListening ? '⏹' : '🎤'}
            </button>
          ) : (
            <p className="relative z-10 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
              Microphone capture isn&apos;t available in this browser — type your
              answer below instead.
            </p>
          )}

          <p className="relative z-10 text-xs font-medium text-gray-500">
            {recognition.isListening ? 'Tap to stop & review' : 'Tap to start speaking'}
          </p>

          {/* Permission-denied guidance */}
          {permissionDenied && (
            <p
              role="alert"
              className="relative z-10 w-full rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800"
            >
              Microphone access was denied. Open your browser&apos;s site settings,
              set the microphone permission to <strong>Allow</strong>, then reload
              the page. You can also type your answer below.
            </p>
          )}

          {/* Editable transcript (correction + fallback) */}
          <div className="relative z-10 flex w-full flex-col gap-2">
            <label htmlFor="answer-draft" className="text-xs font-medium text-gray-600">
              Your answer {recognition.isListening ? '(transcribing — edit any time)' : '(review or edit before sending)'}
            </label>
            <textarea
              id="answer-draft"
              rows={4}
              placeholder="Your spoken answer appears here. You can also type or correct it."
              value={answerDraft}
              onChange={(e) => setAnswerDraft(e.target.value)}
              disabled={isSubmitting}
              className={`${INPUT_BASE} resize-none ${isOverLimit ? INPUT_ERROR : ''}`}
            />
            <div className="flex items-center justify-between gap-2">
              {isOverLimit ? (
                <p role="alert" className="text-xs text-red-600">
                  Answer is too long (max {MAX_ANSWER_LENGTH.toLocaleString()} characters).
                </p>
              ) : (
                <span aria-hidden="true" />
              )}
              <span
                className={`ml-auto text-xs tabular-nums ${isOverLimit ? 'text-red-600 font-medium' : 'text-gray-400'}`}
              >
                {answerDraft.length.toLocaleString()} / {MAX_ANSWER_LENGTH.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              onClick={() => { void handleSend(); }}
              disabled={isSendDisabled}
              className={`${BTN_PRIMARY} w-full`}
            >
              {isSubmitting
                ? 'Submitting…'
                : answeredCount + 1 >= totalCount
                  ? 'Submit & Finish Interview'
                  : 'Submit & Next Question'}
            </button>
          </div>
        </div>
      )}

      {/* ── Completion / Scorecard ─────────────────────────────────────────── */}
      {isCompleted && activeSession !== null && (
        <ScorecardSection sessionId={activeSession.id} isLoading={isLoading} />
      )}
    </main>
  );
}
