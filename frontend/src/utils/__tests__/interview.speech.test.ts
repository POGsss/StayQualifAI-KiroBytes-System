/**
 * Property-based tests for the speech pure utilities.
 *
 * Feature: interview-chat-voice
 * Properties covered:
 *   Property 3 – speechReducer never loses or duplicates a finalized segment
 *   Property 4 – chunkForSpeech covers the text with no loss or duplication and respects the limit
 *
 * Validates: Requirements 5.5, 5.6, 5.7, 5.8 (Property 3)
 * Validates: Requirements 4.2 (Property 4)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { speechReducer, chunkForSpeech } from '../interview.speech';
import type { ISpeechState, SpeechEvent } from '../../types/interview.types';

// ─────────────────────────────────────────────────────────────────────────────
// Property 3: The speech accumulator never loses or duplicates a finalized segment
// Feature: interview-chat-voice, Property 3: The speech accumulator never loses or duplicates a finalized segment
// ─────────────────────────────────────────────────────────────────────────────

describe('speechReducer – Property 3', () => {
  /**
   * Arbitrary SpeechEvent sequence:
   *   start → N × result (optional finalChunk + arbitrary interim) → interleaved end → stop
   */
  const speechEventSequenceArb = fc.record({
    finalChunks: fc.array(fc.string({ maxLength: 100 }), { minLength: 0, maxLength: 20 }),
    interimTexts: fc.array(fc.string({ maxLength: 80 }), { minLength: 0, maxLength: 20 }),
    endPositions: fc.array(fc.nat({ max: 19 }), { minLength: 0, maxLength: 5 }),
  });

  it(
    // Feature: interview-chat-voice, Property 3: The speech accumulator never loses or duplicates a finalized segment
    'accumulates every final chunk exactly once and flushes interim on stop',
    () => {
      fc.assert(
        fc.property(speechEventSequenceArb, ({ finalChunks, interimTexts, endPositions }) => {
          const initial: ISpeechState = {
            finalText: '',
            interimText: '',
            capturing: false,
          };

          // Build an event sequence
          const events: SpeechEvent[] = [{ kind: 'start' }];

          const maxSteps = Math.max(finalChunks.length, interimTexts.length);
          const endSet = new Set(endPositions.map((p) => p % (maxSteps + 1)));

          for (let i = 0; i < maxSteps; i++) {
            if (endSet.has(i)) {
              events.push({ kind: 'end' });
            }
            events.push({
              kind: 'result',
              finalChunk: finalChunks[i] ?? null,
              interim: interimTexts[i] ?? '',
            });
          }

          // terminal end then stop
          events.push({ kind: 'end' });
          events.push({ kind: 'stop' });

          // Run all events through the reducer
          let state = initial;
          for (const event of events) {
            state = speechReducer(state, event);
          }

          // Build expected finalText: all finalChunks in order + last interim (flushed at stop)
          // The interim is replaced at each result, so whatever the last result's interim was
          // gets flushed. We need to track what interim was set before stop.
          let simulatedInterim = '';
          let simulatedFinal = '';
          let simCapturing = false;

          for (const event of events) {
            switch (event.kind) {
              case 'start':
                simCapturing = true;
                break;
              case 'result':
                simulatedFinal += event.finalChunk ?? '';
                simulatedInterim = event.interim;
                break;
              case 'end':
                // preserve state
                break;
              case 'stop':
                simulatedFinal += simulatedInterim;
                simulatedInterim = '';
                simCapturing = false;
                break;
            }
          }

          // Assertions
          expect(state.finalText).toBe(simulatedFinal);
          expect(state.interimText).toBe('');
          expect(state.capturing).toBe(false);

          // Transcript is preserved across 'end' — verified implicitly by the
          // simulation logic above (end does not clear finalText).
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: interview-chat-voice, Property 3: The speech accumulator never loses or duplicates a finalized segment
    'preserves the accumulated transcript across an end event',
    () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          fc.string({ maxLength: 200 }),
          (chunk1, chunk2) => {
            const initial: ISpeechState = { finalText: '', interimText: '', capturing: false };

            const s1 = speechReducer(initial, { kind: 'start' });
            const s2 = speechReducer(s1, { kind: 'result', finalChunk: chunk1, interim: '' });
            const s3 = speechReducer(s2, { kind: 'end' }); // must preserve finalText
            const s4 = speechReducer(s3, { kind: 'result', finalChunk: chunk2, interim: '' });
            const s5 = speechReducer(s4, { kind: 'stop' });

            expect(s3.finalText).toBe(chunk1);
            expect(s5.finalText).toBe(chunk1 + chunk2);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 4: Speech chunking covers the text with no loss or duplication and
//             respects the limit
// Feature: interview-chat-voice, Property 4: Speech chunking covers the text with no loss or duplication and respects the limit
// ─────────────────────────────────────────────────────────────────────────────

describe('chunkForSpeech – Property 4', () => {
  /**
   * Validates: Requirements 4.2
   *
   * Generator covers:
   *   - empty string
   *   - strings shorter than the limit
   *   - strings much longer than the limit
   *   - no-whitespace strings (forces hard splits)
   *   - multi-sentence strings (exercises sentence-boundary splits)
   *   - unicode strings
   */
  const chunkArb = fc.record({
    text: fc.oneof(
      fc.constant(''),
      fc.string({ maxLength: 50 }),
      fc.string({ minLength: 201, maxLength: 1000 }),
      // No-whitespace strings
      fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), { maxLength: 500 }),
      // Multi-sentence
      fc.string({ maxLength: 300 }).map((s) => s + '. Another sentence. And more.'),
    ),
    limit: fc.integer({ min: 1, max: 400 }),
  });

  it(
    // Feature: interview-chat-voice, Property 4: Speech chunking covers the text with no loss or duplication and respects the limit
    'chunks.join("") === text  AND  every chunk length <= limit',
    () => {
      fc.assert(
        fc.property(chunkArb, ({ text, limit }) => {
          const chunks = chunkForSpeech(text, limit);

          // P4-a: no loss, no duplication
          expect(chunks.join('')).toBe(text);

          // P4-b: every chunk respects the limit
          for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(limit);
          }

          // P4-c: empty input → join still equals empty string
          // (already covered by P4-a, but make the invariant explicit)
          if (text === '') {
            expect(chunks.join('')).toBe('');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: interview-chat-voice, Property 4: Speech chunking covers the text with no loss or duplication and respects the limit
    'returns a single chunk when text.length <= limit',
    () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          fc.integer({ min: 1, max: 400 }),
          (text, limit) => {
            fc.pre(text.length <= limit);
            const chunks = chunkForSpeech(text, limit);
            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toBe(text);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    // Feature: interview-chat-voice, Property 4: Speech chunking covers the text with no loss or duplication and respects the limit
    'handles limit=1 (every character becomes its own chunk)',
    () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 50 }), (text) => {
          const chunks = chunkForSpeech(text, 1);
          expect(chunks.join('')).toBe(text);
          for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(1);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 5: Recognition language falls back to en-US only when absent
// Feature: interview-chat-voice, Property 5: Recognition language falls back to en-US only when absent
// ─────────────────────────────────────────────────────────────────────────────

import { resolveRecognitionLang } from '../interview.speech';

/**
 * Validates: Requirements 5.2, 5.3
 *
 * For any input (string | undefined):
 *   - undefined          → 'en-US'
 *   - empty string ''    → 'en-US'
 *   - whitespace-only    → 'en-US'
 *   - non-empty, non-whitespace string → returned as-is (identity)
 */
describe('resolveRecognitionLang – Property 5', () => {
  it(
    // Feature: interview-chat-voice, Property 5: Recognition language falls back to en-US only when absent
    'returns en-US when absent (undefined / empty / whitespace), identity otherwise',
    () => {
      const langArb = fc.oneof(
        fc.constant(undefined),
        fc.constant(''),
        fc.constant('   '),
        fc.constant('\t'),
        // Non-empty strings that should be returned as-is
        fc.string({ minLength: 1 }).filter(s => s.trim() !== ''),
      );

      fc.assert(
        fc.property(langArb, (input) => {
          const result = resolveRecognitionLang(input);

          if (input === undefined || input.trim() === '') {
            // Absent input → must fall back to 'en-US'
            expect(result).toBe('en-US');
          } else {
            // Non-empty, non-whitespace → identity
            expect(result).toBe(input);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
