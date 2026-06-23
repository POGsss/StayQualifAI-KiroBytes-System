/**
 * useSpeechRecognition — STT wrapper over the Web Speech API.
 *
 * Encapsulates every Chrome quirk so pages never touch the raw API:
 *  - Support detection via SpeechRecognition ?? webkitSpeechRecognition (Req 8.1)
 *  - Language via resolveRecognitionLang(navigator.language) (Req 5.2, 5.3)
 *  - Interim + final results pushed through speechReducer (Req 5.5)
 *  - onend auto-restart while capturing with a small gap (Req 5.7)
 *  - No restart after userStoppedRef is set (Req 5.8)
 *  - Flush interim on stop (Req 5.6)
 *  - transcriptRef mirrors live transcript for synchronous read-at-send (Req 5.10)
 *  - Permission: onerror not-allowed/service-not-allowed → denied (Req 9.1-9.3)
 *  - Start timeout: if capture doesn't begin within startTimeoutMs → error (Req 8.3, 9.5)
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 5.10, 8.1, 8.3, 9.1, 9.2, 9.3, 9.5
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { ISpeechState, SpeechEvent, SpeechPermission, SpeechRecognitionErrorKind } from '../types/interview.types';
import { resolveRecognitionLang, speechReducer } from '../utils/interview.speech';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IUseSpeechRecognition {
  /** Web Speech API present in this browser (Req 8.1). */
  readonly isSupported: boolean;
  /** True while a recognition session is active. */
  readonly isListening: boolean;
  /** Finalized + interim transcript for live captioning (Req 5.4). */
  readonly transcript: string;
  /** Synchronous mirror of `transcript` for read-at-send (Req 5.10). */
  readonly transcriptRef: React.MutableRefObject<string>;
  /** Latest permission state derived from prompt/onerror (Req 9). */
  readonly permission: SpeechPermission;
  /** Non-null when recognition errored or failed to start in time (Req 8.3, 9.3). */
  readonly error: SpeechRecognitionErrorKind | null;
  /** Begin capture; requests mic permission if needed (Req 5.1, 9.1). */
  startListening: () => void;
  /** Stop capture, flush interim, suppress auto-restart (Req 5.6, 5.8). */
  stopListening: () => void;
  /** Reset the accumulated transcript for the next question. */
  clearTranscript: () => void;
}

export interface IUseSpeechRecognitionOptions {
  /** BCP-47 override; defaults to navigator.language → en-US (Req 5.2, 5.3). */
  lang?: string;
  /** Max ms to wait for capture to actually start before erroring (Req 8.3). */
  startTimeoutMs?: number; // default 5000
  /** Gap before auto-restart after onend (Req 5.7). */
  restartGapMs?: number; // default ~80
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser type shim
// ─────────────────────────────────────────────────────────────────────────────

// The Web Speech API types are in lib.dom.d.ts but webkitSpeechRecognition
// is not standardised there. We declare a minimal extension.
declare global {
  interface Window {
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Support detection helper (run once per module load)
// ─────────────────────────────────────────────────────────────────────────────

function getSpeechRecognitionConstructor(): typeof SpeechRecognition | null {
  if (typeof window === 'undefined') return null;
  const ctor =
    (window as Window).SpeechRecognition ??
    (window as Window).webkitSpeechRecognition;
  return ctor ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial reducer state
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_SPEECH_STATE: ISpeechState = {
  finalText: '',
  interimText: '',
  capturing: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSpeechRecognition(
  options?: IUseSpeechRecognitionOptions,
): IUseSpeechRecognition {
  const startTimeoutMs = options?.startTimeoutMs ?? 5000;
  const restartGapMs = options?.restartGapMs ?? 80;
  const langOverride = options?.lang;

  // ── Support detection ────────────────────────────────────────────────────
  const isSupported = useMemo(() => getSpeechRecognitionConstructor() !== null, []);

  // ── Reducer for transcript accumulation ──────────────────────────────────
  const [state, dispatch] = useReducer(speechReducer, INITIAL_SPEECH_STATE);

  // ── Synchronous mirror ref (Req 5.10) ────────────────────────────────────
  // Initialised to '' — synced to the visible transcript in the effect below.
  const transcriptRef = useRef<string>('');

  // ── Listening state ───────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);

  // ── Permission state (Req 9) ──────────────────────────────────────────────
  const [permission, setPermission] = useState<SpeechPermission>('unknown');

  // ── Error state (Req 8.3, 9.3) ───────────────────────────────────────────
  const [error, setError] = useState<SpeechRecognitionErrorKind | null>(null);

  // ── Internal refs ─────────────────────────────────────────────────────────
  /** The live recognition instance, replaced on each startListening call. */
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /**
   * Set true before recognition.stop() so onend won't restart (Req 5.8).
   * Reset to false at the top of startListening.
   */
  const userStoppedRef = useRef<boolean>(false);

  /**
   * Whether capture is currently considered "active" — mirrors state.capturing
   * but available synchronously inside event handlers without stale closure risk.
   */
  const capturingRef = useRef<boolean>(false);

  /** Timer handle for the start timeout (Req 8.3, 9.5). */
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Timer handle for the restart gap (Req 5.7). */
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearStartTimeout(): void {
    if (startTimeoutRef.current !== null) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
  }

  function clearRestartTimer(): void {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  // ── startListening ────────────────────────────────────────────────────────

  const startListening = useCallback((): void => {
    if (!isSupported) return;

    const Ctor = getSpeechRecognitionConstructor();
    if (Ctor === null) return;

    // Reset user-stopped flag so onend can auto-restart (Req 5.8)
    userStoppedRef.current = false;
    capturingRef.current = true;

    // Clear any previous error
    setError(null);

    // Abort previous instance if still running
    if (recognitionRef.current !== null) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore — may already be stopped
      }
    }

    const recognition = new Ctor();
    recognitionRef.current = recognition;

    // Language (Req 5.2, 5.3)
    recognition.lang = langOverride ?? resolveRecognitionLang(navigator.language);
    recognition.continuous = true;
    recognition.interimResults = true;

    // ── Event: audio/sound start — clears the start timeout (Req 8.3, 9.5) ──
    recognition.onaudiostart = (): void => {
      clearStartTimeout();
    };

    recognition.onsoundstart = (): void => {
      clearStartTimeout();
    };

    // ── Event: recognition session started → permission granted (Req 9.2) ──
    recognition.onstart = (): void => {
      setPermission('granted');
      setIsListening(true);
      // Dispatch start event to reducer
      const event: SpeechEvent = { kind: 'start' };
      dispatch(event);
    };

    // ── Event: result (Req 5.4, 5.5) ─────────────────────────────────────
    recognition.onresult = (ev: SpeechRecognitionEvent): void => {
      // Clear start timeout on first result (Req 8.3, 9.5)
      clearStartTimeout();

      let finalChunk = '';
      let interimText = '';

      // Iterate over all results from the last-processed index onward
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result === undefined) continue;
        const alt = result[0];
        if (alt === undefined) continue;

        if (result.isFinal) {
          finalChunk += alt.transcript;
        } else {
          interimText += alt.transcript;
        }
      }

      const resultEvent: SpeechEvent = {
        kind: 'result',
        finalChunk: finalChunk.length > 0 ? finalChunk : null,
        interim: interimText,
      };
      dispatch(resultEvent);
    };

    // ── Event: end — auto-restart or clean up (Req 5.7, 5.8) ────────────
    recognition.onend = (): void => {
      setIsListening(false);

      // Push 'end' through the reducer so it can react to the boundary
      const endEvent: SpeechEvent = { kind: 'end' };
      dispatch(endEvent);

      if (capturingRef.current && !userStoppedRef.current) {
        // Auto-restart with a small gap to avoid Chrome's "already started" race (Req 5.7)
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (capturingRef.current && !userStoppedRef.current) {
            const currentCtor = getSpeechRecognitionConstructor();
            if (currentCtor === null) return;

            // Reuse the existing recognition instance instead of creating a new one
            // so that transcript state accumulated via speechReducer is preserved.
            try {
              recognition.start();
              setIsListening(true);
            } catch {
              // If start() throws (e.g. already started), silently ignore.
            }
          }
        }, restartGapMs);
      }
    };

    // ── Event: error (Req 9.1, 9.2, 9.3) ─────────────────────────────────
    recognition.onerror = (ev: SpeechRecognitionErrorEvent): void => {
      clearStartTimeout();

      const errorCode = ev.error;

      if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
        // Permission denied (Req 9.1, 9.3)
        setPermission('denied');
        setIsListening(false);
        capturingRef.current = false;
        userStoppedRef.current = true; // prevent auto-restart
        setError(errorCode);
      } else if (errorCode === 'no-speech') {
        // No-speech is non-fatal; onend will fire and auto-restart handles it.
        // We don't set a terminal error here.
      } else {
        // Surface all other errors
        setError(errorCode);
      }
    };

    // ── Start timeout guard (Req 8.3, 9.5) ──────────────────────────────
    startTimeoutRef.current = setTimeout(() => {
      // If we're still waiting for capture to begin, abort and surface error
      if (capturingRef.current && !userStoppedRef.current) {
        capturingRef.current = false;
        userStoppedRef.current = true;
        setIsListening(false);
        setError('audio-capture');
        try {
          recognition.abort();
        } catch {
          // ignore
        }
      }
    }, startTimeoutMs);

    try {
      recognition.start();
    } catch {
      clearStartTimeout();
      setError('audio-capture');
      capturingRef.current = false;
    }
  }, [isSupported, langOverride, restartGapMs, startTimeoutMs]);

  // ── stopListening ─────────────────────────────────────────────────────────

  const stopListening = useCallback((): void => {
    clearStartTimeout();
    clearRestartTimer();

    // Set flag before calling stop() so onend handler won't restart (Req 5.8)
    userStoppedRef.current = true;
    capturingRef.current = false;

    // Flush interim into final (Req 5.6)
    const stopEvent: SpeechEvent = { kind: 'stop' };
    dispatch(stopEvent);

    setIsListening(false);

    if (recognitionRef.current !== null) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore — may already be stopped
      }
    }
  }, []);

  // ── clearTranscript ───────────────────────────────────────────────────────

  const clearTranscript = useCallback((): void => {
    // Hard-reset the reducer so the next question starts from an empty
    // transcript. This prevents the previous answer from being appended to
    // (concatenated with) the current spoken answer.
    dispatch({ kind: 'reset' });
  }, []);

  // Derive the visible transcript directly from the reducer state.
  const visibleTranscript = state.finalText + state.interimText;

  // Sync transcriptRef to the visible transcript for synchronous read-at-send.
  useEffect(() => {
    transcriptRef.current = visibleTranscript;
  }, [visibleTranscript]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return (): void => {
      clearStartTimeout();
      clearRestartTimer();
      capturingRef.current = false;
      userStoppedRef.current = true;
      if (recognitionRef.current !== null) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    isSupported,
    isListening,
    transcript: visibleTranscript,
    transcriptRef,
    permission,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
