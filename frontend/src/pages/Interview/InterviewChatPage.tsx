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
 *   │            ( mic    end    settings )   centered call controls │
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
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  Square,
  PhoneOff,
  Settings as SettingsLucide,
  RotateCcw,
  User,
} from 'lucide-react';

import { ChatThread } from '../../components/ChatThread';
import { ScoreDial } from '../../components/ScoreDial';
import { SkeletonCard } from '../../components/Skeleton';
import { TierBadge } from '../../components/TierBadge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Textarea } from '../../components/Textarea';
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

// ─────────────────────────────────────────────────────────────────────────────
// Icons (aria-hidden; accessible names live on the parent control)
// ─────────────────────────────────────────────────────────────────────────────

function PersonIcon(): JSX.Element {
  return <User aria-hidden="true" className="h-1/2 w-1/2" />;
}

function MicIcon(): JSX.Element {
  return <Mic aria-hidden="true" className="h-5 w-5" />;
}

function StopIcon(): JSX.Element {
  return <Square aria-hidden="true" className="h-5 w-5" fill="currentColor" />;
}

function PhoneEndIcon(): JSX.Element {
  return <PhoneOff aria-hidden="true" className="h-6 w-6" />;
}

function SettingsIcon(): JSX.Element {
  return <SettingsLucide aria-hidden="true" className="h-5 w-5" />;
}

function ReplayIcon(): JSX.Element {
  return <RotateCcw aria-hidden="true" className="h-4 w-4" />;
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
// Interview status banner (visual indicator for the voice-driven flow)
// ─────────────────────────────────────────────────────────────────────────────

interface IStatusBannerProps {
  isActiveSession: boolean;
  isCompleted: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isSubmitting: boolean;
}

function InterviewStatusBanner({
  isActiveSession,
  isCompleted,
  isSpeaking,
  isListening,
  isSubmitting,
}: IStatusBannerProps): JSX.Element | null {
  if (!isActiveSession) return null;

  let text: string;
  let bgClass: string;
  let animClass: string;

  if (isCompleted) {
    text = 'Interview complete — view your results below';
    bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
    animClass = '';
  } else if (isSpeaking) {
    text = 'AI Interviewer is speaking — please listen...';
    bgClass = 'bg-blue-50 border-accent-blue/30 text-accent-blue';
    animClass = 'animate-pulse';
  } else if (isSubmitting) {
    text = 'Processing your answer...';
    bgClass = 'bg-amber-50 border-amber-200 text-amber-700';
    animClass = 'animate-pulse';
  } else if (isListening) {
    text = 'Your turn — speak now, then press the microphone to send your answer';
    bgClass = 'bg-green-50 border-green-200 text-green-700';
    animClass = '';
  } else {
    text = 'Press the microphone to start answering';
    bgClass = 'bg-gray-50 border-gray-200 text-gray-500';
    animClass = '';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
        bgClass,
        animClass,
      ].join(' ')}
    >
      <span>{text}</span>
      {isListening && (
        <span className="flex gap-1" aria-hidden="true">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-bounce [animation-delay:0ms]" />
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-bounce [animation-delay:150ms]" />
          <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-bounce [animation-delay:300ms]" />
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview stage (top workspace: participants + call controls)
// ─────────────────────────────────────────────────────────────────────────────

interface IInterviewStageProps {
  title: string;
  isActiveSession: boolean;
  isCompleted: boolean;
  isSubmitting: boolean;
  answeredCount: number;
  totalCount: number;
  isAISpeaking: boolean;
  isListening: boolean;
  controls: ICallControlsProps;
}

function InterviewStage({
  title,
  isActiveSession,
  isCompleted,
  isSubmitting,
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

      {/* Status banner — shows what's happening (AI speaking / your turn / etc) */}
      <InterviewStatusBanner
        isActiveSession={isActiveSession}
        isCompleted={isCompleted}
        isSpeaking={isAISpeaking}
        isListening={isListening}
        isSubmitting={isSubmitting}
      />

      <div className="mt-4 rounded-2xl bg-[#ddd] p-3 sm:p-4">
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
  isSttSupported?: boolean;
  isTtsSupported?: boolean;
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
    if (isSubmitDisabled) return;
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
            <Select
              aria-label="Difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyTier | '')}
              disabled={isLoading}
              options={[
                { value: '', label: 'Difficulty', disabled: true },
                { value: 'ENTRY', label: 'Entry' },
                { value: 'MID', label: 'Mid' },
                { value: 'SENIOR', label: 'Senior' },
                { value: 'LEAD', label: 'Lead' },
              ]}
            />
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <Input
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              placeholder="Number of questions"
              aria-label="Number of questions"
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value)}
              disabled={isLoading}
              aria-describedby={isCountOutOfRange ? 'question-count-error' : undefined}
              className={isCountOutOfRange ? INPUT_ERROR : ''}
            />
          </div>
        </div>
        {isCountOutOfRange && (
          <p id="question-count-error" role="alert" className="text-xs text-accent-red">
            Question count must be between {MIN_QUESTION_COUNT} and {MAX_QUESTION_COUNT}.
          </p>
        )}

        {/* ── Optional resume version (fetched from the resume module) ─────── */}
        <Select
          aria-label="Resume version (optional)"
          value={resumeVersionId}
          onChange={(e) => setResumeVersionId(e.target.value)}
          disabled={isLoading}
          options={[
            {
              value: '',
              label:
                resumeVersions.length > 0
                  ? 'Resume version (optional)'
                  : 'No saved resumes — optional',
            },
            ...resumeVersions.map((version) => ({
              value: version.id,
              label: version.name,
            })),
          ]}
        />

        {/* ── Job Description ───────────────────────────────────────────────── */}
        <Textarea
          rows={4}
          placeholder="Job Description"
          aria-label="Job description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          disabled={isLoading}
          aria-required="true"
          aria-describedby={isJdOverLimit ? 'job-description-error' : undefined}
          className={`min-h-[101px] ${isJdOverLimit ? INPUT_ERROR : ''}`}
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

      {/* ── Create Interview (dark pill, bottom-right per Figma) ──────────── */}
      <Button type="submit" disabled={isSubmitDisabled} className="self-end">
        {isLoading ? 'Creating…' : 'Create Interview'}
      </Button>
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
    ? 'Interviewer is speaking...'
    : isListening
      ? 'Listening — speak your answer, then press the microphone to send it.'
      : isSubmitting
        ? 'Submitting your answer...'
        : 'Press the microphone above to answer. Your words appear live in the transcript on the right.';

  // ── Voice flow (the primary experience) ─────────────────────────────────
  // No textarea and no submit button: the candidate speaks and the live
  // transcript renders in the right-hand panel. Pressing the microphone in the
  // call-control bar sends the answer.
  if (isSttSupported) {
    return (
      <div className="flex flex-col gap-4">
        {permissionDenied && (
          <p role="alert" className="rounded-lg border border-accent-red/30 bg-accent-red/5 px-4 py-2.5 text-sm text-accent-red">
            Microphone access was denied. Open your browser&apos;s site settings,
            set the microphone permission to <strong>Allow</strong>, then reload
            the page.
          </p>
        )}

        <div
          className={[
            'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
            isListening
              ? 'border-green-200 bg-green-50 text-green-700'
              : isSpeaking
                ? 'border-accent-blue/30 bg-blue-50 text-accent-blue'
                : 'border-gray-200 bg-gray-50 text-muted',
          ].join(' ')}
          aria-live="polite"
        >
          <span>{statusText}</span>
        </div>

        <ol className="flex flex-col gap-2 text-sm text-muted">
          <li>1. Listen to the interviewer&apos;s question.</li>
          <li>2. Press the microphone to start speaking your answer.</li>
          <li>3. Press the microphone again to send it and move to the next question.</li>
        </ol>

        <p className="text-xs text-gray-400" aria-live="polite">
          {answeredCount} of {totalCount} answered
        </p>
      </div>
    );
  }

  // ── Fallback (no Web Speech support) ─────────────────────────────────────
  // Some browsers lack speech recognition; keep a typed answer + send button so
  // the interview is still completable.
  return (
    <div className="flex flex-col gap-4">
      <span aria-live="polite" className="text-xs italic text-muted">
        Speech recognition isn&apos;t available in this browser. Type your answer below.
      </span>

      <div className="flex flex-col gap-2">
        <label htmlFor="answer-draft" className="text-sm font-medium text-ink">
          Your answer
        </label>
        <textarea
          id="answer-draft"
          rows={6}
          placeholder="Type your answer here."
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
          ? 'Submitting...'
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
        <p className="text-base font-semibold text-ink">You completed the interview!</p>
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
  liveAnswer,
}: {
  messages: ReturnType<typeof deriveChatThread>['messages'];
  isLoading: boolean;
  liveAnswer?: string | null;
}): JSX.Element {
  const isEmpty = messages.length === 0;
  const hasLiveAnswer = (liveAnswer?.trim().length ?? 0) > 0;

  return (
    <div className="flex flex-col">
      {isLoading && isEmpty ? (
        <SkeletonCard />
      ) : isEmpty && !hasLiveAnswer ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
          <p className="text-sm font-medium text-ink">No conversation yet</p>
          <p className="max-w-xs text-xs text-muted">
            Configure your session and press <strong>Start Interview</strong>.
            Questions and your answers will appear here in real time.
          </p>
        </div>
      ) : (
        <ChatThread
          messages={messages}
          liveRegionLabel="Interview conversation"
          liveAnswer={liveAnswer ?? null}
        />
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
    submitAnswer,
    forceEndSession,
    clearError,
    reset,
  } = useInterviewStore();

  const navigate = useNavigate();

  // ── Speech hooks ──────────────────────────────────────────────────────────
  const recognition = useSpeechRecognition();
  const synthesis = useSpeechSynthesis();

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [answerDraft, setAnswerDraft] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isEndingSession, setIsEndingSession] = useState<boolean>(false);

  // Per-question presentation timestamps (for latency scoring).
  const presentedAtMap = useRef<Map<string, number>>(new Map());
  const prevQuestionIdRef = useRef<string | null>(null);
  // True while we are waiting for the spoken question to finish before listening.
  const pendingAutoListenRef = useRef<boolean>(false);
  const prevSpeakingRef = useRef<boolean>(false);
  // Silence detection timer ref.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track whether a submission is already in progress.
  const autoSubmitInProgressRef = useRef<boolean>(false);
  // Safety-net timer that force-opens the mic if text-to-speech gets stuck
  // (Chrome's "pending until tab refocus" bug) so the candidate can always
  // start answering without switching tabs.
  const autoListenFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous mirror of recognition.isListening for use inside timers.
  const isListeningRef = useRef<boolean>(false);

  // ── Derive thread from store questions ────────────────────────────────────
  const { messages, currentQuestion, answeredCount, totalCount } =
    deriveChatThread(activeQuestions);

  // ── Helper: clear silence timer ───────────────────────────────────────────
  const clearSilenceTimer = (): void => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // ── Helper: clear the auto-listen safety-net timer ────────────────────────
  const clearAutoListenFallback = (): void => {
    if (autoListenFallbackRef.current !== null) {
      clearTimeout(autoListenFallbackRef.current);
      autoListenFallbackRef.current = null;
    }
  };

  // ── Helper: start a FRESH listening session ───────────────────────────────
  // Always wipes the previous transcript and draft first so a new answer can
  // never be concatenated onto the prior one (fixes the "previous answer
  // appended to the current speech" bug).
  const beginListening = (): void => {
    recognition.clearTranscript();
    setAnswerDraft('');
    recognition.startListening();
  };

  // ── Keep a synchronous mirror of the listening flag for timers ────────────
  useEffect(() => {
    isListeningRef.current = recognition.isListening;
  }, [recognition.isListening]);

  // ── Helper: internal answer submission (used by both manual & auto) ───────
  const submitCurrentAnswer = async (answerText: string): Promise<void> => {
    if (currentQuestion === null || activeSession === null) return;
    if (isSubmitting || autoSubmitInProgressRef.current) return;

    const trimmed = answerText.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_ANSWER_LENGTH) return;

    autoSubmitInProgressRef.current = true;
    setIsSubmitting(true);
    clearSilenceTimer();
    clearAutoListenFallback();

    // Stop any capture/playback before submitting.
    if (recognition.isListening) recognition.stopListening();
    if (synthesis.isSpeaking) synthesis.cancel();
    pendingAutoListenRef.current = false;

    const presentedAt = presentedAtMap.current.get(currentQuestion.id);
    const responseLatencySeconds = computeResponseLatencySeconds(presentedAt, Date.now());

    const updated = await submitAnswer(activeSession.id, currentQuestion.id, {
      answerText: trimmed,
      responseLatencySeconds,
    });

    // Wipe the transcript/draft now that the answer is sent so it can never be
    // carried over into the next question's spoken answer.
    recognition.clearTranscript();
    setAnswerDraft('');

    // When the final answer is submitted, re-open the session so its
    // lifecycle state advances to COMPLETED and the scorecard appears.
    if (updated !== null && answeredCount + 1 >= totalCount) {
      await openSession(activeSession.id);
    }

    setIsSubmitting(false);
    autoSubmitInProgressRef.current = false;
  };

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
    clearSilenceTimer();
    clearAutoListenFallback();

    if (synthesis.isSupported) {
      // Speak the question; auto-start the mic once playback finishes.
      pendingAutoListenRef.current = true;
      synthesis.speak(currentQuestion.text);

      // Safety net: if the browser's speech synthesis gets stuck (Chrome's
      // "pending until the tab is refocused" bug) and the normal
      // speaking→idle transition never fires, force the mic open after a
      // generous, length-scaled delay so the candidate can always answer
      // right away without switching tabs. A legitimately spoken question
      // finishes well within this window and clears the timer first.
      const estimatedSpeechMs = Math.min(20000, 2500 + currentQuestion.text.length * 70);
      autoListenFallbackRef.current = setTimeout(() => {
        if (
          pendingAutoListenRef.current &&
          recognition.isSupported &&
          !isListeningRef.current
        ) {
          pendingAutoListenRef.current = false;
          synthesis.cancel();
          beginListening();
        }
      }, estimatedSpeechMs);
    } else if (recognition.isSupported) {
      // No TTS — start listening straight away.
      beginListening();
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
      clearAutoListenFallback();
      beginListening();
    }
  }, [synthesis.isSpeaking, recognition]);

  // ── Cleanup silence timer on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearAutoListenFallback();
    };
  }, []);

  // ── Setup submit handler ──────────────────────────────────────────────────
  // Creates the session and saves it, then sends the user to the Sessions tab.
  // The interview itself is started MANUALLY from a session (a fresh user
  // gesture), which is the reliable way to get the browser to grant microphone
  // capture for the voice flow.
  const handleSetupSubmit = async (params: {
    difficulty: DifficultyTier;
    questionCount: number;
    jobDescription: string;
    resumeVersionId: string;
  }): Promise<void> => {
    setSetupError(null);
    clearError();

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
      setSetupError(latestError('Failed to create interview. Please try again.'));
      return;
    }

    // Clear any stale active session so returning to the Simulator shows the
    // create form again rather than a previously-open interview.
    useInterviewStore.setState({
      activeSession: null,
      activeQuestions: [],
      scorecard: null,
    });

    // Hand off to the Sessions tab, where the user starts the interview.
    navigate('/interview/sessions');
  };

  // ── Answer submit handler (manual button press) ───────────────────────────
  const handleSend = async (): Promise<void> => {
    await submitCurrentAnswer(answerDraft);
  };

  // ── Mic control — doubles as the "send answer" button ─────────────────────
  // Pressing the mic while listening stops capture AND submits the spoken
  // answer; pressing it while idle cancels any in-flight question playback and
  // starts listening immediately so the candidate can answer right away.
  const handleMicToggle = (): void => {
    if (recognition.isListening) {
      recognition.stopListening();
      void submitCurrentAnswer(recognition.transcriptRef.current);
    } else {
      if (synthesis.isSpeaking) synthesis.cancel();
      pendingAutoListenRef.current = false;
      clearAutoListenFallback();
      beginListening();
    }
  };

  const handleReplay = (): void => {
    if (currentQuestion !== null && synthesis.isSupported) {
      pendingAutoListenRef.current = false;
      clearSilenceTimer();
      synthesis.speak(currentQuestion.text);
    }
  };

  const handleEndSession = async (): Promise<void> => {
    if (activeSession === null) return;
    if (isEndingSession) return;

    setIsEndingSession(true);

    // Stop all audio activity.
    if (recognition.isListening) recognition.stopListening();
    if (synthesis.isSpeaking) synthesis.cancel();
    clearSilenceTimer();
    clearAutoListenFallback();
    pendingAutoListenRef.current = false;

    // Force-end the session on the backend — fills unanswered questions
    // with "I don't know" and transitions to COMPLETED.
    const result = await forceEndSession(activeSession.id);

    if (result === null) {
      // If the backend call failed (session may not be ACTIVE anymore),
      // just reset local state.
      presentedAtMap.current.clear();
      prevQuestionIdRef.current = null;
      setAnswerDraft('');
      reset();
    }

    setIsEndingSession(false);
  };

  // ── Session state shortcuts ───────────────────────────────────────────────
  const sessionState = activeSession?.state ?? null;
  const isActiveSession =
    sessionState === 'ACTIVE' || sessionState === 'COMPLETED' || sessionState === 'SCORED';
  const isCompleted = sessionState === 'COMPLETED' || sessionState === 'SCORED';
  const showAnswerPanel = isActiveSession && !isCompleted && currentQuestion !== null;
  const permissionDenied = recognition.permission === 'denied';

  // Surface speech-recognition failures (other than the dedicated permission
  // banner) so a silently-failing mic isn't mistaken for "nothing happening".
  const recognitionErrorMessage = ((): string | null => {
    if (recognition.error === null || permissionDenied) return null;
    switch (recognition.error) {
      case 'audio-capture':
        return 'No microphone was detected, or capture could not start. Check that a mic is connected and allowed, then press the microphone to try again.';
      case 'network':
        return 'Speech recognition lost its network connection. Check your internet and press the microphone to try again.';
      case 'no-speech':
        return 'No speech was detected. Press the microphone and speak clearly to answer.';
      case 'aborted':
        return null;
      default:
        return 'Speech recognition ran into a problem. Press the microphone to try again, or type your answer if the issue persists.';
    }
  })();

  // ── Stage title + control wiring ──────────────────────────────────────────
  const difficultyLabel = activeSession?.difficultyTier ?? null;
  const stageTitle = isActiveSession
    ? `${difficultyLabel ? `${difficultyLabel} ` : ''}Interview Session`
    : 'Interview Session';

  const controls: ICallControlsProps = {
    isListening: recognition.isListening,
    micDisabled: !showAnswerPanel || isSubmitting || !recognition.isSupported,
    endDisabled: !isActiveSession || isCompleted || isEndingSession,
    replayDisabled: currentQuestion === null || synthesis.isSpeaking,
    isTtsSupported: synthesis.isSupported,
    onMicToggle: handleMicToggle,
    onEndCall: () => { void handleEndSession(); },
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
      {recognitionErrorMessage !== null && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
        >
          {recognitionErrorMessage}
        </div>
      )}

      {/* ── Top: interview workspace (participants + call controls) ────────── */}
      <InterviewStage
        title={stageTitle}
        isActiveSession={isActiveSession}
        isCompleted={isCompleted}
        isSubmitting={isSubmitting}
        answeredCount={answeredCount}
        totalCount={totalCount}
        isAISpeaking={synthesis.isSpeaking}
        isListening={recognition.isListening}
        controls={controls}
      />

      {/* ── Bottom: setup/answer (left) + transcript (right) ───────────────── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Left panel */}
        <section className="self-start rounded-2xl bg-surface p-6 shadow-panel">
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
          <TranscriptPanel
            messages={messages}
            isLoading={isLoading}
            liveAnswer={showAnswerPanel && recognition.isListening ? answerDraft : null}
          />
        </section>
      </div>
    </main>
  );
}
