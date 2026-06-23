/**
 * Unit tests for `useSpeechSynthesis`
 *
 * Stubs `window.speechSynthesis` and `SpeechSynthesisUtterance` via
 * `vi.stubGlobal` so the hook runs entirely in jsdom with no real audio.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.7
 */

import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSpeechSynthesis } from '../useSpeechSynthesis';

// ─────────────────────────────────────────────────────────────────────────────
// Fake utterance tracking — lets tests fire onend / onerror manually
// ─────────────────────────────────────────────────────────────────────────────

interface FakeUtterance {
  text: string;
  onend: (() => void) | null;
  onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null;
}

const utteranceInstances: FakeUtterance[] = [];

const fakeSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset utterance tracking and all mock call counts.
  utteranceInstances.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Fake SpeechSynthesisUtterance — captures instances so tests can fire
  // their onend / onerror callbacks.
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      onend: (() => void) | null = null;
      onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null;

      constructor(text: string) {
        this.text = text;
        utteranceInstances.push(this as unknown as FakeUtterance);
      }
    },
  );

  vi.stubGlobal('speechSynthesis', fakeSpeechSynthesis);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useSpeechSynthesis', () => {
  // ── 1. Support detection ──────────────────────────────────────────────────

  it('reports isSupported true when speechSynthesis is present in window', () => {
    // speechSynthesis is already stubbed on window in beforeEach.
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(true);
  });

  // ── 2. speak() starts immediately — isSpeaking + speak call (Req 4.1) ─────

  it('sets isSpeaking to true and calls speechSynthesis.speak immediately when speak() is invoked (Req 4.1)', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Hello');
    });

    // isSpeaking should flip synchronously (before any timers advance).
    expect(result.current.isSpeaking).toBe(true);
    expect(fakeSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    // The utterance passed to speak() should carry the short text verbatim.
    expect(utteranceInstances[0]!.text).toBe('Hello');
  });

  // ── 3. Chunk chaining for long text (Req 4.2) ─────────────────────────────

  it('chains chunks in order for text > 200 chars — speak() fires once per chunk via onend (Req 4.2)', () => {
    // Build a string that will produce at least 2 chunks (each ≤ 200 chars).
    // 210-char string with a sentence boundary in the middle.
    const sentence1 =
      'This is the first sentence of the long test text, designed to be well over one hundred characters long here.';
    const sentence2 =
      'This is the second sentence of the long test text, also designed to be over one hundred characters long ok.';
    const longText = `${sentence1} ${sentence2}`;
    expect(longText.length).toBeGreaterThan(200);

    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak(longText);
    });

    // First chunk spoken immediately.
    expect(fakeSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(utteranceInstances.length).toBeGreaterThanOrEqual(2);

    // Fire the first utterance's onend to trigger the second chunk.
    act(() => {
      utteranceInstances[0]!.onend!();
    });

    // Second chunk should now have been spoken.
    expect(fakeSpeechSynthesis.speak).toHaveBeenCalledTimes(2);
    expect(result.current.isSpeaking).toBe(true);
  });

  // ── 4. cancel() stops playback (Req 4.4) ──────────────────────────────────

  it('calls speechSynthesis.cancel and sets isSpeaking to false when cancel() is called (Req 4.4)', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Hello');
    });

    expect(result.current.isSpeaking).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(fakeSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  // ── 5. Replay lock — cancel before re-speak (Req 4.3) ────────────────────

  it('cancels current playback before restarting when speak() is called while already speaking (Req 4.3)', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    // First call — starts playback.
    act(() => {
      result.current.speak('First utterance');
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(fakeSpeechSynthesis.cancel).not.toHaveBeenCalled();

    // Second call mid-playback — should cancel first before speaking again.
    act(() => {
      result.current.speak('Replay utterance');
    });

    // cancel() must have been called to stop the first playback.
    expect(fakeSpeechSynthesis.cancel).toHaveBeenCalled();
    // speak() total calls: 1 (first) + 1 (replay) = 2.
    expect(fakeSpeechSynthesis.speak).toHaveBeenCalledTimes(2);
    expect(result.current.isSpeaking).toBe(true);
  });

  // ── 6. onerror surfaces error and clears isSpeaking (Req 4.7) ────────────

  it('sets error to a non-null string and isSpeaking to false when the utterance fires onerror (Req 4.7)', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Hello');
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(result.current.error).toBeNull();

    act(() => {
      // Fire the error event on the first utterance.
      utteranceInstances[0]!.onerror!({
        error: 'synthesis-failed',
      } as SpeechSynthesisErrorEvent);
    });

    expect(result.current.error).not.toBeNull();
    expect(typeof result.current.error).toBe('string');
    expect(result.current.isSpeaking).toBe(false);
  });
});
