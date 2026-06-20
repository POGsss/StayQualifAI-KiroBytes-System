/**
 * Property-based test for the Question_Generator post-generation invariants
 * (interview spec task 6.2).
 *
 * // Feature: interview, Property 6: Question generation satisfies its post-invariants
 *
 * Validates: Requirements 2.1, 2.6
 *
 * Property 6 states that question generation satisfies its post-invariants:
 *   - An ACCEPTED question set has exactly `Question_Count` questions, each with
 *     non-empty text and no two texts identical within the session; on success
 *     the questions are persisted (a single insert of `Question_Count` rows) and
 *     the session transitions PENDING → ACTIVE.
 *   - A VIOLATING set (wrong count, empty/whitespace text, or duplicate text) is
 *     treated as an `AiProviderError`: nothing is persisted and the session is
 *     left `PENDING` (no insert, no transition to ACTIVE, no rollback delete
 *     because nothing was inserted).
 *
 * The AI_Provider wrapper (`generateJson`) is mocked so the test exercises the
 * generator's own invariant-enforcement and persistence logic rather than
 * Gemini. The Supabase client is a chainable stub that records insert / update /
 * delete calls so the property can assert exactly what was (or was not)
 * persisted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DifficultyTier,
  IInterviewSession,
} from '../src/types/interview.types.js';
import { AiProviderError } from '../src/utils/errors.js';

// Mock the module-local AI wrapper so `generateJson` returns a controlled
// `{ questions: [...] }` payload. The real wrapper would talk to Gemini and
// apply its own Zod schema; mocking it lets us feed both well-formed and
// deliberately-violating sets straight into the generator's invariant logic.
vi.mock('../src/services/interview.aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { generateQuestions } from '../src/services/interview.questionGenerator.service.js';

const mockedGenerateJson = vi.mocked(generateJson);

const TIERS: readonly DifficultyTier[] = ['ENTRY', 'MID', 'SENIOR', 'LEAD'];

/** Chainable thenable returned by the mocked `update(...)` call. */
interface UpdateChain {
  eq(): UpdateChain;
  then<TResult>(
    onfulfilled: (value: { error: null }) => TResult
  ): Promise<TResult>;
}

/** Records the persistence operations the generator performs on Supabase. */
interface PersistenceCalls {
  /** How many times `interview_questions.insert(...)` was invoked. */
  insertCount: number;
  /** The rows passed to the most recent insert (or null if never called). */
  insertRows: Array<{ text: string; position: number }> | null;
  /** How many times the session was updated to the ACTIVE state. */
  updateToActiveCount: number;
  /** How many times a rollback delete on `interview_questions` ran. */
  deleteCount: number;
}

/**
 * Build a chainable Supabase stub mirroring the exact call chains used by the
 * Question_Generator:
 *   - insert:   from(t).insert(rows).select(cols).returns()  → { data, error }
 *   - activate: from(t).update({state:'ACTIVE'}).eq().eq().eq() → { error }
 *   - rollback: from(t).delete().eq('session_id', id)          → { error }
 * On the happy path the insert echoes the rows back as full question rows so the
 * generator can map them to domain objects.
 */
function createMockSupabase(): {
  client: SupabaseClient;
  calls: PersistenceCalls;
} {
  const calls: PersistenceCalls = {
    insertCount: 0,
    insertRows: null,
    updateToActiveCount: 0,
    deleteCount: 0,
  };

  const client = {
    from(_table: string) {
      return {
        insert(rows: Array<{ text: string; position: number }>) {
          calls.insertCount += 1;
          calls.insertRows = rows;
          return {
            select(_columns: string) {
              return {
                returns() {
                  const data = rows.map((row, index) => ({
                    id: `question-${index}`,
                    user_id: 'user-1',
                    session_id: 'session-1',
                    position: row.position,
                    text: row.text,
                    answer_text: null,
                    response_latency_seconds: null,
                    quality_score: null,
                    grammar_score: null,
                    feedback_comment: null,
                    created_at: '2024-01-01T00:00:00.000Z',
                  }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
        update(payload: { state?: string }) {
          if (payload.state === 'ACTIVE') {
            calls.updateToActiveCount += 1;
          }
          const chain: UpdateChain = {
            eq(): UpdateChain {
              return chain;
            },
            then<TResult>(
              onfulfilled: (value: { error: null }) => TResult
            ): Promise<TResult> {
              return Promise.resolve({ error: null }).then(onfulfilled);
            },
          };
          return chain;
        },
        delete() {
          return {
            eq() {
              calls.deleteCount += 1;
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

/** Construct a PENDING session with the given question count and tier. */
function makeSession(
  questionCount: number,
  difficultyTier: DifficultyTier
): IInterviewSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    state: 'PENDING',
    difficultyTier,
    jobDescription: 'Build and operate a scalable web service.',
    questionCount,
    resumeVersionId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/**
 * Generator for ACCEPTED sets: exactly `questionCount` questions whose trimmed
 * texts are non-empty and pairwise unique. The `Q{n}:` prefix guarantees both
 * properties regardless of the random body content.
 */
const acceptedArb = fc
  .record({
    questionCount: fc.integer({ min: 5, max: 15 }),
    tier: fc.constantFrom(...TIERS),
    bodies: fc.array(fc.string(), { minLength: 15, maxLength: 15 }),
  })
  .map(({ questionCount, tier, bodies }) => ({
    questionCount,
    tier,
    texts: Array.from(
      { length: questionCount },
      (_, i) => `Q${i + 1}: ${bodies[i] ?? ''}`
    ),
  }));

/**
 * Generator for VIOLATING sets that break at least one post-invariant relative
 * to the requested `questionCount`: a wrong count, an empty/whitespace text, or
 * a duplicate text.
 */
const violatingArb = fc
  .integer({ min: 5, max: 15 })
  .chain((questionCount) =>
    fc.oneof(
      // Kind 1 — wrong count (otherwise unique, non-empty texts).
      fc
        .integer({ min: 0, max: 20 })
        .filter((count) => count !== questionCount)
        .map((count) => ({
          questionCount,
          questions: Array.from({ length: count }, (_, i) => ({
            text: `Q${i + 1}: unique`,
          })),
          kind: 'wrong-count' as const,
        })),
      // Kind 2 — correct count but one empty/whitespace text.
      fc
        .record({
          blankIndex: fc.integer({ min: 0, max: questionCount - 1 }),
          blank: fc.constantFrom('', '   ', '\t', '\n  ', '  \t '),
        })
        .map(({ blankIndex, blank }) => {
          const questions = Array.from({ length: questionCount }, (_, i) => ({
            text: `Q${i + 1}: t`,
          }));
          questions[blankIndex] = { text: blank };
          return {
            questionCount,
            questions,
            kind: 'blank' as const,
          };
        }),
      // Kind 3 — correct count but two identical (duplicate) texts.
      fc
        .record({
          a: fc.integer({ min: 0, max: questionCount - 1 }),
          b: fc.integer({ min: 0, max: questionCount - 1 }),
        })
        .filter(({ a, b }) => a !== b)
        .map(({ a, b }) => {
          const questions = Array.from({ length: questionCount }, (_, i) => ({
            text: `Q${i + 1}: t`,
          }));
          const source = questions[a];
          if (source !== undefined) {
            questions[b] = { text: source.text };
          }
          return {
            questionCount,
            questions,
            kind: 'duplicate' as const,
          };
        })
    )
  );

describe('Question_Generator post-generation invariants (Property 6)', () => {
  beforeEach(() => {
    mockedGenerateJson.mockReset();
  });

  it('accepts only sets with exactly Question_Count non-empty unique texts and persists + activates them', async () => {
    // // Feature: interview, Property 6: Question generation satisfies its post-invariants
    await fc.assert(
      fc.asyncProperty(acceptedArb, async ({ questionCount, tier, texts }) => {
        mockedGenerateJson.mockResolvedValue({
          questions: texts.map((text) => ({ text })),
        });
        const { client, calls } = createMockSupabase();
        const session = makeSession(questionCount, tier);

        const result = await generateQuestions(client, session);

        // Exactly Question_Count questions, non-empty and unique (Req 2.1, 2.6).
        expect(result).toHaveLength(questionCount);
        const resultTexts = result.map((question) => question.text);
        expect(new Set(resultTexts).size).toBe(questionCount);
        for (const text of resultTexts) {
          expect(text.trim().length).toBeGreaterThan(0);
        }
        // Ordered by 1-based position.
        expect(result.map((question) => question.position)).toEqual(
          Array.from({ length: questionCount }, (_, i) => i + 1)
        );
        // Persisted once with Question_Count rows, and session activated (Req 2.2).
        expect(calls.insertCount).toBe(1);
        expect(calls.insertRows).toHaveLength(questionCount);
        expect(calls.updateToActiveCount).toBe(1);
        expect(calls.deleteCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any violating set with AiProviderError, persisting nothing and leaving the session PENDING', async () => {
    // // Feature: interview, Property 6: Question generation satisfies its post-invariants
    await fc.assert(
      fc.asyncProperty(violatingArb, async ({ questionCount, questions }) => {
        mockedGenerateJson.mockResolvedValue({ questions });
        const { client, calls } = createMockSupabase();
        const session = makeSession(questionCount, 'ENTRY');

        await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
          AiProviderError
        );

        // Nothing persisted; session never transitioned to ACTIVE (stays PENDING).
        expect(calls.insertCount).toBe(0);
        expect(calls.updateToActiveCount).toBe(0);
        expect(calls.deleteCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
