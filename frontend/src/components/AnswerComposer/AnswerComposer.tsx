/**
 * AnswerComposer — the answer-input surface for both text and voice modes.
 *
 * Text mode (Req 3.1–3.7):
 *   - Renders a <textarea> for typing answers.
 *   - Send disabled when: trimmed value is empty, value.length > maxLength, or isSubmitting.
 *   - When over maxLength: shows an associated error message via aria-describedby.
 *   - On send: calls onSend(textarea.value.trim()) and clears the field.
 *
 * Voice mode (Req 5.1, 5.9, 5.11–5.13):
 *   - Embeds VoiceControls (mic toggle).
 *   - Shows live transcript from recognition.transcript as caption text while listening.
 *   - Provides an always-editable transcript input (allows typing while listening — Req 5.13).
 *   - Syncs the editable field to recognition.transcript updates from the STT engine.
 *   - On send: calls onSend(voiceText.trim()).
 *   - Send disabled when: editable transcript is empty/whitespace, length > maxLength, or isSubmitting.
 *
 * Fallback / permission notices (Req 8.3, 9.3, 9.6):
 *   - Renders fallbackNotice inline when non-null.
 *   - When recognition.permission === 'denied', shows mic re-enable instructions.
 *
 * Accessibility (Req 10.7):
 *   - All validation/error messages associated via aria-describedby on the control.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.9, 5.11, 5.12, 5.13, 9.6, 10.7
 */

import { type JSX, useEffect, useId, useState } from 'react';
import type { InterviewMode } from '../../types/interview.types';
import type { IUseSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { VoiceControls } from '../VoiceControls';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface IAnswerComposerProps {
  mode: InterviewMode;
  /** Disabled while a submit is in flight (Req 3.7). */
  isSubmitting: boolean;
  /** STT surface for voice mode (Req 5). */
  recognition: IUseSpeechRecognition;
  /** Called with the exact text to submit. */
  onSend: (answerText: string) => void;
  /** Voice → text fallback notice to render inline, if any (Req 8.3, 9.3). */
  fallbackNotice: string | null;
  /** Max answer length (5,000). */
  maxLength: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Tailwind helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEXTAREA_BASE =
  'w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm ' +
  'text-[#1a1a1a] placeholder-gray-400 shadow-sm transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 focus:border-[#9b5de5] ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const TEXTAREA_ERROR = 'border-red-400 focus:border-red-400 focus:ring-red-400/40';

const SEND_BTN_BASE =
  'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium ' +
  'transition-colors focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/50 ' +
  'focus-visible:ring-2 focus-visible:ring-[#9b5de5]/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const SEND_BTN_ACTIVE =
  'bg-[#9b5de5] text-white hover:bg-[#8a4fd4] active:bg-[#7a3fc4]';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AnswerComposer({
  mode,
  isSubmitting,
  recognition,
  onSend,
  fallbackNotice,
  maxLength,
}: IAnswerComposerProps): JSX.Element {
  // ── Text mode state ────────────────────────────────────────────────────────
  const [textValue, setTextValue] = useState<string>('');

  // ── Voice mode state (controlled mirror of the live transcript) ────────────
  const [voiceText, setVoiceText] = useState<string>('');

  // ── Stable IDs for aria-describedby associations (Req 10.7) ────────────────
  const textErrorId = useId();
  const voiceErrorId = useId();
  const fallbackNoticeId = useId();

  // ── Sync voiceText when transcript updates from the STT engine ────────────
  // The field is always editable (Req 5.13), so only sync when the recognition
  // engine pushes new text — user edits are preserved between engine events.
  useEffect(() => {
    if (mode === 'voice') {
      setVoiceText(recognition.transcript);
    }
  }, [mode, recognition.transcript]);

  // Reset voice text when switching back to voice mode (clear stale transcript)
  useEffect(() => {
    if (mode === 'voice') {
      setVoiceText(recognition.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Derived validation ────────────────────────────────────────────────────
  const textTrimmed = textValue.trim();
  const isTextOverLimit = textValue.length > maxLength;
  const isTextSendDisabled =
    isSubmitting || textTrimmed.length === 0 || isTextOverLimit;

  const voiceTrimmed = voiceText.trim();
  const isVoiceOverLimit = voiceText.length > maxLength;
  const isVoiceSendDisabled =
    isSubmitting || voiceTrimmed.length === 0 || isVoiceOverLimit;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTextSend = (): void => {
    if (isTextSendDisabled) return;
    onSend(textValue.trim());
    setTextValue('');
  };

  const handleVoiceSend = (): void => {
    if (isVoiceSendDisabled) return;
    onSend(voiceText.trim());
    setVoiceText('');
  };

  const handleTextKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    // Ctrl+Enter / Cmd+Enter submits in text mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleTextSend();
    }
  };

  const handleVoiceKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleVoiceSend();
    }
  };

  // ── Mic toggle ────────────────────────────────────────────────────────────
  const handleMicToggle = (): void => {
    if (recognition.isListening) {
      recognition.stopListening();
    } else {
      recognition.startListening();
    }
  };

  // ── Build aria-describedby lists ──────────────────────────────────────────
  const textDescribedBy = [
    isTextOverLimit ? textErrorId : null,
    fallbackNotice ? fallbackNoticeId : null,
  ]
    .filter(Boolean)
    .join(' ');

  const voiceDescribedBy = [
    isVoiceOverLimit ? voiceErrorId : null,
    fallbackNotice ? fallbackNoticeId : null,
  ]
    .filter(Boolean)
    .join(' ');

  // ── Permission denied: instructional path (Req 9.6) ───────────────────────
  const showPermissionDenied =
    mode === 'voice' && recognition.permission === 'denied';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* ── Fallback notice (Req 8.3, 9.3) ──────────────────────────────── */}
      {fallbackNotice !== null && (
        <p
          id={fallbackNoticeId}
          role="status"
          aria-live="polite"
          className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800 border border-amber-200"
        >
          {fallbackNotice}
        </p>
      )}

      {/* ── Mic permission denied instructions (Req 9.6) ─────────────────── */}
      {showPermissionDenied && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 border border-red-200"
        >
          Microphone access was denied. To re-enable it, open your browser
          settings, find the microphone permission for this site, and set it to{' '}
          <strong>Allow</strong>. Then reload the page to try again.
        </p>
      )}

      {mode === 'text' ? (
        /* ================================================================
           TEXT MODE
           ================================================================ */
        <div className="flex flex-col gap-2">
          <label htmlFor="answer-textarea" className="sr-only">
            Your answer
          </label>
          <textarea
            id="answer-textarea"
            rows={4}
            placeholder="Type your answer here… (Ctrl+Enter to send)"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={handleTextKeyDown}
            disabled={isSubmitting}
            aria-describedby={textDescribedBy || undefined}
            className={`${TEXTAREA_BASE} ${isTextOverLimit ? TEXTAREA_ERROR : ''}`}
          />

          {/* Character count / over-limit error */}
          <div className="flex items-center justify-between gap-2">
            {isTextOverLimit ? (
              <p
                id={textErrorId}
                role="alert"
                className="text-xs text-red-600"
              >
                Answer is too long (max {maxLength.toLocaleString()} characters)
              </p>
            ) : (
              <span aria-hidden="true" />
            )}
            <span
              className={`ml-auto text-xs tabular-nums ${
                isTextOverLimit ? 'text-red-600 font-medium' : 'text-gray-400'
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {textValue.length.toLocaleString()} / {maxLength.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleTextSend}
              disabled={isTextSendDisabled}
              className={`${SEND_BTN_BASE} ${isTextSendDisabled ? '' : SEND_BTN_ACTIVE}`}
            >
              {isSubmitting ? 'Sending…' : 'Send Answer'}
            </button>
          </div>
        </div>
      ) : (
        /* ================================================================
           VOICE MODE
           ================================================================ */
        <div className="flex flex-col gap-3">
          {/* Mic controls (Req 5.1) */}
          <div className="flex items-center gap-3">
            <VoiceControls
              isListening={recognition.isListening}
              isSpeaking={false}
              isTtsSupported={false}
              isSttSupported={recognition.isSupported}
              onMicToggle={handleMicToggle}
              onReplay={() => {
                /* replay handled by InterviewChatPage */
              }}
              onStop={() => {
                /* TTS stop handled by InterviewChatPage */
              }}
            />
            {recognition.isListening && (
              <span className="text-sm text-gray-500 italic">Listening…</span>
            )}
          </div>

          {/* Live caption while listening (Req 5.4, 5.9) */}
          {recognition.isListening && recognition.transcript.length > 0 && (
            <p
              aria-live="polite"
              aria-atomic="false"
              className="rounded-lg bg-[#9b5de5]/5 px-4 py-2.5 text-sm text-[#1a1a1a] border border-[#9b5de5]/20 min-h-[2.5rem]"
            >
              <span className="text-xs font-medium text-[#9b5de5] uppercase tracking-wide mr-2">
                Live:
              </span>
              {recognition.transcript}
            </p>
          )}

          {/* Editable transcript input — always visible in voice mode (Req 5.9, 5.13) */}
          <div className="flex flex-col gap-2">
            <label htmlFor="voice-transcript" className="text-xs font-medium text-gray-600">
              Transcript{recognition.isListening ? ' (editing while recording)' : ''}
            </label>
            <textarea
              id="voice-transcript"
              rows={4}
              placeholder={
                recognition.isSupported
                  ? 'Start the mic to capture your answer, or type here…'
                  : 'Type your answer here…'
              }
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              onKeyDown={handleVoiceKeyDown}
              disabled={isSubmitting}
              aria-describedby={voiceDescribedBy || undefined}
              className={`${TEXTAREA_BASE} ${isVoiceOverLimit ? TEXTAREA_ERROR : ''}`}
            />

            {/* Character count / over-limit error */}
            <div className="flex items-center justify-between gap-2">
              {isVoiceOverLimit ? (
                <p
                  id={voiceErrorId}
                  role="alert"
                  className="text-xs text-red-600"
                >
                  Answer is too long (max {maxLength.toLocaleString()} characters)
                </p>
              ) : (
                <span aria-hidden="true" />
              )}
              <span
                className={`ml-auto text-xs tabular-nums ${
                  isVoiceOverLimit ? 'text-red-600 font-medium' : 'text-gray-400'
                }`}
                aria-live="polite"
                aria-atomic="true"
              >
                {voiceText.length.toLocaleString()} / {maxLength.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleVoiceSend}
                disabled={isVoiceSendDisabled}
                className={`${SEND_BTN_BASE} ${isVoiceSendDisabled ? '' : SEND_BTN_ACTIVE}`}
              >
                {isSubmitting ? 'Sending…' : 'Send Answer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
