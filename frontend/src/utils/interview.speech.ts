/**
 * Pure speech utilities for the Interview Chat & Voice feature.
 *
 * Three framework-free, property-testable functions:
 *   - speechReducer   — accumulates Web Speech API events without losing/duplicating finalized segments
 *   - chunkForSpeech  — splits text into ordered ≤limit chunks whose join() reconstructs the original
 *   - resolveRecognitionLang — returns the navigator language or falls back to 'en-US'
 *
 * Requirements: 4.2, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8
 */

import type { ISpeechState, SpeechEvent } from '../types/interview.types';

// ─────────────────────────────────────────────────────────────────────────────
// speechReducer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure accumulator for Web Speech API events.
 *
 * Transitions:
 *   start  → set capturing true; preserve existing transcript
 *   result → append finalChunk (exactly once) to finalText; replace interimText
 *   end    → preserve full state (auto-restart boundary; hook responsibility)
 *   stop   → flush interimText into finalText; set capturing false
 *   reset  → clear all accumulated transcript (used when a new question starts)
 *
 * Never loses or duplicates a finalized segment (Requirements 5.5, 5.6, 5.7, 5.8).
 */
export function speechReducer(
  state: ISpeechState,
  event: SpeechEvent,
): ISpeechState {
  switch (event.kind) {
    case 'start':
      return { ...state, capturing: true };

    case 'result':
      return {
        ...state,
        finalText: state.finalText + (event.finalChunk ?? ''),
        interimText: event.interim,
      };

    case 'end':
      // Preserve the accumulated transcript exactly as-is.
      // The hook is responsible for deciding whether to auto-restart.
      return { ...state };

    case 'stop':
      // Flush any outstanding interim text into the finalized transcript
      // and mark capture as intentionally stopped.
      return {
        finalText: state.finalText + state.interimText,
        interimText: '',
        capturing: false,
      };

    case 'reset':
      // Hard-clear the accumulated transcript so the next question starts
      // from a clean slate (prevents the previous answer leaking into the
      // current one).
      return {
        finalText: '',
        interimText: '',
        capturing: false,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// chunkForSpeech
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split `text` into ordered chunks each `<= limit` characters.
 *
 * Guarantee: `chunks.join('') === text` (no loss, no duplication).
 *
 * Strategy (in priority order):
 *   1. If text.length <= limit, return [text] (handles empty string too).
 *   2. Try to break on a sentence boundary (`. `, `! `, `? `) — the delimiter
 *      stays in the preceding chunk so punctuation is preserved.
 *   3. Fall back to breaking on a word boundary (space).
 *   4. Hard-split at limit if no whitespace break is available (e.g. a very
 *      long unbroken token).
 *
 * Requirement 4.2
 */
export function chunkForSpeech(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);

    // 1. Try sentence boundary within the window.
    //    We look for `. `, `! `, or `? ` — the character *after* the punctuation
    //    is a space, so we split after the space to keep the delimiter in the
    //    current chunk.
    const sentenceBoundary = findLastSentenceBoundary(window);
    if (sentenceBoundary !== -1) {
      chunks.push(remaining.slice(0, sentenceBoundary));
      remaining = remaining.slice(sentenceBoundary);
      continue;
    }

    // 2. Try word boundary (last space within window).
    const wordBoundary = window.lastIndexOf(' ');
    if (wordBoundary !== -1) {
      // Split after the space so the space goes with the left chunk,
      // preserving the invariant: chunks.join('') === original.
      // We include the space in the current chunk (split point = wordBoundary + 1).
      chunks.push(remaining.slice(0, wordBoundary + 1));
      remaining = remaining.slice(wordBoundary + 1);
      continue;
    }

    // 3. Hard-split — no boundary found in the window.
    chunks.push(remaining.slice(0, limit));
    remaining = remaining.slice(limit);
  }

  // Push whatever is left (always length <= limit after the loop).
  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Return the index of the character immediately after the last sentence-ending
 * delimiter (`. `, `! `, `? `) found within `window`, or -1 if none.
 *
 * We split *after* the space that follows the punctuation so the delimiter
 * stays in the left chunk, keeping the join-reconstruction invariant intact.
 */
function findLastSentenceBoundary(window: string): number {
  const delimiters = ['. ', '! ', '? '];
  let best = -1;

  for (const delim of delimiters) {
    let pos = 0;
    while (pos < window.length) {
      const idx = window.indexOf(delim, pos);
      if (idx === -1) break;
      // Split point: right after the full delimiter (punctuation + space).
      const splitAt = idx + delim.length;
      if (splitAt > best) {
        best = splitAt;
      }
      pos = idx + 1;
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveRecognitionLang
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a BCP-47 language tag for SpeechRecognition.
 *
 * Returns `navigatorLanguage` when it is a non-empty, non-whitespace string,
 * otherwise returns `'en-US'`.
 *
 * Requirements 5.2, 5.3
 */
export function resolveRecognitionLang(
  navigatorLanguage: string | undefined,
): string {
  if (navigatorLanguage !== undefined && navigatorLanguage.trim() !== '') {
    return navigatorLanguage;
  }
  return 'en-US';
}
