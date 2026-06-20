/**
 * Example-based unit tests for the Question_Generator generation-failure
 * handling (interview spec task 6.3).
 *
 * Validates: Requirements 2.1, 2.4, 2.6
 *
 * These tests complement the property test
 * (`interview.questionGenerator.property.test.ts`, Property 6) with concrete,
 * example-driven cases that pin down the generator's failure behavior:
 *   1. AI failure / timeout — `generateJson` rejects with `AiProviderError`
 *      (provider unavailable / timed out): `generateQuestions` rejects with
 *      `AiProviderError`, nothing is inserted, the session is never activated
 *      and therefore stays `PENDING` (Requirement 2.4).
 *   2. Wrong count — the provider returns a count != `Question_Count`: mapped to
 *      `AiProviderError`, nothing persisted (Requirements 2.1).
 *   3. Empty / whitespace text — one question text is blank: mapped to
 *      `AiProviderError`, nothing persisted (Requirement 2.6).
 *   4. Duplicate text — two identical texts: mapped to `AiProviderError`,
 *      nothing persisted (Requirement 2.6).
 *   5. Happy-path control — a valid set resolves, inserts exactly once, and
 *      activates the session (Requirement 2.2).
 *
 * The module-local AI wrapper (`generateJson`) is mocked so the test exercises
 * the generator's own invariant-enforcement and persistence logic rather than
 * Gemini. The Supabase client is a chainable stub that records insert / update /
 * delete calls so each test can assert exactly what was (or was not) persisted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { IInterviewSession } from '../src/types/interview.types.js';
import { AiProviderError } from '../src/utils/errors.js';

// Mock the module-local AI wrapper so `generateJson` returns a controlled
// payload (or rejects), letting us drive both well-formed and deliberately
// failing responses straight into the generator.
vi.mock('../src/services/interview.aiProvider.service.js', () => ({
  generateJson: vi.fn(),
}));

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { generateQuestions } from '../src/services/interview.questionGenerator.service.js';

const mockedGenerateJson = vi.mocked(generateJson);

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

/** Chainable thenable returned by the mocked `update(...)` call. */
interface UpdateChain {
  eq(): UpdateChain;
  then<TResult>(
    onfulfilled: (value: { error: null }) => TResult
  ): Promise<TResult>;
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

/** Construct a PENDING session with the given question count. */
function makeSession(questionCount: number): IInterviewSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    state: 'PENDING',
    difficultyTier: 'MID',
    jobDescription: 'Build and operate a scalable web service.',
    questionCount,
    resumeVersionId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/** Build a well-formed `{ questions }` payload of `count` unique, non-empty texts. */
function validQuestions(count: number): { questions: Array<{ text: string }> } {
  return {
    questions: Array.from({ length: count }, (_, i) => ({
      text: `Q${i + 1}: describe a concrete example from your experience.`,
    })),
  };
}

describe('Question_Generator generation-failure handling (task 6.3)', () => {
  beforeEach(() => {
    mockedGenerateJson.mockReset();
  });

  it('propagates AiProviderError when the provider is unavailable / errors, persisting nothing and leaving the session PENDING (Req 2.4)', async () => {
    mockedGenerateJson.mockRejectedValue(
      new AiProviderError('The AI provider request failed.')
    );
    const { client, calls } = createMockSupabase();
    const session = makeSession(8);

    await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
      AiProviderError
    );

    // No questions inserted; session never transitioned to ACTIVE → stays PENDING.
    expect(calls.insertCount).toBe(0);
    expect(calls.updateToActiveCount).toBe(0);
    expect(calls.deleteCount).toBe(0);
  });

  it('propagates AiProviderError when the provider times out, persisting nothing and leaving the session PENDING (Req 2.4)', async () => {
    mockedGenerateJson.mockRejectedValue(
      new AiProviderError('The AI provider request timed out after 30000ms.')
    );
    const { client, calls } = createMockSupabase();
    const session = makeSession(10);

    await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
      AiProviderError
    );

    expect(calls.insertCount).toBe(0);
    expect(calls.updateToActiveCount).toBe(0);
    expect(calls.deleteCount).toBe(0);
  });

  it('maps a wrong question count to AiProviderError, persisting nothing (Req 2.1)', async () => {
    // Requested 7, provider returns 5 unique non-empty texts → wrong count.
    mockedGenerateJson.mockResolvedValue(validQuestions(5));
    const { client, calls } = createMockSupabase();
    const session = makeSession(7);

    await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
      AiProviderError
    );

    expect(calls.insertCount).toBe(0);
    expect(calls.updateToActiveCount).toBe(0);
    expect(calls.deleteCount).toBe(0);
  });

  it('maps an empty / whitespace-only question text to AiProviderError, persisting nothing (Req 2.6)', async () => {
    const session = makeSession(5);
    const payload = validQuestions(5);
    // Replace one text with whitespace-only content (blank after trim).
    payload.questions[2] = { text: '   \t\n ' };
    mockedGenerateJson.mockResolvedValue(payload);
    const { client, calls } = createMockSupabase();

    await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
      AiProviderError
    );

    expect(calls.insertCount).toBe(0);
    expect(calls.updateToActiveCount).toBe(0);
    expect(calls.deleteCount).toBe(0);
  });

  it('maps duplicate question texts to AiProviderError, persisting nothing (Req 2.6)', async () => {
    const session = makeSession(6);
    const payload = validQuestions(6);
    // Force two identical texts within the session.
    payload.questions[4] = { text: payload.questions[0]!.text };
    mockedGenerateJson.mockResolvedValue(payload);
    const { client, calls } = createMockSupabase();

    await expect(generateQuestions(client, session)).rejects.toBeInstanceOf(
      AiProviderError
    );

    expect(calls.insertCount).toBe(0);
    expect(calls.updateToActiveCount).toBe(0);
    expect(calls.deleteCount).toBe(0);
  });

  it('happy path: a valid set resolves, inserts exactly once, and activates the session (Req 2.2)', async () => {
    const questionCount = 5;
    mockedGenerateJson.mockResolvedValue(validQuestions(questionCount));
    const { client, calls } = createMockSupabase();
    const session = makeSession(questionCount);

    const result = await generateQuestions(client, session);

    expect(result).toHaveLength(questionCount);
    expect(result.map((q) => q.position)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(result.map((q) => q.text)).size).toBe(questionCount);
    expect(calls.insertCount).toBe(1);
    expect(calls.insertRows).toHaveLength(questionCount);
    expect(calls.updateToActiveCount).toBe(1);
    expect(calls.deleteCount).toBe(0);
  });
});
