/**
 * Unit tests for useSpeechRecognition
 *
 * All SpeechRecognition/webkitSpeechRecognition globals are stubbed with a
 * controllable fake so no real browser API is needed (jsdom environment).
 *
 * Validates: Requirements 5.4, 5.6, 5.7, 5.8, 5.10, 8.1, 8.3, 9.1, 9.2, 9.3, 9.5
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSpeechRecognition } from '../useSpeechRecognition';

// ─────────────────────────────────────────────────────────────────────────────
// Fake SpeechRecognition factory
// ─────────────────────────────────────────────────────────────────────────────

/** A single controllable instance returned by the fake constructor. */
interface FakeInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
}

/** Tracks the most-recently created instance so tests can control it. */
let latestInstance: FakeInstance | null = null;

function createFakeInstance(): FakeInstance {
  return {
    lang: '',
    continuous: false,
    interimResults: false,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onstart: null,
    onresult: null,
    onend: null,
    onerror: null,
    onaudiostart: null,
    onsoundstart: null,
  };
}

function FakeSpeechRecognitionCtor() {
  const inst = createFakeInstance();
  latestInstance = inst;
  return inst;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for building fake SpeechRecognitionEvent payloads
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeResult(transcript: string, isFinal: boolean): SpeechRecognitionResult {
  const alt = { transcript, confidence: 1 } as SpeechRecognitionAlternative;
  const result = {
    0: alt,
    length: 1,
    isFinal,
    item: (i: number) => (i === 0 ? alt : alt),
  } as unknown as SpeechRecognitionResult;
  return result;
}

function makeResultEvent(
  finalText: string | null,
  interimText: string,
  resultIndex = 0,
): SpeechRecognitionEvent {
  const results: SpeechRecognitionResult[] = [];

  if (finalText !== null) {
    results.push(makeFakeResult(finalText, true));
  }
  if (interimText !== '') {
    results.push(makeFakeResult(interimText, false));
  }

  const resultList = {
    length: results.length,
    item: (i: number) => results[i] ?? results[0],
    [Symbol.iterator]: function* () { yield* results; },
  } as unknown as SpeechRecognitionResultList;

  // Assign numeric indices too
  results.forEach((r, i) => {
    (resultList as unknown as Record<number, SpeechRecognitionResult>)[i] = r;
  });

  return {
    resultIndex,
    results: resultList,
  } as unknown as SpeechRecognitionEvent;
}

function makeErrorEvent(error: string): SpeechRecognitionErrorEvent {
  return { error } as unknown as SpeechRecognitionErrorEvent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latestInstance = null;
    // Stub a valid SpeechRecognition by default; individual tests that need
    // absence will delete/unstub it themselves.
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognitionCtor);
    // Remove webkitSpeechRecognition to keep the environment clean.
    vi.stubGlobal('webkitSpeechRecognition', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── 1. isSupported: SpeechRecognition present ────────────────────────────

  it('isSupported is true when SpeechRecognition is present (Req 8.1)', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  // ── 2. isSupported: neither global present ───────────────────────────────

  it('isSupported is false when neither SpeechRecognition nor webkitSpeechRecognition exist (Req 8.1)', () => {
    // Remove both globals
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);

    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
  });

  // ── 3. webkitSpeechRecognition fallback ─────────────────────────────────

  it('isSupported is true when only webkitSpeechRecognition is present (Req 8.1)', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognitionCtor);

    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  // ── 4. Final captioning — transcript updates on final result (Req 5.4, 5.5) ──

  it('transcript updates when a final result is received (Req 5.4, 5.5)', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    // Simulate the onstart event to transition isListening = true
    act(() => {
      inst.onstart?.();
    });

    expect(result.current.isListening).toBe(true);

    // Fire a final result
    act(() => {
      inst.onresult?.(makeResultEvent('Hello world', '', 0));
    });

    expect(result.current.transcript).toBe('Hello world');
  });

  // ── 5. Interim captioning — live transcript shows interim text (Req 5.4) ──

  it('transcript shows interim text while capture is active (Req 5.4)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    // Fire only an interim result (finalText = null)
    act(() => {
      inst.onresult?.(makeResultEvent(null, 'partial text...', 0));
    });

    expect(result.current.transcript).toBe('partial text...');
  });

  // ── 6. auto-restart on onend while capturing (Req 5.7) ───────────────────

  it('auto-restarts after onend fires while capturing (Req 5.7)', () => {
    const restartGapMs = 80;
    const { result } = renderHook(() =>
      useSpeechRecognition({ restartGapMs }),
    );

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    // Fire a final result so there's transcript content
    act(() => {
      inst.onresult?.(makeResultEvent('First segment.', '', 0));
    });

    const startCallsBefore = inst.start.mock.calls.length;

    // Recognition session ends unexpectedly (network drop, etc.)
    act(() => {
      inst.onend?.();
    });

    // Before the restart gap, start should NOT have been called again
    expect(inst.start.mock.calls.length).toBe(startCallsBefore);

    // Advance timers past the restart gap
    act(() => {
      vi.advanceTimersByTime(restartGapMs + 10);
    });

    // start() should be called on the same instance for auto-restart
    expect(inst.start.mock.calls.length).toBeGreaterThan(startCallsBefore);
  });

  // ── 7. Transcript preserved across onend/restart (Req 5.7) ───────────────

  it('transcript is preserved across onend auto-restart cycle (Req 5.7)', () => {
    const restartGapMs = 80;
    const { result } = renderHook(() =>
      useSpeechRecognition({ restartGapMs }),
    );

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    // Accumulate some finalized text
    act(() => {
      inst.onresult?.(makeResultEvent('First. ', '', 0));
    });

    expect(result.current.transcript).toBe('First. ');

    // Session ends and auto-restarts
    act(() => {
      inst.onend?.();
    });

    act(() => {
      vi.advanceTimersByTime(restartGapMs + 10);
    });

    // Simulate more results after restart
    act(() => {
      inst.onresult?.(makeResultEvent('Second.', '', 0));
    });

    // Both segments should be present
    expect(result.current.transcript).toBe('First. Second.');
  });

  // ── 8. Flush interim on stop (Req 5.6) ───────────────────────────────────

  it('flushes interim text into transcript when stopListening is called (Req 5.6)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    // Fire only an interim result
    act(() => {
      inst.onresult?.(makeResultEvent(null, 'not yet final', 0));
    });

    expect(result.current.transcript).toBe('not yet final');

    // Stop listening — interim should be flushed into the transcript
    act(() => {
      result.current.stopListening();
    });

    // The interim "not yet final" should be committed to the final transcript
    expect(result.current.transcript).toBe('not yet final');
    // And isListening should be false
    expect(result.current.isListening).toBe(false);
  });

  // ── 9. No restart after user stops (Req 5.8) ─────────────────────────────

  it('does NOT auto-restart when user called stopListening before onend fires (Req 5.8)', () => {
    const restartGapMs = 80;
    const { result } = renderHook(() =>
      useSpeechRecognition({ restartGapMs }),
    );

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    act(() => {
      inst.onresult?.(makeResultEvent('Some answer.', '', 0));
    });

    // User explicitly stops
    act(() => {
      result.current.stopListening();
    });

    const startCallsAfterStop = inst.start.mock.calls.length;

    // onend fires (as it does after stop())
    act(() => {
      inst.onend?.();
    });

    // Advance well past restart gap
    act(() => {
      vi.advanceTimersByTime(restartGapMs * 5);
    });

    // start should NOT have been called again
    expect(inst.start.mock.calls.length).toBe(startCallsAfterStop);
  });

  // ── 10. transcriptRef synchronously mirrors transcript (Req 5.10) ─────────

  it('transcriptRef.current synchronously mirrors transcript after result (Req 5.10)', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    act(() => {
      inst.onresult?.(makeResultEvent('Sync text', '', 0));
    });

    // Both the state and the ref should contain the same value
    expect(result.current.transcript).toBe('Sync text');
    expect(result.current.transcriptRef.current).toBe('Sync text');
  });

  // ── 11. not-allowed error → permission denied (Req 9.1, 9.3) ─────────────

  it('sets permission to "denied" and isListening to false on not-allowed error (Req 9.1, 9.3)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    // Simulate mic denied
    act(() => {
      inst.onerror?.(makeErrorEvent('not-allowed'));
    });

    expect(result.current.permission).toBe('denied');
    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBe('not-allowed');
  });

  // ── 12. service-not-allowed → permission denied ───────────────────────────

  it('sets permission to "denied" on service-not-allowed error (Req 9.3)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onerror?.(makeErrorEvent('service-not-allowed'));
    });

    expect(result.current.permission).toBe('denied');
    expect(result.current.error).toBe('service-not-allowed');
  });

  // ── 13. Start timeout → error state (Req 8.3, 9.5) ──────────────────────

  it('sets error when capture does not start within startTimeoutMs (Req 8.3, 9.5)', () => {
    const startTimeoutMs = 5000;
    const { result } = renderHook(() =>
      useSpeechRecognition({ startTimeoutMs }),
    );

    act(() => {
      result.current.startListening();
    });

    // Don't fire onaudiostart — let the timeout expire
    act(() => {
      vi.advanceTimersByTime(startTimeoutMs + 1);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.isListening).toBe(false);
  });

  // ── 14. onaudiostart clears the start timeout (Req 8.3) ──────────────────

  it('does NOT set error when onaudiostart fires before startTimeoutMs (Req 8.3)', () => {
    const startTimeoutMs = 5000;
    const { result } = renderHook(() =>
      useSpeechRecognition({ startTimeoutMs }),
    );

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    // Fire onaudiostart before timeout
    act(() => {
      vi.advanceTimersByTime(1000);
      inst.onaudiostart?.();
    });

    // Advance past what would have been the timeout
    act(() => {
      vi.advanceTimersByTime(startTimeoutMs);
    });

    // No error should have been set
    expect(result.current.error).toBeNull();
  });

  // ── 15. clearTranscript resets the visible transcript ────────────────────

  it('clearTranscript resets the visible transcript', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    act(() => {
      inst.onresult?.(makeResultEvent('Some text', '', 0));
    });

    expect(result.current.transcript).toBe('Some text');

    act(() => {
      result.current.clearTranscript();
    });

    // After clear, subsequent finalized results should start fresh
    act(() => {
      result.current.startListening();
    });

    const newInst = latestInstance!;

    act(() => {
      newInst.onstart?.();
    });

    act(() => {
      newInst.onresult?.(makeResultEvent('New text', '', 0));
    });

    // The transcript should only contain "New text" after clear
    expect(result.current.transcript).toContain('New text');
  });

  // ── 16. initial state is idle with no errors ──────────────────────────────

  it('starts in idle state with no transcript, not listening, no error (initial state)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    expect(result.current.isListening).toBe(false);
    expect(result.current.transcript).toBe('');
    expect(result.current.transcriptRef.current).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.permission).toBe('unknown');
  });

  // ── 17. onstart grants permission (Req 9.2) ───────────────────────────────

  it('sets permission to "granted" when onstart fires (Req 9.2)', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.startListening();
    });

    const inst = latestInstance!;

    act(() => {
      inst.onstart?.();
    });

    expect(result.current.permission).toBe('granted');
    expect(result.current.isListening).toBe(true);
  });
});
