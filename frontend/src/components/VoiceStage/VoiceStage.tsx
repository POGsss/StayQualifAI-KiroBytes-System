/**
 * VoiceStage — the voice-mode interaction panel for Interview voice answering.
 *
 * Layout (top → bottom):
 *  1. VoiceOrb  — purely decorative canvas; pulsing ring added around it while
 *                 recording so the state is unmissable.
 *  2. REC badge — bright red pill with animated dot; only visible while listening.
 *  3. Status    — plain-language description of the current voice turn state.
 *  4. Transcript subtitle — live read-only caption of what the recogniser hears.
 *  5. Primary CTA — large, full-width button: "Start Speaking" → "Stop Recording".
 *                   aria-label is "Start listening" / "Stop listening" so it
 *                   matches the accessible-name assertions used in tests.
 *  6. Replay / Stop TTS — secondary text buttons; shown only when relevant.
 *
 * The orb is purely supplementary (Requirement 12): aria-hidden, pointer-events-none,
 * guarded against init/render failure. The interview is always completable without it.
 *
 * Requirements: 4.3, 4.4, 5.1, 10.4, 10.6, 12.1, 12.2
 */

import { type JSX } from 'react';
import { VoiceOrb } from '../VoiceOrb';

// Use hex values directly — avoids any Tailwind JIT class-generation uncertainty
// for newly created files.
const PURPLE = '#9b5de5';
const TEAL = '#00f5d4';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface IVoiceStageProps {
  /** Live transcript from the recogniser (shown in the subtitle). */
  liveTranscript: string;
  /** Whether speech capture is currently active. */
  isListening: boolean;
  /** Whether TTS is currently reading a question aloud. */
  isSpeaking: boolean;
  /** Whether an answer submission is in flight. */
  isProcessing: boolean;
  /** Whether STT (SpeechRecognition) is available in this browser. */
  isSttSupported: boolean;
  /** Whether TTS (speechSynthesis) is available in this browser. */
  isTtsSupported: boolean;
  /** Toggle mic on/off (Req 5.1). */
  onMicToggle: () => void;
  /** Replay the current question (Req 4.3). */
  onReplay: () => void;
  /** Stop TTS playback (Req 4.4). */
  onStop: () => void;
  /** Orb diameter in px. Default 320. */
  orbSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG icons (aria-hidden; accessible names live on the parent button)
// ─────────────────────────────────────────────────────────────────────────────

function MicIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
      <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h-2v2h6v-2h-2v-2.06A9 9 0 0 0 21 11h-2Z" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ReplayIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8Z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status text (shown when NOT actively recording)
// ─────────────────────────────────────────────────────────────────────────────

function resolveStatus(p: {
  isProcessing: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isSttSupported: boolean;
}): string {
  if (p.isProcessing) return 'Submitting your answer…';
  if (p.isSpeaking) return 'AI is reading the question aloud. Press Stop if you want to skip.';
  if (!p.isSttSupported) return 'Voice capture is not available in this browser — type your answer below.';
  return 'Press "Start Speaking" below, say your answer, then press "Stop Recording".';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceStage({
  liveTranscript,
  isListening,
  isSpeaking,
  isProcessing,
  isSttSupported,
  isTtsSupported,
  onMicToggle,
  onReplay,
  onStop,
  orbSize = 320,
}: IVoiceStageProps): JSX.Element {

  const ctaDisabled = isProcessing || isSpeaking || !isSttSupported;
  const trimmedTranscript = liveTranscript.trim();

  return (
    <section
      aria-label="Voice answer stage"
      className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-sm"
    >

      {/* ── 1. Orb with pulsing ring while recording ─────────────────────── */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: orbSize, height: orbSize }}
      >
        {/* Pulsing ring — turquoise while recording (opacity-based, no scale overflow) */}
        {isListening && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute animate-pulse rounded-full"
            style={{
              width: orbSize + 16,
              height: orbSize + 16,
              top: -8,
              left: -8,
              border: `3px solid ${TEAL}`,
              opacity: 0.55,
            }}
          />
        )}
        {/* Second inner ring for depth */}
        {isListening && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              width: orbSize + 6,
              height: orbSize + 6,
              top: -3,
              left: -3,
              border: `2px solid ${TEAL}`,
              opacity: 0.3,
            }}
          />
        )}
        <VoiceOrb
          isActive={isListening || isSpeaking}
          isAISpeaking={isSpeaking}
          isUserSpeaking={isListening}
          isLoading={isProcessing}
          size={orbSize}
          dotColor={isListening ? TEAL : PURPLE}
        />
      </div>

      {/* ── 2. REC badge — unmissable signal that we are recording ───────── */}
      {isListening ? (
        <div className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-1.5 ring-1 ring-red-200">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"
          />
          <span className="text-xs font-bold uppercase tracking-widest text-red-600">
            Recording
          </span>
        </div>
      ) : (
        /* ── 3. Status text (hidden while recording; REC badge takes its place) */
        <p
          role="status"
          aria-live="polite"
          className="max-w-sm text-center text-sm text-gray-500"
        >
          {resolveStatus({ isProcessing, isSpeaking, isListening, isSttSupported })}
        </p>
      )}

      {/* ── 4. Live transcript subtitle ────────────────────────────────────── */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800 min-h-[4rem] flex items-center justify-center"
      >
        {trimmedTranscript.length > 0 ? (
          <span className="w-full text-left">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
              You
            </span>
            {liveTranscript}
          </span>
        ) : isListening ? (
          <span className="animate-pulse text-sm font-medium" style={{ color: PURPLE }}>
            Listening… speak now
          </span>
        ) : isSpeaking ? (
          <span className="text-xs italic text-gray-400">
            AI is speaking — transcript will appear here once you start recording.
          </span>
        ) : (
          <span className="text-xs text-gray-400">
            Your spoken answer will appear here as you talk.
          </span>
        )}
      </div>

      {/* ── 5. Primary CTA — the one big button the user needs ───────────── */}
      <button
        type="button"
        onClick={onMicToggle}
        disabled={ctaDisabled}
        aria-pressed={isListening}
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
        className={[
          'flex w-full max-w-xs items-center justify-center gap-3 rounded-full px-6 py-4',
          'text-base font-semibold text-white',
          'transition-all focus:outline-none focus-visible:ring-4',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isListening
            ? 'bg-red-600 shadow-lg shadow-red-200 hover:bg-red-700 focus-visible:ring-red-300'
            : `shadow-lg hover:opacity-90 focus-visible:ring-purple-200`,
        ].join(' ')}
        style={isListening ? {} : { backgroundColor: PURPLE, boxShadow: `0 8px 24px ${PURPLE}40` }}
      >
        {isListening ? <StopIcon /> : <MicIcon />}
        <span>{isListening ? 'Stop Recording' : 'Start Speaking'}</span>
      </button>

      {/* ── 6. Secondary TTS controls ────────────────────────────────────── */}
      {isTtsSupported && (
        <div className="flex items-center gap-3">
          {/* Replay — shown whenever TTS is supported and not currently playing */}
          {!isSpeaking && (
            <button
              type="button"
              onClick={onReplay}
              aria-label="Replay question"
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 transition-colors"
            >
              <ReplayIcon />
              Replay question
            </button>
          )}
          {/* Stop — shown only while AI is speaking */}
          {isSpeaking && (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop playback"
              className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 transition-colors"
            >
              <StopIcon />
              Stop playback
            </button>
          )}
        </div>
      )}

    </section>
  );
}
