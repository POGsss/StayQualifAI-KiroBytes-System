/**
 * Unit tests for the Interview Zustand store state transitions.
 *
 * These tests verify the async convention every store action follows
 * (Requirements 6.1, 6.2):
 *   - `isLoading` is set `true` and `error` is reset to `null` BEFORE the
 *     service call is made (observed mid-flight via a deferred promise).
 *   - On success, `isLoading` ends `false`, `error` is `null`, and the relevant
 *     state slice is updated.
 *   - On failure, the thrown service exception is caught (never escapes),
 *     `isLoading` ends `false`, `error` is populated with the normalized
 *     `toStoreError` shape, and the PRIOR data slice is preserved unchanged.
 *
 * The data-access service (`services/interview.service.ts`) is mocked so the
 * store's actions resolve/reject deterministically without any HTTP. The real
 * `InterviewApiError` class is preserved (only the request functions are
 * replaced) so the store's `instanceof InterviewApiError` narrowing in
 * `toStoreError` exercises real production behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InterviewApiError,
  createStory as createStoryRequest,
  deleteStory as deleteStoryRequest,
  listSessions as listSessionsRequest,
  listStories as listStoriesRequest,
  updateStory as updateStoryRequest,
} from '../../services/interview.service';
import { useInterviewStore } from '../interview.store';
import type {
  ICreateStarInput,
  IInterviewSessionSummary,
  IStarStory,
} from '../../types/interview.types';

// Mock only the request functions; keep the real `InterviewApiError` class so
// the store's `instanceof` narrowing behaves exactly as in production.
vi.mock('../../services/interview.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/interview.service')>();
  return {
    ...actual,
    listSessions: vi.fn(),
    listStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStory(overrides: Partial<IStarStory> = {}): IStarStory {
  return {
    id: 'story-1',
    title: 'Led a migration',
    situation: 'Legacy system',
    task: 'Migrate it',
    action: 'Planned and executed',
    result: 'Zero downtime',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<IInterviewSessionSummary> = {},
): IInterviewSessionSummary {
  return {
    id: 'sess-1',
    state: 'SCORED',
    difficultyTier: 'MID',
    createdAt: '2024-01-01T00:00:00.000Z',
    overallScore: 82,
    passFailTier: 'PASS',
    ...overrides,
  };
}

const createInput: ICreateStarInput = {
  title: 'New story',
  situation: 'S',
  task: 'T',
  action: 'A',
  result: 'R',
};

/** Build a controllable promise for observing the in-flight `isLoading` state. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useInterviewStore state transitions', () => {
  beforeEach(() => {
    // Isolate each test: restore the store to its initial state.
    useInterviewStore.getState().reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('success path', () => {
    it('sets isLoading true and error null before the call, then updates the slice on success (loadStories)', async () => {
      const stories = [makeStory()];
      const control = deferred<IStarStory[]>();
      vi.mocked(listStoriesRequest).mockReturnValue(control.promise);

      // Seed a stale error to prove it is reset to null before the call.
      useInterviewStore.setState({
        error: { type: 'stale', message: 'old error' },
      });

      // Invoke without awaiting so we can observe the mid-flight state.
      const pending = useInterviewStore.getState().loadStories();

      expect(useInterviewStore.getState().isLoading).toBe(true);
      expect(useInterviewStore.getState().error).toBeNull();

      // Resolve the service call and let the action settle.
      control.resolve(stories);
      await pending;

      const state = useInterviewStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.stories).toEqual(stories);
    });

    it('updates the sessions slice and clears loading on success (loadSessions)', async () => {
      const summaries = [makeSummary()];
      vi.mocked(listSessionsRequest).mockResolvedValue(summaries);

      await useInterviewStore.getState().loadSessions();

      const state = useInterviewStore.getState();
      expect(state.sessions).toEqual(summaries);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('failure path', () => {
    it('populates error, ends loading false, and preserves the prior data slice on failure', async () => {
      // Seed prior data via a successful load.
      const priorStories = [makeStory({ id: 'prior-1', title: 'Prior story' })];
      vi.mocked(listStoriesRequest).mockResolvedValueOnce(priorStories);
      await useInterviewStore.getState().loadStories();
      expect(useInterviewStore.getState().stories).toEqual(priorStories);

      // Now make the next load reject with a real InterviewApiError.
      const apiError = new InterviewApiError(
        { code: 'server_error', message: 'boom' },
        500,
      );
      vi.mocked(listStoriesRequest).mockRejectedValueOnce(apiError);

      // The action must not throw — the exception is caught internally.
      await expect(
        useInterviewStore.getState().loadStories(),
      ).resolves.toBeUndefined();

      const state = useInterviewStore.getState();
      expect(state.isLoading).toBe(false);
      // Normalized toStoreError shape carries code/message/status.
      expect(state.error).toEqual({
        type: 'server_error',
        message: 'boom',
        status: 500,
      });
      // PRIOR data slice preserved unchanged.
      expect(state.stories).toEqual(priorStories);
    });

    it('normalizes a plain Error into an unknown_error store error', async () => {
      vi.mocked(listSessionsRequest).mockRejectedValueOnce(
        new Error('something broke'),
      );

      await useInterviewStore.getState().loadSessions();

      const state = useInterviewStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toEqual({
        type: 'unknown_error',
        message: 'something broke',
      });
      // Prior (empty) sessions slice preserved.
      expect(state.sessions).toEqual([]);
    });
  });

  describe('story mutations', () => {
    it('createStory appends to stories on success', async () => {
      const existing = makeStory({ id: 'existing-1' });
      useInterviewStore.setState({ stories: [existing] });

      const created = makeStory({ id: 'created-1', title: 'New story' });
      vi.mocked(createStoryRequest).mockResolvedValueOnce(created);

      const result = await useInterviewStore.getState().createStory(createInput);

      const state = useInterviewStore.getState();
      expect(result).toEqual(created);
      expect(state.stories).toEqual([existing, created]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('deleteStory removes the matching story on success', async () => {
      const keep = makeStory({ id: 'keep-1' });
      const remove = makeStory({ id: 'remove-1' });
      useInterviewStore.setState({ stories: [keep, remove] });

      vi.mocked(deleteStoryRequest).mockResolvedValueOnce(undefined);

      const result = await useInterviewStore.getState().deleteStory('remove-1');

      const state = useInterviewStore.getState();
      expect(result).toBe(true);
      expect(state.stories).toEqual([keep]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('updateStory replaces the matching story on success', async () => {
      const original = makeStory({ id: 'story-1', title: 'Original' });
      const other = makeStory({ id: 'story-2', title: 'Other' });
      useInterviewStore.setState({ stories: [original, other] });

      const updated = makeStory({ id: 'story-1', title: 'Updated title' });
      vi.mocked(updateStoryRequest).mockResolvedValueOnce(updated);

      const result = await useInterviewStore
        .getState()
        .updateStory('story-1', { title: 'Updated title' });

      const state = useInterviewStore.getState();
      expect(result).toEqual(updated);
      expect(state.stories).toEqual([updated, other]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('preserves prior stories when createStory fails', async () => {
      const existing = [makeStory({ id: 'existing-1' })];
      useInterviewStore.setState({ stories: existing });

      vi.mocked(createStoryRequest).mockRejectedValueOnce(
        new InterviewApiError(
          { code: 'conflict', message: 'duplicate title' },
          409,
        ),
      );

      const result = await useInterviewStore.getState().createStory(createInput);

      const state = useInterviewStore.getState();
      expect(result).toBeNull();
      expect(state.stories).toEqual(existing);
      expect(state.error).toEqual({
        type: 'conflict',
        message: 'duplicate title',
        status: 409,
      });
      expect(state.isLoading).toBe(false);
    });
  });

  describe('clearError and reset', () => {
    it('clearError clears the error without touching other slices', () => {
      const stories = [makeStory()];
      useInterviewStore.setState({
        stories,
        error: { type: 'server_error', message: 'boom', status: 500 },
      });

      useInterviewStore.getState().clearError();

      const state = useInterviewStore.getState();
      expect(state.error).toBeNull();
      // Other slices untouched.
      expect(state.stories).toEqual(stories);
    });

    it('reset restores the initial state', () => {
      useInterviewStore.setState({
        stories: [makeStory()],
        sessions: [makeSummary()],
        isLoading: true,
        error: { type: 'server_error', message: 'boom', status: 500 },
      });

      useInterviewStore.getState().reset();

      const state = useInterviewStore.getState();
      expect(state.activeSession).toBeNull();
      expect(state.activeQuestions).toEqual([]);
      expect(state.sessions).toEqual([]);
      expect(state.scorecard).toBeNull();
      expect(state.stories).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });
});
