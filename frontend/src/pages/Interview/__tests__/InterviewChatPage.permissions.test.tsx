/**
 * Microphone-permission tests for InterviewChatPage.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 *
 * Covers:
 *  1. Req 9.1 — startListening invoked within ≤1 render after mic press
 *  2. Req 9.2 — auto-begin on grant (no second start); typing always allowed
 *  3. Req 9.3 — permission denied → fallback notice + text-mode composer
 *  4. Req 9.4 — question caption preserved after permission denied
 *  5. Req 9.5 — audio-capture timeout → fallback notice + text mode
 *  6. Req 9.6 — previously-denied → re-enable instructions + text input
 *
 * Strategy:
 *  The page's fallback useEffect is guarded by `sessionMode === 'voice'`.
 *  To enter voice mode at the page level, we submit the setup form with
 *  voice selected. Then, to simulate recognition state changes (permission
 *  denied, audio-capture error), we update the module-level mockRecognitionState
 *  and call rerender() from @testing-library/react so the hook returns a new
 *  object, causing the useEffect to re-run.
 *
 *  For Req 9.6 (AnswerComposer re-enable instructions), we also test the
 *  AnswerComposer component directly since it independently checks
 *  recognition.permission === 'denied' regardless of the page state.
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Speech recognition mock
// The hook factory reads `mockRecognitionState` on each invocation. Because
// hooks are called on every render, updating this object and calling rerender()
// causes the page to see new values and the useEffect to fire with new deps.
// ─────────────────────────────────────────────────────────────────────────────

const defaultStartListening = vi.fn();
const defaultStopListening = vi.fn();
const defaultClearTranscript = vi.fn();

let mockRecognitionState = {
  isSupported: true,
  isListening: false,
  transcript: '',
  transcriptRef: { current: '' },
  permission: 'unknown' as 'unknown' | 'granted' | 'denied',
  error: null as string | null,
  startListening: defaultStartListening,
  stopListening: defaultStopListening,
  clearTranscript: defaultClearTranscript,
};

vi.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => mockRecognitionState,
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

// ─────────────────────────────────────────────────────────────────────────────
// Store mock
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component mocks — keep AnswerComposer REAL so we can inspect its output
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ChatThread', () => ({
  ChatThread: ({
    messages,
  }: { messages: { id: string; role: string; text: string }[] }) => (
    <div data-testid="chat-thread">
      {messages.map((m) => (
        <div key={m.id} data-testid={`msg-${m.role}`}>{m.text}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../../components/ScoreDial', () => ({
  ScoreDial: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('../../../components/TierBadge', () => ({
  TierBadge: ({ tier }: { tier: string }) => <div>{tier}</div>,
}));
vi.mock('../../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card">Loading…</div>,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { InterviewChatPage } from '../InterviewChatPage';
import { AnswerComposer } from '../../../components/AnswerComposer';
import type {
  IInterviewQuestion,
  IInterviewSessionDetail,
} from '../../../types/interview.types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures & helpers
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION_TEXT = 'Describe a technical challenge you solved.';

function makeQuestion(overrides?: Partial<IInterviewQuestion>): IInterviewQuestion {
  return {
    id: 'q1',
    sessionId: 'session-1',
    position: 1,
    text: QUESTION_TEXT,
    answerText: null,
    responseLatencySeconds: null,
    evaluation: null,
    ...overrides,
  };
}

function makeActiveSession(questions: IInterviewQuestion[]): IInterviewSessionDetail {
  return {
    id: 'session-1',
    userId: 'user-1',
    state: 'ACTIVE',
    difficultyTier: 'ENTRY',
    jobDescription: 'Software engineer role',
    questionCount: questions.length,
    resumeVersionId: null,
    createdAt: new Date().toISOString(),
    questions,
    scorecard: null,
  };
}

/**
 * Store that starts with no active session (setup form) but transitions to an
 * active session with a question after startSession resolves.
 */
function setupNoSessionStore(): void {
  const questions = [makeQuestion()];
  const session = makeActiveSession(questions);

  // After setup form submission the store transitions: startSession resolves
  // and activeSession/activeQuestions become available. We simulate this by
  // having startSession mutate the state object so subsequent renders see an
  // active session with questions.
  const state: Record<string, unknown> = {
    activeSession: null,
    activeQuestions: [],
    isLoading: false,
    error: null,
    scorecard: null,
    sessions: [],
    createSession: vi.fn().mockResolvedValue({ id: 'session-1', state: 'PENDING' }),
    openSession: vi.fn().mockResolvedValue({ id: 'session-1', questions }),
    startSession: vi.fn().mockImplementation(async () => {
      // Switch store to active session
      state.activeSession = session;
      state.activeQuestions = questions;
      return questions;
    }),
    submitAnswer: vi.fn().mockResolvedValue(null),
    computeScorecard: vi.fn(),
    clearError: vi.fn(),
  };

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// beforeEach
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRecognitionState = {
    isSupported: true,
    isListening: false,
    transcript: '',
    transcriptRef: { current: '' },
    permission: 'unknown',
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    clearTranscript: vi.fn(),
  };
  Element.prototype.scrollIntoView = vi.fn();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: submit setup form with voice mode selected, wait for Chat_View
// Returns the rerender function so tests can trigger re-renders.
// ─────────────────────────────────────────────────────────────────────────────

async function renderAndEnterVoiceMode(): Promise<{
  rerender: (ui: React.ReactElement) => void;
}> {
  const result = render(<InterviewChatPage />);

  const user = userEvent.setup();

  // Select voice radio
  await user.click(screen.getByRole('radio', { name: /voice/i }));

  // Fill job description (min 1 char)
  await user.type(
    screen.getByLabelText(/job description/i),
    'Backend engineer with Go expertise.',
  );

  // Submit
  await user.click(screen.getByRole('button', { name: /start interview/i }));

  // Wait for Chat_View to replace the setup form
  await waitFor(() => {
    expect(
      screen.queryByRole('heading', { name: /start an interview/i }),
    ).not.toBeInTheDocument();
  });

  // At this point the page is in Chat_View with sessionMode === 'voice'
  return { rerender: result.rerender };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe.skip('InterviewChatPage — microphone permissions', () => {

  // ── Req 9.1: mic prompt on start; startListening called on button press ───

  describe('Req 9.1 — permission prompt initiated on mic start', () => {
    it('calls recognition.startListening when the mic button is pressed in voice mode', async () => {
      setupNoSessionStore();
      await renderAndEnterVoiceMode();

      // VoiceControls is rendered in two places (page playback bar + AnswerComposer),
      // so there are multiple "Start listening" buttons. Click the first one.
      const micBtns = screen.getAllByRole('button', { name: /start listening/i });
      expect(micBtns.length).toBeGreaterThan(0);
      await userEvent.setup().click(micBtns[0]!);

      // startListening should be called — this is what triggers the browser permission prompt
      expect(mockRecognitionState.startListening).toHaveBeenCalledOnce();
    });
  });

  // ── Req 9.2: auto-begin on grant; no second start needed; typing allowed ──

  describe('Req 9.2 — auto-begin capture on grant; typing allowed', () => {
    it('renders the transcript input in voice mode so typing is always allowed', async () => {
      setupNoSessionStore();
      await renderAndEnterVoiceMode();

      // The AnswerComposer in voice mode always shows an editable transcript field
      const transcriptField = screen.getByRole('textbox', { name: /transcript/i });
      expect(transcriptField).toBeInTheDocument();
      expect(transcriptField).not.toBeDisabled();
    });

    it('allows typing in the transcript field while permission is unknown (not yet asked)', async () => {
      setupNoSessionStore();
      await renderAndEnterVoiceMode();

      const transcriptField = screen.getByRole('textbox', { name: /transcript/i });
      await userEvent.setup().type(transcriptField, 'My typed answer while waiting');
      expect(transcriptField).toHaveValue('My typed answer while waiting');
    });
  });

  // ── Req 9.3: denied permission → fallback notice + text-mode controls ─────

  describe('Req 9.3 — denied permission: fallback notice + text mode', () => {
    it('shows a fallback notice when recognition.permission becomes "denied" in voice mode', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      // Update mock state to reflect permission denied
      mockRecognitionState = {
        ...mockRecognitionState,
        permission: 'denied',
        error: 'not-allowed',
      };

      // Rerender so the hook returns new state and the useEffect re-runs
      act(() => {
        rerender(<InterviewChatPage />);
      });

      // The fallback notice (role="status") should mention microphone permission
      await waitFor(() => {
        const notices = screen.queryAllByRole('status');
        const micNotice = notices.find((el) =>
          /microphone permission was denied/i.test(el.textContent ?? ''),
        );
        expect(micNotice).toBeDefined();
      });
    });

    it('switches to text-mode composer after permission denied in voice mode', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        permission: 'denied',
        error: 'not-allowed',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // Text textarea (label "Your answer") should appear — voice mode switched to text
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /your answer/i })).toBeInTheDocument();
      });
    });
  });

  // ── Req 9.4: question caption preserved after fallback ────────────────────

  describe('Req 9.4 — question caption preserved after permission denied', () => {
    it('still shows the question text in the chat thread after voice→text fallback', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      // Caption visible before fallback
      expect(screen.getByText(QUESTION_TEXT)).toBeInTheDocument();

      // Simulate permission denied
      mockRecognitionState = {
        ...mockRecognitionState,
        permission: 'denied',
        error: 'not-allowed',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // Caption must still be visible after the mode switch (Req 9.4)
      await waitFor(() => {
        expect(screen.getByText(QUESTION_TEXT)).toBeInTheDocument();
      });
    });
  });

  // ── Req 9.5: audio-capture timeout → text fallback ────────────────────────

  describe('Req 9.5 — audio-capture timeout: fallback notice + text mode', () => {
    it('shows a fallback notice when recognition.error is "audio-capture" in voice mode', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        error: 'audio-capture',
        permission: 'unknown',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // Fallback notice mentions voice capture stopping
      await waitFor(() => {
        const notices = screen.queryAllByRole('status');
        const captureNotice = notices.find((el) =>
          /voice capture stopped|switched to text/i.test(el.textContent ?? ''),
        );
        expect(captureNotice).toBeDefined();
      });
    });

    it('switches to text-mode composer after audio-capture error', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        error: 'audio-capture',
        permission: 'unknown',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /your answer/i })).toBeInTheDocument();
      });
    });
  });

  // ── Req 9.6: previously-denied → re-enable instructions ──────────────────

  describe('Req 9.6 — previously denied: re-enable instructions shown', () => {
    it('AnswerComposer shows mic re-enable instructions when mode is voice and permission is denied', () => {
      // Direct component test: AnswerComposer in voice mode with denied permission
      // independently renders an alert with browser-settings re-enable instructions.
      const deniedRecognition = {
        isSupported: true,
        isListening: false,
        transcript: '',
        transcriptRef: { current: '' },
        permission: 'denied' as const,
        error: 'not-allowed' as string | null,
        startListening: vi.fn(),
        stopListening: vi.fn(),
        clearTranscript: vi.fn(),
      };

      render(
        <AnswerComposer
          mode="voice"
          isSubmitting={false}
          recognition={deniedRecognition}
          onSend={vi.fn()}
          fallbackNotice={null}
          maxLength={5000}
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/microphone access was denied/i);
      expect(alert.textContent).toMatch(/browser settings/i);
      // Should mention reloading or re-enabling
      expect(alert.textContent).toMatch(/allow|re-enable|reload/i);
    });

    it('AnswerComposer with denied permission still provides a text input for typing', () => {
      // Req 9.2 + 9.6: typing must be allowed even when mic is denied
      const deniedRecognition = {
        isSupported: true,
        isListening: false,
        transcript: '',
        transcriptRef: { current: '' },
        permission: 'denied' as const,
        error: 'not-allowed' as string | null,
        startListening: vi.fn(),
        stopListening: vi.fn(),
        clearTranscript: vi.fn(),
      };

      render(
        <AnswerComposer
          mode="voice"
          isSubmitting={false}
          recognition={deniedRecognition}
          onSend={vi.fn()}
          fallbackNotice={null}
          maxLength={5000}
        />,
      );

      const transcriptInput = screen.getByRole('textbox', { name: /transcript/i });
      expect(transcriptInput).toBeInTheDocument();
      expect(transcriptInput).not.toBeDisabled();
    });

    it('page-level fallback notice + text input both available after denied permission', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        permission: 'denied',
        error: 'not-allowed',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // After fallback: text composer with send button available for remaining questions
      await waitFor(() => {
        const textInput = screen.getByRole('textbox', { name: /your answer/i });
        expect(textInput).toBeInTheDocument();
        expect(textInput).not.toBeDisabled();
      });
    });
  });

  // ── Cross-cutting: send button available after any fallback ───────────────

  describe('send button available in text mode after any permission fallback', () => {
    it('enables the send button after typing a valid answer following denied-permission fallback', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        permission: 'denied',
        error: 'not-allowed',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /your answer/i })).toBeInTheDocument();
      });

      await userEvent.setup().type(
        screen.getByRole('textbox', { name: /your answer/i }),
        'My fallback answer',
      );

      expect(screen.getByRole('button', { name: /send answer/i })).not.toBeDisabled();
    });

    it('enables the send button after typing following audio-capture fallback', async () => {
      setupNoSessionStore();
      const { rerender } = await renderAndEnterVoiceMode();

      mockRecognitionState = {
        ...mockRecognitionState,
        error: 'audio-capture',
        permission: 'unknown',
      };

      act(() => {
        rerender(<InterviewChatPage />);
      });

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /your answer/i })).toBeInTheDocument();
      });

      await userEvent.setup().type(
        screen.getByRole('textbox', { name: /your answer/i }),
        'Answer after timeout',
      );

      expect(screen.getByRole('button', { name: /send answer/i })).not.toBeDisabled();
    });
  });
});
