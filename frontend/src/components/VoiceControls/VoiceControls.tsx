/**
 * VoiceControls — mic toggle, replay, stop, and live-status indicator for
 * the Interview Chat voice-answering mode.
 *
 * Accessibility requirements:
 *   - Every icon-only control has a programmatically determinable accessible
 *     name via `aria-label` (Req 10.4).
 *   - Mic capture state is exposed to assistive tech via `aria-pressed`
 *     (Req 10.6).
 *   - Replay restarts TTS playback from the beginning (Req 4.3).
 *   - Stop halts TTS within ~1 s (Req 4.4).
 *   - Visible focus rings on every interactive element (Req 10.3).
 *
 * Requirements: 4.3, 4.4, 5.1, 10.4, 10.6
 */

import type { JSX } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface IVoiceControlsProps {
  /** Whether speech capture is currently active (drives aria-pressed, Req 10.6). */
  isListening: boolean;
  /** Whether TTS is currently speaking (drives Stop button visibility). */
  isSpeaking: boolean;
  /** Whether TTS (speechSynthesis) is supported in this browser. */
  isTtsSupported: boolean;
  /** Whether STT (SpeechRecognition) is supported in this browser. */
  isSttSupported: boolean;
  /** Called when the mic toggle button is pressed (Req 5.1). */
  onMicToggle: () => void;
  /** Called when the replay button is pressed; host restarts TTS (Req 4.3). */
  onReplay: () => void;
  /** Called when the stop button is pressed; host cancels TTS within ~1 s (Req 4.4). */
  onStop: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG icon helpers (aria-hidden; accessible name comes from the button's
// aria-label — Req 10.4)
// ─────────────────────────────────────────────────────────────────────────────

function MicIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      {/* Microphone body */}
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Z" />
      {/* Stand arm */}
      <path d="M19 11a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V22h-2v2h6v-2h-2v-2.06A9 9 0 0 0 21 11h-2Z" />
    </svg>
  );
}

function MicOffIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      {/* Diagonal slash */}
      <path d="M2.28 3 1 4.27l6.97 6.97A7 7 0 0 0 19 11h-2a5 5 0 0 1-7.93 4.06L7.5 13.5A4 4 0 0 0 16 11V5a4 4 0 0 0-4-4 4 4 0 0 0-3.75 2.64L2.28 3ZM8 5.17V11a4 4 0 0 0 4.83 3.92L8 5.17ZM21 11h-2a7 7 0 0 1-.12 1.28l1.52 1.52A8.96 8.96 0 0 0 21 11ZM3 11H1a9 9 0 0 0 14.2 7.38l-1.44-1.44A7 7 0 0 1 3 11Zm9 9.94V22h-2v2h6v-2h-2v-2.06a8.86 8.86 0 0 0 1-.2l-1.52-1.52A7.1 7.1 0 0 1 12 20.94Z" />
    </svg>
  );
}

function ReplayIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8Z" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared button class builder
// ─────────────────────────────────────────────────────────────────────────────

const BASE_BTN =
  'inline-flex items-center justify-center rounded-full p-2 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus-visible:ring-2 ' +
  'focus-visible:ring-[#9b5de5]/50 disabled:cursor-not-allowed disabled:opacity-50';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VoiceControls renders the mic toggle, replay, and stop buttons alongside a
 * live-status indicator for the voice answering experience.
 *
 * - Mic toggle: shown when `isSttSupported` is true.
 * - Replay: shown when `isTtsSupported` is true.
 * - Stop: shown only while `isSpeaking` is true.
 * - Live-status indicator: pulsing dot shown while `isListening` is true.
 */
export function VoiceControls({
  isListening,
  isSpeaking,
  isTtsSupported,
  isSttSupported,
  onMicToggle,
  onReplay,
  onStop,
}: IVoiceControlsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Voice controls">
      {/* ── Mic toggle ──────────────────────────────────────────────────── */}
      {isSttSupported && (
        <button
          type="button"
          onClick={onMicToggle}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          aria-pressed={isListening}
          className={
            isListening
              ? `${BASE_BTN} bg-red-100 text-red-600 hover:bg-red-200`
              : `${BASE_BTN} bg-[#9b5de5]/10 text-[#9b5de5] hover:bg-[#9b5de5]/20`
          }
        >
          {isListening ? <MicOffIcon /> : <MicIcon />}
        </button>
      )}

      {/* ── Live-status indicator (pulsing dot while recording) ─────────── */}
      {isListening && (
        <span
          aria-hidden="true"
          className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"
          title="Recording…"
        />
      )}

      {/* ── Replay ──────────────────────────────────────────────────────── */}
      {isTtsSupported && (
        <button
          type="button"
          onClick={onReplay}
          aria-label="Replay question"
          className={`${BASE_BTN} bg-[#9b5de5]/10 text-[#9b5de5] hover:bg-[#9b5de5]/20`}
        >
          <ReplayIcon />
        </button>
      )}

      {/* ── Stop TTS ────────────────────────────────────────────────────── */}
      {isSpeaking && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop playback"
          className={`${BASE_BTN} bg-amber-100 text-amber-700 hover:bg-amber-200`}
        >
          <StopIcon />
        </button>
      )}
    </div>
  );
}
