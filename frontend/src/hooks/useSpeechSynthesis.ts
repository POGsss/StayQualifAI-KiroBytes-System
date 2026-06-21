/**
 * useSpeechSynthesis — TTS wrapper over the browser's `speechSynthesis` API.
 *
 * Exposes `IUseSpeechSynthesis`:
 *   - isSupported  — `'speechSynthesis' in window` (Req 8.1)
 *   - isSpeaking   — true while any chunk is being spoken
 *   - error        — non-null when synthesis failed (Req 4.7)
 *   - speak(text)  — chunk via `chunkForSpeech(text, 200)`, chain via onend (Req 4.1, 4.2)
 *   - cancel()     — halt playback within ~1 s (Req 4.4)
 *
 * Key behaviours:
 *   - Chunked, chained playback: each utterance's `onend` fires the next chunk
 *     so the full text is spoken in order (Req 4.2).
 *   - Cancel lock: calling `speak()` while already speaking cancels the current
 *     playback then restarts, preventing overlap (Req 4.3).
 *   - Error surface: `utterance.onerror` flips `isSpeaking` false and sets an
 *     error message the caller can render as "audio playback failed" (Req 4.7).
 *   - Cleanup: cancels on component unmount.
 *
 * Named export. Explicit return types. No `any`.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 8.1
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { chunkForSpeech } from '../utils/interview.speech';

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IUseSpeechSynthesis {
  /** `speechSynthesis` present in this browser (Req 8.1). */
  readonly isSupported: boolean;
  /** True while any chunk of the current question is being spoken. */
  readonly isSpeaking: boolean;
  /** Non-null when synthesis failed after starting (Req 4.7). */
  readonly error: string | null;
  /**
   * Speak the text (chunked + chained); cancels any in-flight playback before
   * starting so replay mid-speech does not cause overlap (Req 4.1–4.3).
   */
  speak: (text: string) => void;
  /** Stop playback within ~1 s (Req 4.4). */
  cancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Support detection — evaluated lazily inside the hook so that tests can stub
// `window.speechSynthesis` via `vi.stubGlobal` in beforeEach and still have
// the hook pick up the stub on each render.
// ─────────────────────────────────────────────────────────────────────────────

function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TTS hook wrapping `window.speechSynthesis`.
 *
 * All playback state is hook-local; this hook never calls the store or the
 * network.
 */
export function useSpeechSynthesis(): IUseSpeechSynthesis {
  // Evaluate support once per hook call (not at module load) so stubs applied
  // via vi.stubGlobal in beforeEach are visible here (Req 8.1).
  const supported = isSpeechSynthesisSupported();

  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // `isSpeakingRef` mirrors the React state synchronously so the `speak`
  // callback can read the current playback state without capturing a stale
  // closure value (Req 4.3).
  const isSpeakingRef = useRef<boolean>(false);

  // ── Internal cancel ───────────────────────────────────────────────────────

  const cancelInternal = useCallback((): void => {
    if (!isSpeechSynthesisSupported()) return;
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // ── speak ─────────────────────────────────────────────────────────────────

  const speak = useCallback(
    (text: string): void => {
      if (!isSpeechSynthesisSupported()) return;

      // Cancel any current playback before starting — prevents overlap when
      // replay is pressed mid-speech (Req 4.3).
      if (isSpeakingRef.current) {
        cancelInternal();
      }

      // Clear previous error state.
      setError(null);

      const chunks = chunkForSpeech(text, 200);

      // Edge case: empty text produces a single empty chunk — nothing to speak.
      if (chunks.length === 0 || (chunks.length === 1 && chunks[0] === '')) {
        return;
      }

      // Mark speaking before the first speak() call so `isSpeaking` is true
      // as soon as playback is requested (Req 4.1 — start within 2 s).
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      // Build SpeechSynthesisUtterance objects for all chunks up-front so the
      // chaining closures below capture stable references.
      const utterances = chunks.map((chunk) => new SpeechSynthesisUtterance(chunk));

      // Chain: each utterance's onend fires the next one.
      utterances.forEach((utterance, index) => {
        utterance.onend = (): void => {
          const next = utterances[index + 1];
          if (next !== undefined) {
            // Continue to the next chunk.
            window.speechSynthesis.speak(next);
          } else {
            // All chunks finished — clear speaking state.
            isSpeakingRef.current = false;
            setIsSpeaking(false);
          }
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
          // Surface the error for the caller to render as "audio playback
          // failed" while keeping the caption visible (Req 4.7).
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setError(`Speech synthesis error: ${event.error}`);
        };
      });

      // Kick off playback with the first chunk. The browser handles the actual
      // audio start; `speak()` returns immediately so we remain within the 2 s
      // constraint (Req 4.1).
      const firstUtterance = utterances[0];
      if (firstUtterance !== undefined) {
        window.speechSynthesis.speak(firstUtterance);
      }
    },
    [cancelInternal],
  );

  // ── cancel (public) ───────────────────────────────────────────────────────

  const cancel = useCallback((): void => {
    cancelInternal();
  }, [cancelInternal]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return (): void => {
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    isSupported: supported,
    isSpeaking,
    error,
    speak,
    cancel,
  } as const;
}
