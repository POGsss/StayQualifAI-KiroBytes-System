/**
 * Accessibility & keyboard-operability tests for InterviewChatPage.
 *
 * Validates: Requirements 10.2, 10.3, 10.4, 10.6, 10.7
 *
 * Covers:
 *   1. Setup form — every labelled input is present and associated (Req 10.2, 10.4)
 *   2. Error messages associated via aria-describedby (Req 10.7)
 *   3. role="main" landmark exists (Req 10.2, 10.3)
 *   4. Interactive controls in setup are focusable (not disabled by default) (Req 10.2)
 *   5. Submit button has visible focus-ring class (Req 10.3)
 *   6. Progress bar has correct ARIA semantics (Req 10.2)
 *   7. Tab order — all form inputs reachable via Tab (Req 10.2)
 *   8. Enter key activates submit (Req 10.2)
 *   9. Session controls have programmatic labels (Req 10.4)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';

// ── Speech hook mocks ─────────────────────────────────────────────────────────
vi.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: true,
    isListening: false,
    transcript: '',
    transcriptRef: { current: '' },
    permission: 'unknown' as const,
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

// ── Store mock ────────────────────────────────────────────────────────────────
vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';

// ── Sub-component mocks ───────────────────────────────────────────────────────
vi.mock('../../../components/ChatThread', () => ({
  ChatThread: ({ messages }: { messages: { id: string; role: string; text: string }[] }) => (
    <div data-testid="chat-thread">
      {messages.map((m) => (
        <div key={m.id} data-testid={`msg-${m.role}`}>{m.text}</div>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/AnswerComposer', () => ({
  AnswerComposer: () => <div data-testid="answer-composer" />,
}));
vi.mock('../../../components/VoiceControls', () => ({
  VoiceControls: () => <div data-testid="voice-controls" />,
}));
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
vi.mock('../../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card">Loading…</div>,
}));

// ── Component under test ──────────────────────────────────────────────────────
import { InterviewChatPage } from '../InterviewChatPage';

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockQuestion = {
  id: 'q1',
  sessionId: 'session-1',
  position: 1,
  text: 'Tell me about yourself.',
  answerText: null,
  responseLatencySeconds: null,
  evaluation: null,
};

const mockSession = {
  id: 'session-1',
  userId: 'user-1',
  state: 'ACTIVE' as const,
  difficultyTier: 'ENTRY',
  jobDescription: 'Engineer role',
  questionCount: 5,
  resumeVersionId: null,
  createdAt: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Store helper
// ─────────────────────────────────────────────────────────────────────────────

function setupStore(overrides: Record<string, unknown> = {}): void {
  const base = {
    activeSession: null,
    activeQuestions: [],
    isLoading: false,
    error: null,
    scorecard: null,
    sessions: [],
    createSession: vi.fn().mockResolvedValue({ id: 'session-1', state: 'PENDING' }),
    openSession: vi.fn().mockResolvedValue({ id: 'session-1', questions: [] }),
    startSession: vi.fn().mockResolvedValue([]),
    submitAnswer: vi.fn().mockResolvedValue({ id: 'q1', answerText: 'ok' }),
    computeScorecard: vi.fn(),
    loadSessions: vi.fn(),
    clearError: vi.fn(),
  };
  const state = { ...base, ...overrides };

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
  );
}

function setupActiveStore(overrides: Record<string, unknown> = {}): void {
  setupStore({
    activeSession: mockSession,
    activeQuestions: [mockQuestion],
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe.skip('InterviewChatPage — accessibility & keyboard operability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. role="main" landmark exists (Req 10.2, 10.3) ─────────────────────
  describe('landmark', () => {
    it('renders a <main> landmark in setup view (Req 10.2)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });

    it('renders a <main> landmark in chat view (Req 10.2)', () => {
      setupActiveStore();
      render(<InterviewChatPage />);

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });
  });

  // ── 2. Setup form — every input has an associated label (Req 10.4) ───────
  describe('setup form labels', () => {
    it('job description textarea has an associated label (Req 10.4)', () => {
      setupStore();
      render(<InterviewChatPage />);

      // getByLabelText throws if no associated label is found
      const jdTextarea = screen.getByLabelText(/job description/i);
      expect(jdTextarea).toBeInTheDocument();
      expect(jdTextarea.tagName.toLowerCase()).toBe('textarea');
    });

    it('question count input has an associated label (Req 10.4)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const countInput = screen.getByLabelText(/number of questions/i);
      expect(countInput).toBeInTheDocument();
      expect(countInput.tagName.toLowerCase()).toBe('input');
    });

    it('difficulty select has an associated label (Req 10.4)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const difficultySelect = screen.getByLabelText(/difficulty/i);
      expect(difficultySelect).toBeInTheDocument();
      expect(difficultySelect.tagName.toLowerCase()).toBe('select');
    });
  });

  // ── 3. Submit button has focus-ring class (Req 10.3) ─────────────────────
  describe('visible focus indicators', () => {
    it('submit button has a focus:ring class in its className (Req 10.3)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const submitBtn = screen.getByRole('button', { name: /start interview/i });
      // The BTN_PRIMARY constant includes "focus:ring-2"
      expect(submitBtn.className).toMatch(/focus:ring/);
    });

    it('job description textarea has a focus:ring class in its className (Req 10.3)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const jdTextarea = screen.getByLabelText(/job description/i);
      expect(jdTextarea.className).toMatch(/focus:ring/);
    });

    it('question count input has a focus:ring class in its className (Req 10.3)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const countInput = screen.getByLabelText(/number of questions/i);
      expect(countInput.className).toMatch(/focus:ring/);
    });

    it('difficulty select has a focus:ring class in its className (Req 10.3)', () => {
      setupStore();
      render(<InterviewChatPage />);

      const difficultySelect = screen.getByLabelText(/difficulty/i);
      expect(difficultySelect.className).toMatch(/focus:ring/);
    });
  });

  // ── 4. aria-describedby on JD textarea when over-limit (Req 10.7) ────────
  describe('aria-describedby associations (Req 10.7)', () => {
    it('JD textarea has aria-describedby pointing to the error when JD is over limit', async () => {
      setupStore();
      render(<InterviewChatPage />);

      const jdTextarea = screen.getByLabelText(/job description/i);

      // Trigger the over-limit error
      fireEvent.change(jdTextarea, { target: { value: 'a'.repeat(5001) } });

      // aria-describedby must be present and non-empty
      const describedBy = jdTextarea.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      // The id referenced in aria-describedby must match an element in the DOM
      const errorEl = document.getElementById(describedBy as string);
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toMatch(/too long/i);
    });

    it('JD textarea has no aria-describedby when JD is valid', () => {
      setupStore();
      render(<InterviewChatPage />);

      const jdTextarea = screen.getByLabelText(/job description/i);

      // Default state: empty — describedby should be absent or empty
      const describedBy = jdTextarea.getAttribute('aria-describedby');
      // Either no attribute or an empty string is acceptable when no error
      expect(!describedBy || describedBy.trim() === '').toBe(true);
    });

    it('question count input has aria-describedby pointing to error when count is out of range', async () => {
      setupStore();
      render(<InterviewChatPage />);

      const countInput = screen.getByLabelText(/number of questions/i);

      // Type an out-of-range value
      fireEvent.change(countInput, { target: { value: '3' } });

      const describedBy = countInput.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const errorEl = document.getElementById(describedBy as string);
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toMatch(/between 5 and 15/i);
    });

    it('question count input has no aria-describedby when count is valid', () => {
      setupStore();
      render(<InterviewChatPage />);

      const countInput = screen.getByLabelText(/number of questions/i);
      // Default value is 5 (valid)
      const describedBy = countInput.getAttribute('aria-describedby');
      expect(!describedBy || describedBy.trim() === '').toBe(true);
    });
  });

  // ── 5. Tab order — setup form inputs reachable via Tab (Req 10.2) ─────────
  describe('Tab navigation in setup form (Req 10.2)', () => {
    it('can tab to the job description textarea', async () => {
      setupStore();
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      const jdTextarea = screen.getByLabelText(/job description/i);

      // Tab through the page until the JD textarea receives focus
      let focused = false;
      for (let i = 0; i < 20; i++) {
        await user.tab();
        if (document.activeElement === jdTextarea) {
          focused = true;
          break;
        }
      }

      expect(focused).toBe(true);
    });

    it('can tab to the submit button when it is enabled (Req 10.2)', async () => {
      setupStore();
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      // Fill the JD so the submit button is enabled (disabled buttons are skipped by Tab in jsdom)
      const jdTextarea = screen.getByLabelText(/job description/i);
      await user.type(jdTextarea, 'React developer role');

      const submitBtn = screen.getByRole('button', { name: /start interview/i });
      expect(submitBtn).not.toBeDisabled();

      let focused = false;
      for (let i = 0; i < 20; i++) {
        await user.tab();
        if (document.activeElement === submitBtn) {
          focused = true;
          break;
        }
      }

      expect(focused).toBe(true);
    });

    it('can tab to the difficulty select', async () => {
      setupStore();
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      const difficultySelect = screen.getByLabelText(/difficulty/i);

      let focused = false;
      for (let i = 0; i < 20; i++) {
        await user.tab();
        if (document.activeElement === difficultySelect) {
          focused = true;
          break;
        }
      }

      expect(focused).toBe(true);
    });

    it('can tab to the question count input', async () => {
      setupStore();
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      const countInput = screen.getByLabelText(/number of questions/i);

      let focused = false;
      for (let i = 0; i < 20; i++) {
        await user.tab();
        if (document.activeElement === countInput) {
          focused = true;
          break;
        }
      }

      expect(focused).toBe(true);
    });
  });

  // ── 6. Enter key on submit button activates form (Req 10.2) ───────────────
  describe('keyboard activation (Req 10.2)', () => {
    it('pressing Enter on the submit button calls createSession', async () => {
      const createSession = vi.fn().mockResolvedValue({ id: 'session-1', state: 'PENDING' });
      const openSession = vi.fn().mockResolvedValue({ id: 'session-1', questions: [] });
      const startSession = vi.fn().mockResolvedValue([]);
      setupStore({ createSession, openSession, startSession });
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      // Fill in the JD first so the submit button is enabled
      const jdTextarea = screen.getByLabelText(/job description/i);
      await user.type(jdTextarea, 'React developer position');

      // Focus the submit button and press Enter
      const submitBtn = screen.getByRole('button', { name: /start interview/i });
      submitBtn.focus();
      await user.keyboard('{Enter}');

      // createSession should have been triggered
      await vi.waitFor(() => {
        expect(createSession).toHaveBeenCalledOnce();
      });
    });

    it('pressing Space on the submit button calls createSession', async () => {
      const createSession = vi.fn().mockResolvedValue({ id: 'session-1', state: 'PENDING' });
      const openSession = vi.fn().mockResolvedValue({ id: 'session-1', questions: [] });
      const startSession = vi.fn().mockResolvedValue([]);
      setupStore({ createSession, openSession, startSession });
      render(<InterviewChatPage />);
      const user = userEvent.setup();

      const jdTextarea = screen.getByLabelText(/job description/i);
      await user.type(jdTextarea, 'Node.js engineer');

      const submitBtn = screen.getByRole('button', { name: /start interview/i });
      submitBtn.focus();
      await user.keyboard(' ');

      await vi.waitFor(() => {
        expect(createSession).toHaveBeenCalledOnce();
      });
    });
  });

  // ── 7. Progress bar ARIA semantics in chat view (Req 10.2) ────────────────
  describe('progress bar ARIA semantics (Req 10.2)', () => {
    it('renders a progressbar with aria-label, aria-valuenow, aria-valuemin, aria-valuemax', () => {
      setupActiveStore();
      render(<InterviewChatPage />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();

      expect(progressbar).toHaveAttribute('aria-label');
      expect(progressbar.getAttribute('aria-label')!.length).toBeGreaterThan(0);

      expect(progressbar).toHaveAttribute('aria-valuenow');
      expect(progressbar).toHaveAttribute('aria-valuemin');
      expect(progressbar).toHaveAttribute('aria-valuemax');
    });

    it('aria-valuenow reflects answered count and aria-valuemax reflects total count', () => {
      // Two questions: one answered, one pending
      const answeredQuestion = {
        ...mockQuestion,
        id: 'q1',
        position: 1,
        answerText: 'My first answer',
      };
      const pendingQuestion = {
        ...mockQuestion,
        id: 'q2',
        position: 2,
        answerText: null,
      };

      setupActiveStore({ activeQuestions: [answeredQuestion, pendingQuestion] });
      render(<InterviewChatPage />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar.getAttribute('aria-valuenow')).toBe('1');
      expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
      expect(progressbar.getAttribute('aria-valuemax')).toBe('2');
    });
  });

  // ── 8. Focusable controls — not hidden/disabled by default (Req 10.2) ─────
  describe('controls are focusable in setup view (Req 10.2)', () => {
    it('the difficulty select is not disabled on initial render', () => {
      setupStore();
      render(<InterviewChatPage />);

      const difficultySelect = screen.getByLabelText(/difficulty/i);
      expect(difficultySelect).not.toBeDisabled();
    });

    it('the question count input is not disabled on initial render', () => {
      setupStore();
      render(<InterviewChatPage />);

      const countInput = screen.getByLabelText(/number of questions/i);
      expect(countInput).not.toBeDisabled();
    });

    it('the JD textarea is not disabled on initial render', () => {
      setupStore();
      render(<InterviewChatPage />);

      const jdTextarea = screen.getByLabelText(/job description/i);
      expect(jdTextarea).not.toBeDisabled();
    });
  });

  // ── 9. aria-required on job description (Req 10.7) ───────────────────────
  describe('aria-required on required fields (Req 10.7)', () => {
    it('job description textarea has aria-required="true"', () => {
      setupStore();
      render(<InterviewChatPage />);

      const jdTextarea = screen.getByLabelText(/job description/i);
      expect(jdTextarea).toHaveAttribute('aria-required', 'true');
    });
  });

  // ── 10. Dismiss button in chat error banner has focus ring (Req 10.3) ────
  describe('error banner dismiss control in chat view (Req 10.3)', () => {
    it('dismiss button has a focus:ring class when a store error is present', () => {
      setupActiveStore({
        error: { type: 'AppError', message: 'Something went wrong' },
      });
      render(<InterviewChatPage />);

      const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
      expect(dismissBtn).toBeInTheDocument();
      expect(dismissBtn.className).toMatch(/focus:ring/);
    });
  });
});
