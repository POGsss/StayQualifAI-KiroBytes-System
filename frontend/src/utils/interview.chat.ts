/**
 * Pure utilities for the Interview Chat feature.
 *
 * These functions contain no side effects and no framework dependencies —
 * they are extracted specifically to be property-tested (Properties 1 & 2).
 *
 * Named exports, explicit return types, no `any`.
 */

import type {
  IInterviewQuestion,
  IDerivedThread,
  ChatMessage,
} from '../types/interview.types';

/**
 * Derive the ordered Chat_Thread and Current_Question purely from session data.
 *
 * - Questions are sorted by ascending 1-based `position`.
 * - Each answered question (answerText != null) contributes:
 *     1. An `assistant` message with id `${q.id}:assistant` carrying `q.text`
 *     2. A `user` message with id `${q.id}:user` carrying `q.answerText`
 * - The `currentQuestion` is the lowest-positioned unanswered question.
 *   If it exists, an `assistant` message is appended for it but NO `user` message.
 * - When no unanswered question remains, `currentQuestion` is `null` and no
 *   trailing `assistant` message is added.
 * - `answeredCount` = count of questions where `answerText != null`.
 * - `totalCount` = total number of questions.
 *
 * Because this is a pure function of `questions` (which already carries
 * `answerText`), reopening/reconstructing the thread from a fresh load is free —
 * the same call produces the identical result (Req 2.8).
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.8
 */
export function deriveChatThread(
  questions: ReadonlyArray<IInterviewQuestion>,
): IDerivedThread {
  // Sort a copy by ascending position (Req 2.2)
  const sorted = [...questions].sort((a, b) => a.position - b.position);

  const messages: ChatMessage[] = [];
  let currentQuestion: IInterviewQuestion | null = null;

  for (const q of sorted) {
    if (q.answerText !== null) {
      // Answered — emit assistant + user pair (Req 2.3, 2.4)
      messages.push({
        id: `${q.id}:assistant`,
        role: 'assistant',
        text: q.text,
        position: q.position,
      });
      messages.push({
        id: `${q.id}:user`,
        role: 'user',
        text: q.answerText,
        position: q.position,
      });
    } else if (currentQuestion === null) {
      // First unanswered — this is the current question (Req 2.5)
      currentQuestion = q;
      // Emit only the assistant message; no user message yet (Req 2.3)
      messages.push({
        id: `${q.id}:assistant`,
        role: 'assistant',
        text: q.text,
        position: q.position,
      });
    }
    // Unanswered questions beyond the current one are not rendered
  }

  const answeredCount = sorted.filter((q) => q.answerText !== null).length;
  const totalCount = sorted.length;

  return {
    messages,
    currentQuestion,
    answeredCount,
    totalCount,
  };
}

/**
 * Compute the non-negative, whole-second elapsed time between when a question
 * was first presented and when the user sent their answer.
 *
 * - Returns `Math.max(0, Math.round((sentAt - presentedAt) / 1000))`.
 * - Returns `0` when `presentedAt` is `undefined` (question was never stamped,
 *   e.g. first render in a remounted session).
 * - Identical for both text and voice modes (Req 6.2, 6.3, 6.4).
 *
 * Validates: Requirements 6.2, 6.3, 6.4
 */
export function computeResponseLatencySeconds(
  presentedAt: number | undefined,
  sentAt: number,
): number {
  if (presentedAt === undefined) {
    return 0;
  }
  return Math.max(0, Math.round((sentAt - presentedAt) / 1000));
}
