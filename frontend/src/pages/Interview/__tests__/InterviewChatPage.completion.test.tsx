/**
 * Completion & scorecard tests for InterviewChatPage.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 *
 * Covers:
 *   1. Composer hidden at COMPLETED (Req 7.1)
 *   2. "View Scorecard" button present when COMPLETED and no scorecard (Req 7.2)
 *   3. Clicking "View Scorecard" calls computeScorecard with the session ID (Req 7.3)
 *   4. One-request guard — button disabled while computing; no double invocation (Req 7.4)
 *   5. ScoreDial / TierBadge render after compute succeeds (Req 7.3)
 *   6. SCORED state shows existing scorecard without clicking compute (Req 7.5)
 *   7. Failure re-enables the compute button (Req 7.6)
 */

import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock react-router-dom's useNavigate (page calls it; no Router in tests) ──
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// ── Mock ScoreDial & TierBadge ────────────────────────────────────────────

vi.mock('../../../components/ScoreDial', () => ({
  ScoreDial: ({ score, label }: { score: number; label: string }) => (
    <div data-testid="score-dial">{label}: {score}</div>
  ),
}));

vi.mock('../../../components/TierBadge', () => ({
  TierBadge: ({ tier }: { tier: string }) => (
    <div data-testid="tier-badge">{tier}</div>
  ),
}));

// ── Mock ChatThread to avoid jsdom scrollIntoView limitations ─────────────

vi.mock('../../../components/ChatThread', () => ({
  ChatThread: ({ messages }: { messages: { id: string; role: string; text: string }[] }) => (
    <div data-testid="chat-thread">
      {messages.map((m) => (
        <div key={m.id} data-testid={`msg-${m.role}`}>{m.text}</div>
      ))}
    </div>
  ),
}));

// ── Mock speech hooks (not needed for completion view) ────────────────────

vi.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: false,
    isListening: false,
    transcript: '',
    transcriptRef: { current: '' },
    permission: 'unknown',
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    clearTranscript: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSpeechSynthesis', () => ({
  useSpeechSynthesis: () => ({
    isSupported: false,
    isSpeaking: false,
    error: null,
    speak: vi.fn(),
    cancel: vi.fn(),
  }),
}));

// ── Mock the store ─────────────────────────────────────────────────────────

vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';

// ── Component under test ───────────────────────────────────────────────────

import { InterviewChatPage } from '../InterviewChatPage';

// ── Fixtures ──────────────────────────────────────────────────────────────

const answeredQuestion = {
  id: 'q1',
  sessionId: 'session-1',
  position: 1,
  text: 'Tell me about yourself.',
  answerText: 'I am a software engineer.',
  responseLatencySeconds: 5,
  evaluation: null,
};

const completedSession = {
  id: 'session-1',
  userId: 'user-1',
  state: 'COMPLETED' as const,
  difficultyTier: 'ENTRY',
  jobDescription: 'Engineer role',
  questionCount: 5,
  resumeVersionId: null,
  createdAt: new Date().toISOString(),
};

const scoredSession = {
  ...completedSession,
  state: 'SCORED' as const,
};

const mockScorecard = {
  sessionId: 'session-1',
  answerQualityScore: 80,
  grammarScore: 75,
  latencyScore: 90,
  pressureScore: 85,
  overallScore: 82,
  passFailTier: 'PASS' as const,
  createdAt: new Date().toISOString(),
};

// ── Store setup helper ─────────────────────────────────────────────────────

type StoreShape = {
  activeSession: typeof completedSession | typeof scoredSession | null;
  activeQuestions: typeof answeredQuestion[];
  isLoading: boolean;
  error: null | { type: string; message: string };
  scorecard: typeof mockScorecard | null;
  sessions: never[];
  computeScorecard: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  openSession: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  submitAnswer: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
};

/**
 * Sets up the store mock with a mutable state container so that tests can call
 * `setState(patch)` mid-test to simulate store updates (e.g. scorecard arriving
 * after computeScorecard resolves). This mirrors how the real Zustand store
 * re-renders subscribers after state changes.
 *
 * Returns a `setState` helper that merges a patch into the current live state
 * and re-wires the mock so subsequent `useInterviewStore()` calls return the
 * updated state.
 */
function setupStore(overrides: Partial<StoreShape> = {}): {
  setState: (patch: Partial<StoreShape>) => void;
} {
  const base: StoreShape = {
    activeSession: completedSession,
    activeQuestions: [answeredQuestion],
    isLoading: false,
    error: null,
    scorecard: null,
    sessions: [],
    computeScorecard: vi.fn().mockResolvedValue(mockScorecard),
    createSession: vi.fn(),
    openSession: vi.fn(),
    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    clearError: vi.fn(),
  };

  // Live mutable reference — updated by setState()
  let liveState: StoreShape = { ...base, ...overrides };

  function wireMock(): void {
    (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: StoreShape) => unknown) => {
        if (typeof selector === 'function') {
          return selector(liveState);
        }
        return liveState;
      },
    );
  }

  wireMock();

  return {
    setState(patch: Partial<StoreShape>): void {
      liveState = { ...liveState, ...patch };
      wireMock();
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('InterviewChatPage — completion & scorecard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Composer hidden at COMPLETED (Req 7.1) ─────────────────────────────
  describe('Req 7.1 — Composer hidden at COMPLETED', () => {
    it('does not render the answer textarea when session is COMPLETED', () => {
      setupStore();
      render(<InterviewChatPage />);

      expect(screen.queryByRole('textbox', { name: /your answer/i })).not.toBeInTheDocument();
    });

    it('does not render the send button when session is COMPLETED', () => {
      setupStore();
      render(<InterviewChatPage />);

      expect(screen.queryByRole('button', { name: /send answer/i })).not.toBeInTheDocument();
    });

    it('does not render the answer textarea when session is SCORED', () => {
      setupStore({ activeSession: scoredSession, scorecard: mockScorecard });
      render(<InterviewChatPage />);

      expect(screen.queryByRole('textbox', { name: /your answer/i })).not.toBeInTheDocument();
    });
  });

  // ── 2. "View Scorecard" button present (Req 7.2) ─────────────────────────
  describe('Req 7.2 — View Scorecard button present', () => {
    it('shows the "View Scorecard" button when session is COMPLETED and no scorecard', () => {
      setupStore({ scorecard: null });
      render(<InterviewChatPage />);

      expect(
        screen.getByRole('button', { name: /view scorecard/i }),
      ).toBeInTheDocument();
    });

    it('"View Scorecard" button is enabled initially', () => {
      setupStore({ scorecard: null });
      render(<InterviewChatPage />);

      expect(
        screen.getByRole('button', { name: /view scorecard/i }),
      ).not.toBeDisabled();
    });
  });

  // ── 3. Compute wiring (Req 7.3) ───────────────────────────────────────────
  describe('Req 7.3 — computeScorecard wired to button click', () => {
    it('calls computeScorecard with the session ID when "View Scorecard" is clicked', async () => {
      const computeScorecard = vi.fn().mockResolvedValue(mockScorecard);
      setupStore({ computeScorecard });
      render(<InterviewChatPage />);

      const btn = screen.getByRole('button', { name: /view scorecard/i });
      await userEvent.click(btn);

      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(1);
        expect(computeScorecard).toHaveBeenCalledWith('session-1');
      });
    });

    it('renders ScoreDial and TierBadge after computeScorecard resolves', async () => {
      // Wire computeScorecard to also update the mock state so re-renders see scorecard
      const { setState } = setupStore({ scorecard: null });
      const computeScorecard = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        setState({ scorecard: mockScorecard });
        return mockScorecard;
      });
      setState({ computeScorecard });
      render(<InterviewChatPage />);

      await userEvent.click(screen.getByRole('button', { name: /view scorecard/i }));

      await waitFor(() => {
        expect(screen.getAllByTestId('score-dial').length).toBeGreaterThan(0);
        expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
      });
    });

    it('renders the correct tier in TierBadge after compute', async () => {
      const { setState } = setupStore({ scorecard: null });
      const computeScorecard = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        setState({ scorecard: mockScorecard });
        return mockScorecard;
      });
      setState({ computeScorecard });
      render(<InterviewChatPage />);

      await userEvent.click(screen.getByRole('button', { name: /view scorecard/i }));

      await waitFor(() => {
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('PASS');
      });
    });

    it('renders score dials with correct labels after compute', async () => {
      const { setState } = setupStore({ scorecard: null });
      const computeScorecard = vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        setState({ scorecard: mockScorecard });
        return mockScorecard;
      });
      setState({ computeScorecard });
      render(<InterviewChatPage />);

      await userEvent.click(screen.getByRole('button', { name: /view scorecard/i }));

      await waitFor(() => {
        const dials = screen.getAllByTestId('score-dial');
        const dialTexts = dials.map((d) => d.textContent ?? '');
        expect(dialTexts.some((t) => t.includes('Answer Quality'))).toBe(true);
        expect(dialTexts.some((t) => t.includes('Grammar'))).toBe(true);
        expect(dialTexts.some((t) => t.includes('Overall'))).toBe(true);
      });
    });
  });

  // ── 4. One-request guard (Req 7.4) ────────────────────────────────────────
  describe('Req 7.4 — one-request guard', () => {
    it('hides the "View Scorecard" button and shows skeleton while computeScorecard is in flight', async () => {
      // Deferred — we hold the promise open to inspect mid-flight state
      let resolveFn!: (value: typeof mockScorecard) => void;
      const deferred = new Promise<typeof mockScorecard>((resolve) => {
        resolveFn = resolve;
      });
      const computeScorecard = vi.fn().mockReturnValue(deferred);
      setupStore({ computeScorecard });
      render(<InterviewChatPage />);

      const btn = screen.getByRole('button', { name: /view scorecard/i });

      // Click to start computation
      fireEvent.click(btn);

      // When computing, ScorecardSection renders a SkeletonCard — button disappears
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /view scorecard/i })).not.toBeInTheDocument();
      });

      // Resolve to clean up
      act(() => {
        resolveFn(mockScorecard);
      });
      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(1);
      });
    });

    it('does not call computeScorecard a second time if clicked while computing', async () => {
      let resolveFn!: (value: typeof mockScorecard) => void;
      const deferred = new Promise<typeof mockScorecard>((resolve) => {
        resolveFn = resolve;
      });
      const computeScorecard = vi.fn().mockReturnValue(deferred);
      setupStore({ computeScorecard });
      render(<InterviewChatPage />);

      const btn = screen.getByRole('button', { name: /view scorecard/i });

      // First click starts computation
      fireEvent.click(btn);
      // Guard is set (computeRequestedRef.current = true) synchronously within the handler
      // before any await — a second click must not bypass it
      fireEvent.click(btn);

      // Only one invocation despite two rapid clicks
      expect(computeScorecard).toHaveBeenCalledTimes(1);

      act(() => {
        resolveFn(mockScorecard);
      });
      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── 5. SCORED shows existing scorecard without recompute (Req 7.5) ────────
  describe('Req 7.5 — SCORED state shows existing scorecard without compute', () => {
    it('renders ScoreDial and TierBadge immediately when session is SCORED with a scorecard', () => {
      setupStore({ activeSession: scoredSession, scorecard: mockScorecard });
      render(<InterviewChatPage />);

      expect(screen.getAllByTestId('score-dial').length).toBeGreaterThan(0);
      expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    it('does NOT show the "View Scorecard" button when scorecard already exists', () => {
      setupStore({ activeSession: scoredSession, scorecard: mockScorecard });
      render(<InterviewChatPage />);

      expect(
        screen.queryByRole('button', { name: /view scorecard/i }),
      ).not.toBeInTheDocument();
    });

    it('does not call computeScorecard when scorecard is already present on mount', () => {
      const computeScorecard = vi.fn().mockResolvedValue(mockScorecard);
      setupStore({ activeSession: scoredSession, scorecard: mockScorecard, computeScorecard });
      render(<InterviewChatPage />);

      expect(computeScorecard).not.toHaveBeenCalled();
    });

    it('shows correct score values when scorecard is pre-loaded', () => {
      setupStore({ activeSession: scoredSession, scorecard: mockScorecard });
      render(<InterviewChatPage />);

      // ScoreDial mock renders "label: score" — check overall score is present
      expect(
        screen.getByText(`Overall: ${mockScorecard.overallScore}`),
      ).toBeInTheDocument();
    });
  });

  // ── 6. Failure re-enables the compute button (Req 7.6) ────────────────────
  describe('Req 7.6 — failure re-enables the compute control', () => {
    it('re-enables the "View Scorecard" button when computeScorecard returns null', async () => {
      const computeScorecard = vi.fn().mockResolvedValue(null);
      setupStore({ computeScorecard });
      render(<InterviewChatPage />);

      const btn = screen.getByRole('button', { name: /view scorecard/i });
      expect(btn).not.toBeDisabled();

      await userEvent.click(btn);

      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(1);
      });

      // After null result, button must be enabled again
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /view scorecard/i }),
        ).not.toBeDisabled();
      });
    });

    it('shows an error message when computeScorecard returns null', async () => {
      const computeScorecard = vi.fn().mockResolvedValue(null);
      setupStore({ computeScorecard });
      render(<InterviewChatPage />);

      await userEvent.click(screen.getByRole('button', { name: /view scorecard/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('allows retrying after a failure (computeScorecard called again)', async () => {
      // Create a mutable result holder so we can change what the mock returns
      // without needing setState (the fn reference stays stable across renders).
      let callCount = 0;
      const computeScorecard = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return null; // first call fails
        // second call succeeds — but scorecard lives in store state
        // For this test we just verify computeScorecard is called twice
        return mockScorecard;
      });
      setupStore({ scorecard: null, computeScorecard });
      render(<InterviewChatPage />);

      const btn = screen.getByRole('button', { name: /view scorecard/i });

      // First click — fails
      await userEvent.click(btn);
      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(1);
      });

      // Button re-enabled after failure
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view scorecard/i })).not.toBeDisabled();
      });

      // Second click — succeeds (computeScorecard called again)
      await userEvent.click(screen.getByRole('button', { name: /view scorecard/i }));
      await waitFor(() => {
        expect(computeScorecard).toHaveBeenCalledTimes(2);
      });
    });
  });
});
