/**
 * Integration tests for Row Level Security isolation and persistence of the
 * `interview_` tables (interview spec task 2.5).
 *
 * These tests exercise the LIVE Supabase project (ref: mlnhocdsbwlaeqemluvp)
 * using per-user JWT-scoped clients built from the anon key so that RLS is
 * actually enforced — the service-role key is used ONLY to provision and tear
 * down two disposable test users (admin auth), never to bypass RLS for the
 * isolation assertions themselves (design.md "Authentication and Tenancy",
 * Requirements 12.1, 12.2, 12.4).
 *
 * Representative cases (1–3 per the task):
 *   (a) Per-user listing returns only the caller's rows, and cross-user
 *       read / write / delete yield zero rows (mapped to not-found upstream).
 *       — Requirements 6.3, 8.3, 9.5, 10.3, 12.1, 12.2, 12.4
 *   (b) The `unique (user_id, title)` index rejects a duplicate STAR title for
 *       the same user. — Requirement 7.5
 *   (c) Question and scorecard rows persist and round-trip verbatim.
 *       — Requirements 12.1, 12.2 (persistence/round-trip)
 *
 * REQUIRED ENVIRONMENT (read from backend/.env or the process environment):
 *   - SUPABASE_URL
 *   - SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY  (admin: create/delete the test users only)
 * When any of these are absent the entire suite is skipped gracefully via
 * `describe.skipIf` so CI without credentials does not hang or fail.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Minimal .env loader: populates `process.env` from backend/.env for any key
 * not already set, so the suite is runnable via `npm run test` without an
 * external dotenv dependency. Silent if the file is absent.
 */
function loadDotEnv(): void {
  try {
    const raw: string = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed: string = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }
      const eq: number = trimmed.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key: string = trimmed.slice(0, eq).trim();
      const value: string = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — rely on the ambient environment.
  }
}

loadDotEnv();

const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY: string | undefined = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HAS_CREDENTIALS: boolean =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.length > 0 &&
  typeof SUPABASE_ANON_KEY === 'string' &&
  SUPABASE_ANON_KEY.length > 0 &&
  typeof SUPABASE_SERVICE_ROLE_KEY === 'string' &&
  SUPABASE_SERVICE_ROLE_KEY.length > 0;

if (!HAS_CREDENTIALS) {
  // Visible reason in the test output when skipped.
  // eslint-disable-next-line no-console
  console.warn(
    '[interview.rls] Skipping RLS integration tests: set SUPABASE_URL, ' +
      'SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to run them.'
  );
}

interface ITestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

/** Builds a JWT-scoped anon client whose every query is RLS-scoped to `token`. */
function rlsClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(!HAS_CREDENTIALS)('interview_ RLS isolation and persistence', () => {
  let admin: SupabaseClient;
  let userA: ITestUser;
  let userB: ITestUser;
  const createdUserIds: string[] = [];
  const password = `Pw_${Math.random().toString(36).slice(2)}_${Date.now()}!`;

  async function provisionUser(label: string): Promise<ITestUser> {
    const email = `interview-rls-${label}-${Date.now()}-${Math.floor(
      Math.random() * 1e6
    )}@example.com`;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error !== null || created.data.user === null) {
      throw new Error(`Failed to create test user ${label}: ${created.error?.message}`);
    }
    createdUserIds.push(created.data.user.id);

    const anon = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error !== null || signIn.data.session === null) {
      throw new Error(`Failed to sign in test user ${label}: ${signIn.error?.message}`);
    }

    return {
      id: created.data.user.id,
      email,
      client: rlsClient(signIn.data.session.access_token),
    };
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userA = await provisionUser('a');
    userB = await provisionUser('b');
  }, 60_000);

  afterAll(async () => {
    // Remove the disposable users; ON DELETE CASCADE on user_id FKs removes any
    // remaining interview_ rows owned by them, leaving the project clean.
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }, 60_000);

  it('(a) per-user listing returns only the caller rows; cross-user read/write/delete yield zero rows', async () => {
    const title = `RLS isolation ${Date.now()}`;
    const insert = await userA.client
      .from('interview_star_stories')
      .insert({
        user_id: userA.id,
        title,
        situation: 'situation A',
        task: 'task A',
        action: 'action A',
        result: 'result A',
      })
      .select()
      .single();
    expect(insert.error).toBeNull();
    const storyId: string = insert.data!.id as string;

    // Owner sees exactly their own row.
    const listA = await userA.client.from('interview_star_stories').select('id');
    expect(listA.error).toBeNull();
    expect(listA.data!.map((r) => r.id)).toContain(storyId);

    // Other user's listing never includes A's row.
    const listB = await userB.client.from('interview_star_stories').select('id');
    expect(listB.error).toBeNull();
    expect(listB.data!.map((r) => r.id)).not.toContain(storyId);

    // Cross-user READ by id → zero rows.
    const readB = await userB.client
      .from('interview_star_stories')
      .select('id')
      .eq('id', storyId);
    expect(readB.error).toBeNull();
    expect(readB.data).toHaveLength(0);

    // Cross-user WRITE → zero rows affected (RLS hides the row).
    const updateB = await userB.client
      .from('interview_star_stories')
      .update({ title: 'hijacked' })
      .eq('id', storyId)
      .select();
    expect(updateB.error).toBeNull();
    expect(updateB.data).toHaveLength(0);

    // Cross-user DELETE → zero rows affected.
    const deleteB = await userB.client
      .from('interview_star_stories')
      .delete()
      .eq('id', storyId)
      .select();
    expect(deleteB.error).toBeNull();
    expect(deleteB.data).toHaveLength(0);

    // The row is untouched and still owned by A with its original title.
    const verify = await userA.client
      .from('interview_star_stories')
      .select('id,title')
      .eq('id', storyId)
      .single();
    expect(verify.error).toBeNull();
    expect(verify.data!.title).toBe(title);

    // Cleanup.
    await userA.client.from('interview_star_stories').delete().eq('id', storyId);
  });

  it('(b) the unique (user_id, title) index rejects a duplicate STAR title for the same user', async () => {
    const title = `Duplicate title ${Date.now()}`;
    const base = {
      user_id: userA.id,
      title,
      situation: 's',
      task: 't',
      action: 'a',
      result: 'r',
    };

    const first = await userA.client.from('interview_star_stories').insert(base).select().single();
    expect(first.error).toBeNull();
    const firstId: string = first.data!.id as string;

    // Same user, same exact title → unique violation (PostgreSQL code 23505).
    const dup = await userA.client.from('interview_star_stories').insert(base).select();
    expect(dup.error).not.toBeNull();
    expect(dup.error!.code).toBe('23505');

    // A different user may reuse the same title (uniqueness is per-user).
    const otherUser = await userB.client
      .from('interview_star_stories')
      .insert({ ...base, user_id: userB.id })
      .select()
      .single();
    expect(otherUser.error).toBeNull();

    // Cleanup.
    await userA.client.from('interview_star_stories').delete().eq('id', firstId);
    await userB.client.from('interview_star_stories').delete().eq('id', otherUser.data!.id);
  });

  it('(c) question and scorecard rows persist and round-trip verbatim', async () => {
    // A session is the parent record for both questions and the scorecard.
    const session = await userA.client
      .from('interview_sessions')
      .insert({
        user_id: userA.id,
        state: 'COMPLETED',
        difficulty_tier: 'MID',
        job_description: 'Senior-ish backend role focused on Postgres and TypeScript.',
        question_count: 5,
      })
      .select()
      .single();
    expect(session.error).toBeNull();
    const sessionId: string = session.data!.id as string;

    // Verbatim question content: leading/trailing/inner whitespace + unicode
    // must round-trip unchanged (the column is plain text, stored verbatim).
    const questionText = '  Describe a tricky\tmigration —  你好 \u2603  ';
    const answerText = 'Line 1\nLine 2 with emoji 🚀 and trailing spaces   ';
    const question = await userA.client
      .from('interview_questions')
      .insert({
        user_id: userA.id,
        session_id: sessionId,
        position: 1,
        text: questionText,
        answer_text: answerText,
        response_latency_seconds: 42,
        quality_score: 81,
        grammar_score: 73,
        feedback_comment: 'Clear and structured.',
      })
      .select()
      .single();
    expect(question.error).toBeNull();
    const questionId: string = question.data!.id as string;

    const readQuestion = await userA.client
      .from('interview_questions')
      .select('text,answer_text,response_latency_seconds,quality_score,grammar_score,feedback_comment')
      .eq('id', questionId)
      .single();
    expect(readQuestion.error).toBeNull();
    expect(readQuestion.data!.text).toBe(questionText);
    expect(readQuestion.data!.answer_text).toBe(answerText);
    expect(Number(readQuestion.data!.response_latency_seconds)).toBe(42);
    expect(readQuestion.data!.quality_score).toBe(81);
    expect(readQuestion.data!.grammar_score).toBe(73);
    expect(readQuestion.data!.feedback_comment).toBe('Clear and structured.');

    // Scorecard persists and round-trips its dimension scores + tier.
    const scorecard = await userA.client
      .from('interview_scorecards')
      .insert({
        user_id: userA.id,
        session_id: sessionId,
        answer_quality_score: 81,
        grammar_score: 73,
        latency_score: 100,
        pressure_score: 64,
        overall_score: 80,
        pass_fail_tier: 'PASS',
      })
      .select()
      .single();
    expect(scorecard.error).toBeNull();

    const readScorecard = await userA.client
      .from('interview_scorecards')
      .select(
        'answer_quality_score,grammar_score,latency_score,pressure_score,overall_score,pass_fail_tier'
      )
      .eq('session_id', sessionId)
      .single();
    expect(readScorecard.error).toBeNull();
    expect(readScorecard.data).toEqual({
      answer_quality_score: 81,
      grammar_score: 73,
      latency_score: 100,
      pressure_score: 64,
      overall_score: 80,
      pass_fail_tier: 'PASS',
    });

    // Cleanup: deleting the session cascades to questions and the scorecard.
    await userA.client.from('interview_sessions').delete().eq('id', sessionId);
  });
});
