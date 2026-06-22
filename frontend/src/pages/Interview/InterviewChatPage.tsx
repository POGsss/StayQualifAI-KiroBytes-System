/**
 * InterviewChatPage — the Bauhaus "AI interview command center".
 *
 * Layout (matches docs/GLOBAL_REDESIGN.md §2 + the Figma interview wireframe):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Interview workspace card                                      │
 *   │   ┌───────────────┐        ┌───────────────┐                  │
 *   │   │ AI Interviewer │       │   Candidate    │  (participants)  │
 *   │   └───────────────┘        └───────────────┘                  │
 *   │            ( 🎤   ☎ end   ⚙ )   centered call controls         │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌────────────────────────────┐  ┌──────────────────────────────┐
 *   │ Interview Setup (left)      │  │ Interview Transcript (right) │
 *   │  · Difficulty               │  │  · Questions                 │
 *   │  · Number of questions      │  │  · Answers                   │
 *   │  · Job Description           │  │  · Real-time conversation    │
 *   │  · Start Interview           │  │    feed                      │
 *   └────────────────────────────┘  └──────────────────────────────┘
 *
 * Flow (unchanged from the voice-first experience):
 *  - Setup: difficulty / question-count / job-description / optional resume →
 *    createSession → openSession → startSession.
 *  - Active: the AI interviewer SPEAKS each question (text-to-speech) and the
 *    candidate ANSWERS by speaking (speech recognition). The mic control lives
 *    in the centered call-control bar; the live transcript is captured into the
 *    editable answer panel (left) and the running conversation is rendered in
 *    the transcript panel (right). When every question is answered the session
 *    refreshes to COMPLETED and the performance scorecard appears.
 *
 * Voice is the primary interaction; when the browser lacks the Web Speech APIs
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
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';
import { useInterviewStore } from '../../stores/interview.store';
// The optional "resume version" picker lists the signed-in user's saved resume
// versions. Reading them through the resume store keeps the frontend on its
// standard component → store → service data path (the interview session simply
// references a resume-module id).
import { useResumeStore } from '../../stores/resume.store';
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
// Shared Tailwind helpers (Bauhaus tokens — no purple)
// ─────────────────────────────────────────────────────────────────────────────

const INPUT_BASE =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-ink ' +
  'shadow-sm transition-colors placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const INPUT_ERROR = 'border-accent-red focus:border-accent-red focus:ring-accent-red/40';

const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold ' +
  'bg-primary text-white hover:bg-primary-600 active:bg-primary-700 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus-visible:ring-2 ' +
  'focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50';

// Setup-form fields — Bauhaus "filled" inputs matching the Figma wireframe:
// soft gray fill, rounded-[15px], no visible border, gray placeholder text.
const SETUP_INPUT =
  'w-full rounded-[15px] border border-transparent bg-[#f0f0f0] px-5 py-2.5 text-sm text-ink ' +
  'placeholder:text-[#1d1d1d]/50 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

// "Start Interview" CTA — dark pill exactly as in the Figma wireframe.
const BTN_START =
  'inline-flex items-center justify-center rounded-[10px] bg-ink px-5 py-2.5 text-sm font-medium ' +
  'text-white transition-colors hover:bg-ink/90 ' +
  'focus:outline-none focus:ring-2 focus:ring-ink/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

// ─────────────────────────────────────────────────────────────────────────────
// Icons (aria-hidden; accessible names live on the parent control)
// ─────────────────────────────────────────────────────────────────────────────

function PersonIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-1/2 w-1/2">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
    </svg>
  );
}

function MicIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
      <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h-2v2h6v-2h-2v-2.06A9 9 0 0 0 21 11h-2Z" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function PhoneEndIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M21 15.46l-5.27-.61-2.52 2.52a15.07 15.07 0 0 1-6.59-6.59l2.53-2.53L8.54 3H3.03C2.45 13.18 10.82 21.55 21 20.97v-5.51Z" />
    </svg>
  );
}

function SettingsIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.03 7.03 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 1h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.34.61.22l2.49-1c.52.39 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.24.09.51 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  );
}

function ReplayIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8Z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Participant card (AI interviewer / candidate "video" placeholder)
// ─────────────────────────────────────────────────────────────────────────────

interface IParticipantCardProps {
  name: string;
  /** Avatar fill — Bauhaus blue (AI) or yellow (candidate). */
  accent: 'blue' | 'yellow';
  /** Pulsing ring when this participant is the active speaker. */
  isActive: boolean;
}

function ParticipantCard({
  name,
  accent,
  isActive,
}: IParticipantCardProps): JSX.Element {
  const avatarBg = accent === 'blue' ? 'bg-accent-blue' : 'bg-accent-yellow';
  const ring = accent === 'blue' ? 'ring-accent-blue/50' : 'ring-accent-yellow/60';

  return (
    <div className="relative flex min-h-[250px] items-center justify-center rounded-[15px] bg-[#f0f0f0] p-6">
      <span
        className={[
          'flex h-[150px] w-[150px] items-center justify-center rounded-full text-white transition-all',
          avatarBg,
          isActive ? `ring-4 ${ring} animate-pulse` : '',
        ].join(' ')}
      >
        <PersonIcon />
      </span>

      {/* Name indicator — white badge pinned to the lower-left of the card */}
      <span className="absolute bottom-3 left-3 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm">
        {name}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Call controls (centered beneath the participants)
// ─────────────────────────────────────────────────────────────────────────────

interface ICallControlsProps {
  isListening: boolean;
  micDisabled: boolean;
  endDisabled: boolean;
  replayDisabled: boolean;
  isTtsSupported: boolean;
  onMicToggle: () => void;
  onEndCall: () => void;
  onReplay: () => void;
}

const SETTINGS_POPOVER_ID = 'interview-settings-popover';

function CallControls({
  isListening,
  micDisabled,
  endDisabled,
  replayDisabled,
  isTtsSupported,
  onMicToggle,
  onEndCall,
  onReplay,
}: ICallControlsProps): JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Native Popover API where available; React-managed visibility otherwise.
  const toggleSettings = (): void => {
    const panel = popoverRef.current;
    if (panel !== null && typeof panel.togglePopover === 'function') {
      panel.togglePopover();
    }
    setIsSettingsOpen((open) => !open);
  };

  const circleBase =
    'inline-flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all ' +
    'focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl bg-[#f0f0f0] py-4">
      {/* Microphone — toggles speech capture */}
      <button
        type="button"
        onClick={onMicToggle}
        disabled={micDisabled}
        aria-pressed={isListening}
        aria-label={isListening ? 'Stop speaking' : 'Start speaking'}
        className={[
          circleBase,
          isListening
            ? 'bg-accent-blue text-white focus-visible:ring-accent-blue/50 animate-pulse'
            : 'bg-white text-ink hover:bg-gray-50 focus-visible:ring-primary/40',
        ].join(' ')}
      >
        {isListening ? <StopIcon /> : <MicIcon />}
      </button>

      {/* End call — red accent */}
      <button
        type="button"
        onClick={onEndCall}
        disabled={endDisabled}
        aria-label="End interview"
        className={[
          'inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-all',
          'bg-accent-red hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50',
          'disabled:cursor-not-allowed disabled:opacity-40',
        ].join(' ')}
      >
        <PhoneEndIcon />
      </button>

      {/* Settings — native popover with replay + voice info */}
      <div className="relative">
        <button
          type="button"
          onClick={toggleSettings}
          aria-haspopup="dialog"
          aria-expanded={isSettingsOpen}
          aria-label="Interview settings"
          className={[circleBase, 'bg-white text-ink hover:bg-gray-50 focus-visible:ring-primary/40'].join(' ')}
        >
          <SettingsIcon />
        </button>

        <div
          ref={popoverRef}
          id={SETTINGS_POPOVER_ID}
          popover="auto"
          className={[
            'absolute bottom-14 right-0 z-20 min-w-56 rounded-2xl border border-gray-200 bg-surface p-4 text-ink shadow-panel',
            isSettingsOpen ? '' : 'hidden',
          ].join(' ')}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Interview settings
          </p>
          {isTtsSupported ? (
            <button
              type="button"
              onClick={onReplay}
              disabled={replayDisabled}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ReplayIcon />
              Replay current question
            </button>
          ) : (
            <p className="text-xs text-muted">
              Text-to-speech isn&apos;t available in this browser, so questions
              are shown as text only.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview stage (top workspace: participants + call controls)
// ─────────────────────────────────────────────────────────────────────────────

interface IInterviewStageProps {
  title: string;
  isActiveSession: boolean;
  answeredCount: number;
  totalCount: number;
  isAISpeaking: boolean;
  isListening: boolean;
  controls: ICallControlsProps;
}

function InterviewStage({
  title,
  isActiveSession,
  answeredCount,
  totalCount,
  isAISpeaking,
  isListening,
  controls,
}: IInterviewStageProps): JSX.Element {
  return (
    <section className="rounded-2xl bg-surface p-6 shadow-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold text-ink">{title}</h2>

        {isActiveSession && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              <span className="font-bold text-accent-blue">{answeredCount}</span>
              {' / '}
              <span className="font-semibold text-ink">{totalCount}</span>
              {' answered'}
            </span>
            <div
              className="h-2 w-28 overflow-hidden rounded-full bg-gray-200"
              role="progressbar"
              aria-label="Interview progress"
              aria-valuenow={answeredCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
            >
              <div
                className="h-full rounded-full bg-accent-blue transition-all duration-300"
                style={{ width: totalCount > 0 ? `${(answeredCount / totalCount) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-[#ddd] p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ParticipantCard
            name="AI Interviewer"
            accent="blue"
            isActive={isAISpeaking}
          />
          <ParticipantCard
            name="Candidate"
            accent="yellow"
            isActive={isListening}
          />
        </div>

        <CallControls {...controls} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Setup Form (voice-first — left panel before the interview starts)
// ─────────────────────────────────────────────────────────────────────────────

interface ISetupFormProps {
  isLoading: boolean;
  onSubmit: (params: {
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }) => void;
}

function SessionSetupForm({ isLoading, onSubmit }: ISetupFormProps): JSX.Element {
  const [difficulty, setDifficulty] = useState<DifficultyTier | ''>('');
  const [questionCount, setQuestionCount] = useState<string>('');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [resumeVersionId, setResumeVersionId] = useState<string>('');

  // Pull the signed-in user's saved resume versions for the optional picker.
  const resumeVersions = useResumeStore((s) => s.versions);
  const loadVersions = useResumeStore((s) => s.loadVersions);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const countValue = Number(questionCount);
  const jdTrimmedLen = jobDescription.trim().length;
  const isJdEmpty = jdTrimmedLen === 0;
  const isJdOverLimit = jobDescription.length > MAX_JD_LENGTH;
  const isCountEmpty = questionCount.trim().length === 0;
  const isCountOutOfRange =
    !isCountEmpty &&
    (!Number.isInteger(countValue) ||
      countValue < MIN_QUESTION_COUNT ||
      countValue > MAX_QUESTION_COUNT);
  const isDifficultyEmpty = difficulty === '';

  const isSubmitDisabled =
    isLoading ||
    isDifficultyEmpty ||
    isJdEmpty ||
    isJdOverLimit ||
    isCountEmpty ||
    isCountOutOfRange;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (isSubmitDisabled || difficulty === '') return;
    onSubmit({
      difficulty,
      questionCount: countValue,
      jobDescription,
      resumeVersionId,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        {/* ── Difficulty + Number of questions (side by side, per Figma) ──── */}
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="difficulty-select" className="sr-only">
              Difficulty
            </label>
            <select
              id="difficulty-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyTier | '')}
              disabled={isLoading}
              className={`${SETUP_INPUT} ${difficulty === '' ? 'text-[#1d1d1d]/50' : ''}`}
            >
              <option value="" disabled>
                Difficulty
              </option>
              <option value="ENTRY">Entry</option>
              <option value="MID">Mid</option>
              <option value="SENIOR">Senior</option>
              <option value="LEAD">Lead</option>
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="question-count" className="sr-only">
              Number of questions
            </label>
            <input
              id="question-count"
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              placeholder="Number of questions"
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
              disabled={isLoading}
              aria-describedby={isCountOutOfRange ? 'question-count-error' : undefined}
              className={`${SETUP_INPUT} ${isCountOutOfRange ? INPUT_ERROR : ''}`}
            />
          </div>
        </div>
        {isCountOutOfRange && (
          <p id="question-count-error" role="alert" className="text-xs text-accent-red">
            Question count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.
          </p>
        )}

        {/* ── Optional resume version (fetched from the resume module) ─────── */}
        <label htmlFor="resume-version-id" className="sr-only">
          Resume version
        </label>
        <select
          id="resume-version-id"
          value={resumeVersionId}
          onChange={(e) => setResumeVersionId(e.target.value)}
          disabled={isLoading}
          className={`${SETUP_INPUT} ${resumeVersionId === '' ? 'text-[#1d1d1d]/50' : ''}`}
        >
          <option value="">
            {resumeVersions.length > 0
              ? 'Resume version (optional)'
              : 'No saved resumes — optional'}
          </option>
          {resumeVersions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
            </option>
          ))}
        </select>

        {/* ── Job Description ───────────────────────────────────────────────── */}
        <label htmlFor="job-description" className="sr-only">
          Job description
        </label>
        <textarea
          id="job-description"
          rows={4}
          placeholder="Job Description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          disabled={isLoading}
          aria-required="true"
          aria-describedby={isJdOverLimit ? 'job-description-error' : undefined}
          className={`${SETUP_INPUT} min-h-[101px] resize-none ${isJdOverLimit ? INPUT_ERROR : ''}`}
        />
        <div className="flex items-start justify-between gap-2">
          {isJdOverLimit ? (
            <p id="job-description-error" role="alert" className="text-xs text-accent-red">
              Job description is too long (max {MAX_JD_LENGTH.toLocaleString()} characters).
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <span
            className={`ml-auto text-xs tabular-nums ${isJdOverLimit ? 'font-medium text-accent-red' : 'text-gray-400'}`}
            aria-live="polite"
          >
            {jobDescription.length.toLocaleString()} / {MAX_JD_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Start Interview (dark pill, bottom-right per Figma) ────────────── */}
      <button type="submit" disabled={isSubmitDisabled} className={`${BTN_START} self-end`}>
        {isLoading ? 'Starting session…' : 'Start Interview'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer panel (left panel while the interview is active)
// ─────────────────────────────────────────────────────────────────────────────

interface IAnswerPanelProps {
  answerDraft: string;
  onChangeDraft: (value: string) => void;
  isSubmitting: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isSttSupported: boolean;
  permissionDenied: boolean;
  answeredCount: number;
  totalCount: number;
  onSend: () => void;
}

function AnswerPanel({
  answerDraft,
  onChangeDraft,
  isSubmitting,
  isListening,
  isSpeaking,
  isSttSupported,
  permissionDenied,
  answeredCount,
  totalCount,
  onSend,
}: IAnswerPanelProps): JSX.Element {
  const draftTrimmedLen = answerDraft.trim().length;
  const isOverLimit = answerDraft.length > MAX_ANSWER_LENGTH;
  const isSendDisabled = isSubmitting || draftTrimmedLen === 0 || isOverLimit;
  const isLastQuestion = answeredCount + 1 >= totalCount;

  const statusText = isSpeaking
    ? 'Interviewer is speaking…'
    : isListening
      ? 'Listening — speak your answer'
      : isSttSupported
        ? 'Press the microphone above to answer, or type below.'
        : 'Type your answer below.';

  return (
    <div className="flex flex-col gap-4">
      <span aria-live="polite" className="text-xs italic text-muted">
        {statusText}
      </span>

      {permissionDenied && (
        <p role="alert" className="rounded-lg border border-accent-red/30 bg-accent-red/5 px-4 py-2.5 text-sm text-accent-red">
          Microphone access was denied. Open your browser&apos;s site settings,
          set the microphone permission to <strong>Allow</strong>, then reload
          the page. You can also type your answer below.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="answer-draft" className="text-sm font-medium text-ink">
          Your answer{' '}
          <span className="text-xs font-normal text-muted">
            {isListening ? '(transcribing — edit any time)' : '(review or edit before sending)'}
          </span>
        </label>
        <textarea
          id="answer-draft"
          rows={6}
          placeholder="Your spoken answer appears here. You can also type or correct it."
          value={answerDraft}
          onChange={(e) => onChangeDraft(e.target.value)}
          disabled={isSubmitting}
          aria-describedby={isOverLimit ? 'answer-draft-error' : undefined}
          className={`${INPUT_BASE} resize-none ${isOverLimit ? INPUT_ERROR : ''}`}
        />
        <div className="flex items-center justify-between gap-2">
          {isOverLimit ? (
            <p id="answer-draft-error" role="alert" className="text-xs text-accent-red">
              Answer is too long (max {MAX_ANSWER_LENGTH.toLocaleString()} characters).
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <span
            className={`ml-auto text-xs tabular-nums ${isOverLimit ? 'font-medium text-accent-red' : 'text-gray-400'}`}
          >
            {answerDraft.length.toLocaleString()} / {MAX_ANSWER_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={isSendDisabled}
        className={`${BTN_PRIMARY} w-full`}
      >
        {isSubmitting
          ? 'Submitting…'
          : isLastQuestion
            ? 'Submit & Finish Interview'
            : 'Submit & Next Question'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorecard section (completion view — left panel once finished)
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
    return <SkeletonCard />;
  }

  if (!hasScorecard) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-base font-semibold text-ink">🎉 You completed the interview!</p>
        <p className="text-sm text-muted">
          Generate your performance scorecard with scores across all dimensions.
        </p>
        {computeError !== null && (
          <p role="alert" className="text-xs text-accent-red">{computeError}</p>
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Performance Scorecard</h2>
        <TierBadge tier={scorecard.passFailTier} />
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <ScoreDial score={scorecard.answerQualityScore} label="Answer Quality" />
        <ScoreDial score={scorecard.grammarScore} label="Grammar" />
        <ScoreDial score={scorecard.latencyScore} label="Response Speed" />
        <ScoreDial score={scorecard.pressureScore} label="Pressure Handling" />
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-muted">Overall Score</p>
        <ScoreDial score={scorecard.overallScore} label="Overall" />
      </div>

      <p className="text-center text-xs text-gray-400">
        You can revisit this scorecard any time from the Sessions tab.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcript panel (right panel — real-time conversation feed)
// ─────────────────────────────────────────────────────────────────────────────

function TranscriptPanel({
  messages,
  isLoading,
}: {
  messages: ReturnType<typeof deriveChatThread>['messages'];
  isLoading: boolean;
}): JSX.Element {
  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col">
      {isLoading && isEmpty ? (
        <SkeletonCard />
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <p className="text-sm font-medium text-ink">No conversation yet</p>
          <p className="max-w-xs text-xs text-muted">
            Configure your session and press <strong>Start Interview</strong>.
            Questions and your answers will appear here in real time.
          </p>
        </div>
      ) : (
        <ChatThread messages={messages} liveRegionLabel="Interview conversation" />
      )}
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
    // scorecard appears.
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
  const showAnswerPanel = isActiveSession && !isCompleted && currentQuestion !== null;
  const permissionDenied = recognition.permission === 'denied';

  // ── Stage title + control wiring ──────────────────────────────────────────
  const difficultyLabel = activeSession?.difficultyTier ?? null;
  const stageTitle = isActiveSession
    ? `${difficultyLabel ? `${difficultyLabel} ` : ''}Interview Session`
    : 'Interview Session';

  const controls: ICallControlsProps = {
    isListening: recognition.isListening,
    micDisabled:
      !showAnswerPanel || synthesis.isSpeaking || isSubmitting || !recognition.isSupported,
    endDisabled: !isActiveSession,
    replayDisabled: currentQuestion === null || synthesis.isSpeaking,
    isTtsSupported: synthesis.isSupported,
    onMicToggle: handleMicToggle,
    onEndCall: handleEndSession,
    onReplay: handleReplay,
  };

  return (
    <main className="flex flex-col gap-6" aria-label="AI interview command center">
      {/* ── Error banners ──────────────────────────────────────────────────── */}
      {setupError !== null && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-accent-red/30 bg-accent-red/5 px-4 py-2.5 text-sm text-accent-red"
        >
          {setupError}
        </div>
      )}
      {storeError !== null && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start justify-between gap-3 rounded-xl border border-accent-red/30 bg-accent-red/5 px-4 py-2.5 text-sm text-accent-red"
        >
          <span>{storeError.message}</span>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Top: interview workspace (participants + call controls) ────────── */}
      <InterviewStage
        title={stageTitle}
        isActiveSession={isActiveSession}
        answeredCount={answeredCount}
        totalCount={totalCount}
        isAISpeaking={synthesis.isSpeaking}
        isListening={recognition.isListening}
        controls={controls}
      />

      {/* ── Bottom: setup/answer (left) + transcript (right) ───────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left panel */}
        <section className="rounded-2xl bg-surface p-6 shadow-panel">
          <h2 className="mb-4 font-heading text-base font-bold text-ink">
            {isCompleted ? 'Results' : isActiveSession ? 'Your Answer' : 'Interview Setup'}
          </h2>

          {!isActiveSession && (
            <SessionSetupForm
              isSttSupported={recognition.isSupported}
              isTtsSupported={synthesis.isSupported}
              isLoading={isLoading}
              onSubmit={(params) => { void handleSetupSubmit(params); }}
            />
          )}

          {showAnswerPanel && (
            <AnswerPanel
              answerDraft={answerDraft}
              onChangeDraft={setAnswerDraft}
              isSubmitting={isSubmitting}
              isListening={recognition.isListening}
              isSpeaking={synthesis.isSpeaking}
              isSttSupported={recognition.isSupported}
              permissionDenied={permissionDenied}
              answeredCount={answeredCount}
              totalCount={totalCount}
              onSend={() => { void handleSend(); }}
            />
          )}

          {isActiveSession && isCompleted && activeSession !== null && (
            <ScorecardSection sessionId={activeSession.id} isLoading={isLoading} />
          )}

          {isActiveSession && !isCompleted && currentQuestion === null && (
            <SkeletonCard />
          )}
        </section>

        {/* Right panel — transcript */}
        <section className="flex flex-col self-start rounded-2xl bg-surface p-6 shadow-panel">
          <h2 className="mb-4 font-heading text-base font-bold text-ink">
            Interview Transcript
          </h2>
          <TranscriptPanel messages={messages} isLoading={isLoading} />
        </section>
      </div>
    </main>
  );
}
