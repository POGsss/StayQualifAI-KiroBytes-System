// Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
// Feature: interview-chat-voice, Property 2: Response latency is a non-negative, whole-second, mode-independent function

/**
 * Property-based tests for `deriveChatThread` and `computeResponseLatencySeconds`.
 *
 * Validates (Property 1): Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 10.1
 * Validates (Property 2): Requirements 6.2, 6.3, 6.4
 *
 * Uses fast-check 3.23.2 + Vitest 2.1.8.
 * Minimum 100 iterations per property (numRuns: 100).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { deriveChatThread, computeResponseLatencySeconds } from '../interview.chat';
import type { IInterviewQuestion } from '../../types/interview.types';

// ---------------------------------------------------------------------------
// Generator helpers
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a list of IInterviewQuestion with unique, sequential positions.
 *
 * Positions are reassigned after generation (map step) so they are always
 * unique and 1-based — matching the production data contract (position is a
 * 1-based index unique within a session).
 *
 * `answerText` is either a string (possibly empty) or null, modelling the two
 * possible states (answered / unanswered).
 *
 * Text fields include arbitrary unicode and whitespace strings.
 */
const questionListArb: fc.Arbitrary<IInterviewQuestion[]> = fc
  .array(
    fc.record({
      id: fc.uuid(),
      sessionId: fc.uuid(),
      position: fc.integer({ min: 1, max: 50 }), // will be overwritten below
      text: fc.string({ minLength: 1, maxLength: 500 }),
      answerText: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: null }),
      responseLatencySeconds: fc.option(fc.integer({ min: 0, max: 3600 }), { nil: null }),
      evaluation: fc.constant(null),
    }),
    { minLength: 0, maxLength: 15 },
  )
  .map(
    // Assign unique, sequential 1-based positions regardless of generator output
    (questions) => questions.map((q, i) => ({ ...q, position: i + 1 })),
  );

/**
 * Deterministic "shuffle" that reverses the array — sufficient to test that
 * deriveChatThread's output is independent of input ordering.
 */
function deterministicShuffle<T>(arr: readonly T[]): T[] {
  return [...arr].reverse();
}

// ---------------------------------------------------------------------------
// Property 1: Chat-thread derivation is a correct pure function of the session's questions
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 10.1
// ---------------------------------------------------------------------------

describe('deriveChatThread — Property 1', () => {
  it('messages are ordered strictly by ascending position (Req 2.2)', () => {
    // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
    fc.assert(
      fc.property(questionListArb, (questions) => {
        const { messages } = deriveChatThread(questions);

        for (let i = 1; i < messages.length; i++) {
          // Each message's position must be >= the previous one.
          // Two consecutive messages can share a position (assistant then user
          // for the same question), but the position must never go backwards.
          expect(messages[i].position).toBeGreaterThanOrEqual(messages[i - 1].position);
        }
      }),
      { numRuns: 100 },
    );
  });

  it(
    'answered questions produce an assistant message immediately followed by a user message with correct texts (Req 2.3, 2.4)',
    () => {
      // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
      fc.assert(
        fc.property(questionListArb, (questions) => {
          const answeredById = new Map(
            questions.filter((q) => q.answerText !== null).map((q) => [q.id, q]),
          );
          const { messages } = deriveChatThread(questions);

          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const sourceId = msg.id.split(':')[0];

            if (msg.role === 'assistant' && answeredById.has(sourceId)) {
              // The next message must be the user companion for this question
              const next = messages[i + 1];
              expect(next).toBeDefined();
              expect(next.role).toBe('user');
              expect(next.position).toBe(msg.position);
              expect(next.id).toBe(`${sourceId}:user`);

              // Text content correctness (Req 10.1 — captions always present)
              const source = answeredById.get(sourceId)!;
              expect(msg.text).toBe(source.text);
              expect(next.text).toBe(source.answerText);
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'currentQuestion is the lowest-positioned unanswered question, or null when all are answered (Req 2.5)',
    () => {
      // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
      fc.assert(
        fc.property(questionListArb, (questions) => {
          const { currentQuestion } = deriveChatThread(questions);

          const unanswered = questions
            .filter((q) => q.answerText === null)
            .sort((a, b) => a.position - b.position);

          if (unanswered.length === 0) {
            // All answered — currentQuestion must be null
            expect(currentQuestion).toBeNull();
          } else {
            // Must be the lowest-positioned unanswered question
            expect(currentQuestion).not.toBeNull();
            expect(currentQuestion!.id).toBe(unanswered[0].id);
            expect(currentQuestion!.position).toBe(unanswered[0].position);
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'no trailing assistant message when all questions are answered — currentQuestion is null and last message is user (Req 2.3)',
    () => {
      // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
      fc.assert(
        fc.property(questionListArb, (questions) => {
          const { messages, currentQuestion } = deriveChatThread(questions);

          if (currentQuestion === null && messages.length > 0) {
            // When all questions are answered, every assistant message has a
            // user companion, so the very last message in the thread is a user message.
            const last = messages[messages.length - 1];
            expect(last.role).toBe('user');
          }
        }),
        { numRuns: 100 },
      );
    },
  );

  it('answeredCount equals the number of questions with non-null answerText (Req 2.6)', () => {
    // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
    fc.assert(
      fc.property(questionListArb, (questions) => {
        const { answeredCount } = deriveChatThread(questions);
        const expected = questions.filter((q) => q.answerText !== null).length;
        expect(answeredCount).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('totalCount equals questions.length (Req 2.6)', () => {
    // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
    fc.assert(
      fc.property(questionListArb, (questions) => {
        const { totalCount } = deriveChatThread(questions);
        expect(totalCount).toBe(questions.length);
      }),
      { numRuns: 100 },
    );
  });

  it(
    'reconstruction: re-shuffling the input and re-deriving produces the identical thread (Req 2.8)',
    () => {
      // Feature: interview-chat-voice, Property 1: Chat-thread derivation is a correct pure function of the session's questions
      fc.assert(
        fc.property(questionListArb, (questions) => {
          const original = deriveChatThread(questions);
          const reshuffled = deterministicShuffle(questions);
          const reconstructed = deriveChatThread(reshuffled);

          // messages must be identical (same count, same content in same order)
          expect(reconstructed.messages.length).toBe(original.messages.length);
          for (let i = 0; i < original.messages.length; i++) {
            expect(reconstructed.messages[i]).toEqual(original.messages[i]);
          }

          // currentQuestion must match
          expect(reconstructed.currentQuestion?.id ?? null).toBe(
            original.currentQuestion?.id ?? null,
          );
          expect(reconstructed.currentQuestion?.position ?? null).toBe(
            original.currentQuestion?.position ?? null,
          );

          // counts must match
          expect(reconstructed.answeredCount).toBe(original.answeredCount);
          expect(reconstructed.totalCount).toBe(original.totalCount);
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 2: Response latency is a non-negative, whole-second, mode-independent function
// Validates: Requirements 6.2, 6.3, 6.4
// ---------------------------------------------------------------------------

describe('computeResponseLatencySeconds', () => {
  /**
   * Property 2: Response latency is a non-negative, whole-second, mode-independent function
   *
   * Validates: Requirements 6.2, 6.3, 6.4
   *
   * For any pair of timestamps (presentedAt: number | undefined, sentAt: number):
   *   1. The result is always a non-negative integer (>= 0)
   *   2. When presentedAt is undefined, result is exactly 0
   *   3. When sentAt < presentedAt (negative delta), result is 0 (clamped)
   *   4. When sentAt >= presentedAt, result equals Math.round((sentAt - presentedAt) / 1000)
   */
  it(
    'Property 2: result is a non-negative integer equal to max(0, round(delta/1000)), and 0 when presentedAt is undefined',
    () => {
      // Feature: interview-chat-voice, Property 2: Response latency is a non-negative, whole-second, mode-independent function
      // Generator covers both the undefined-presentedAt case and arbitrary timestamp pairs
      const latencyArb = fc.oneof(
        // presentedAt undefined case
        fc.record({ presentedAt: fc.constant(undefined), sentAt: fc.integer() }),
        // general case: sentAt may be below, equal to, or above presentedAt
        fc.record({
          presentedAt: fc.integer({ min: 0, max: 1_000_000 }),
          sentAt: fc.integer({ min: 0, max: 2_000_000 }),
        }),
      );

      fc.assert(
        fc.property(latencyArb, ({ presentedAt, sentAt }) => {
          const result = computeResponseLatencySeconds(presentedAt, sentAt);

          // 1. Result is always a non-negative integer
          expect(result).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result)).toBe(true);

          if (presentedAt === undefined) {
            // 2. presentedAt undefined → always 0
            expect(result).toBe(0);
          } else {
            const delta = sentAt - presentedAt;
            if (delta < 0) {
              // 3. Negative delta is clamped to 0
              expect(result).toBe(0);
            } else {
              // 4. Non-negative delta → round to nearest whole second
              expect(result).toBe(Math.round(delta / 1000));
            }
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
