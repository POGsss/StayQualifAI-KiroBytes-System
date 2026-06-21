/**
 * Session_Setup tests for InterviewChatPage.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 8.1, 8.2
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Speech hook mocks (must precede component import) ────────────────────────
// The mock factory is a vi.fn() so individual tests can override isSupported.
const mockSpeechRecognitionImpl = vi.fn(() => ({
  isSupported: true,
  isListening: false,
  transcript: '',
  transcriptRef: { current: '' },
  permission: 'unknown' as const,
  error: null,
  startListening: vi.fn(),
  stopListening: vi.fn(),
  clearTranscript: vi.fn(),
}));

vi.mock('../../../hooks/useSpeechRecognition', () => ({
  get useSpeechRecognition() {
    return mockSpeechRecognitionImpl;
  },
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

// ── Component (imported after mocks) ─────────────────────────────────────────
import { InterviewChatPage } from '../InterviewChatPage';

// ── Mock sub-components that are irrelevant to setup tests ───────────────────
vi.mock('../../../components/ChatThread', () => ({
  ChatThread: () => <div data-testid="chat-thread" />,
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type MockStoreState = {
  activeSession: null | {
    id: string;
    state: string;
    difficultyTier: string;
    questionCount: number;
    userId: string;
    jobDescription: string;
    resumeVersionId: string | null;
    createdAt: string;
    questions: unknown[];
    scorecard: null;
  };
  activeQuestions: unknown[];
  isLoading: boolean;
  error: null | { type: string; message: string };
  scorecard: null;
  sessions: unknown[];
  createSession: ReturnType<typeof vi.fn>;
  openSession: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  submitAnswer: ReturnType<typeof vi.fn>;
  computeScorecard: ReturnType<typeof vi.fn>;
  loadSessions: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
};

function setupMockStore(overrides: Partial<MockStoreState> = {}): MockStoreState {
  const base: MockStoreState = {
    activeSession: null,
    activeQuestions: [],
    isLoading: false,
    error: null,
    scorecard: null,
    sessions: [],
    createSession: vi.fn().mockResolvedValue({ id: 'session-1', state: 'PENDING' }),
    openSession: vi.fn().mockResolvedValue({ id: 'session-1', questions: [] }),
    startSession: vi.fn().mockResolvedValue([]),
    submitAnswer: vi.fn(),
    computeScorecard: vi.fn(),
    loadSessions: vi.fn(),
    clearError: vi.fn(),
  };
  const state = { ...base, ...overrides };

  // The component calls useInterviewStore() without a selector (bare destructuring).
  // Return the full state object when called without arguments; support the selector
  // pattern as a fallback for any internal Zustand usage.
  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
  );
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('InterviewChatPage — Session_Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset speech recognition mock to default (supported) before each test
    mockSpeechRecognitionImpl.mockImplementation(() => ({
      isSupported: true,
      isListening: false,
      transcript: '',
      transcriptRef: { current: '' },
      permission: 'unknown' as const,
      error: null,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      clearTranscript: vi.fn(),
    }));
  });

  // ── 1. Renders Session_Setup when no active session ──────────────────────
  it('renders the setup form when there is no active session', () => {
    setupMockStore({ activeSession: null });
    render(<InterviewChatPage />);

    // The form / heading should be present
    expect(screen.getByRole('heading', { name: /start an interview/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start interview/i })).toBeInTheDocument();
  });

  // ── 2. Default mode is "text" ────────────────────────────────────────────
  it('selects "text" radio button by default (Req 1.1, 1.2)', () => {
    setupMockStore();
    render(<InterviewChatPage />);

    const textRadio = screen.getByRole('radio', { name: /text/i });
    const voiceRadio = screen.getByRole('radio', { name: /voice/i });

    expect(textRadio).toBeChecked();
    expect(voiceRadio).not.toBeChecked();
  });

  // ── 3. Default difficulty is "ENTRY" ─────────────────────────────────────
  it('shows ENTRY as the default difficulty selection (Req 1.3)', () => {
    setupMockStore();
    render(<InterviewChatPage />);

    const select = screen.getByRole('combobox', { name: /difficulty/i }) as HTMLSelectElement;
    expect(select.value).toBe('ENTRY');
  });

  // ── 4. Default question count is 5 ───────────────────────────────────────
  it('shows 5 as the default question count (Req 1.4)', () => {
    setupMockStore();
    render(<InterviewChatPage />);

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i }) as HTMLInputElement;
    expect(countInput.value).toBe('5');
  });

  // ── 5. JD empty → submit disabled ────────────────────────────────────────
  it('disables submit when JD is empty (Req 1.5)', () => {
    setupMockStore();
    render(<InterviewChatPage />);

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    // JD is empty by default → button should be disabled
    expect(submitBtn).toBeDisabled();
  });

  // ── 6. JD with 1 char → submit enabled ───────────────────────────────────
  it('enables submit when JD has 1 character (Req 1.5)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/job description/i), 'x');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeEnabled();
  });

  // ── 7. JD with 5000 chars → submit enabled ───────────────────────────────
  it('enables submit when JD is exactly 5000 characters (Req 1.5, 1.9)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    const jd5000 = 'a'.repeat(5000);
    await user.click(screen.getByLabelText(/job description/i));
    await user.paste(jd5000);

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeEnabled();
  });

  // ── 8. JD with 5001 chars → submit disabled + error shown ────────────────
  it('disables submit and shows error when JD exceeds 5000 characters (Req 1.9)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    const jd5001 = 'a'.repeat(5001);
    await user.click(screen.getByLabelText(/job description/i));
    await user.paste(jd5001);

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeDisabled();

    // Error message must be visible
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/too long/i)).toBeInTheDocument();
  });

  // ── 9. Count 4 → submit disabled with error ───────────────────────────────
  it('disables submit and shows error when question count is 4 (Req 1.6)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    // Fill JD so the only invalid field is count
    await user.type(screen.getByLabelText(/job description/i), 'Some JD');

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '4');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/between 5 and 15/i)).toBeInTheDocument();
  });

  // ── 10. Count 5 → submit enabled ──────────────────────────────────────────
  it('enables submit when question count is 5 (Req 1.6)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/job description/i), 'Some JD');

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '5');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeEnabled();
  });

  // ── 11. Count 15 → submit enabled ─────────────────────────────────────────
  it('enables submit when question count is 15 (Req 1.6)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/job description/i), 'Some JD');

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '15');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeEnabled();
  });

  // ── 12. Count 16 → submit disabled with error ─────────────────────────────
  it('disables submit and shows error when question count is 16 (Req 1.6)', async () => {
    setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/job description/i), 'Some JD');

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '16');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/between 5 and 15/i)).toBeInTheDocument();
  });

  // ── 13. Voice option disabled when STT unsupported ────────────────────────
  it('disables the voice radio and shows a message when STT is not supported (Req 8.1, 8.2)', () => {
    // Override the STT mock to return isSupported: false for this test
    mockSpeechRecognitionImpl.mockReturnValueOnce({
      isSupported: false,
      isListening: false,
      transcript: '',
      transcriptRef: { current: '' },
      permission: 'unknown' as const,
      error: null,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      clearTranscript: vi.fn(),
    });

    setupMockStore();
    render(<InterviewChatPage />);

    const voiceRadio = screen.getByRole('radio', { name: /voice/i });
    expect(voiceRadio).toBeDisabled();

    // Informational message about voice unavailability
    expect(
      screen.getByText(/voice mode is not available in this browser/i),
    ).toBeInTheDocument();
  });

  // ── 14. Create→open→start wiring ──────────────────────────────────────────
  it('calls createSession → openSession → startSession on valid submit (Req 1.7)', async () => {
    const store = setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    // Fill valid form
    await user.type(screen.getByLabelText(/job description/i), 'We need a React developer.');

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '5');

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    await waitFor(() => {
      expect(store.createSession).toHaveBeenCalledOnce();
      expect(store.openSession).toHaveBeenCalledWith('session-1');
      expect(store.startSession).toHaveBeenCalledWith('session-1');
    });
  });

  it('passes the correct params to createSession (Req 1.7)', async () => {
    const store = setupMockStore();
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/job description/i), 'React developer role');

    // Change difficulty to MID
    await user.selectOptions(screen.getByRole('combobox', { name: /difficulty/i }), 'MID');

    // Set count to 10
    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i });
    await user.clear(countInput);
    await user.type(countInput, '10');

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    await waitFor(() => {
      expect(store.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          difficultyTier: 'MID',
          jobDescription: 'React developer role',
          questionCount: 10,
        }),
      );
    });
  });

  // ── 15. Failure preserves fields and re-enables submit ────────────────────
  it('preserves form fields and re-enables submit after createSession returns null (Req 1.8)', async () => {
    setupMockStore({
      createSession: vi.fn().mockResolvedValue(null),
    });
    render(<InterviewChatPage />);
    const user = userEvent.setup();

    const jdText = 'Full-stack engineer needed.';
    await user.type(screen.getByLabelText(/job description/i), jdText);

    const countInput = screen.getByRole('spinbutton', { name: /number of questions/i }) as HTMLInputElement;
    await user.clear(countInput);
    await user.type(countInput, '7');

    await user.click(screen.getByRole('button', { name: /start interview/i }));

    // After failure the form fields should still hold their values
    await waitFor(() => {
      expect((screen.getByLabelText(/job description/i) as HTMLTextAreaElement).value).toBe(jdText);
      expect(countInput.value).toBe('7');

      // Submit button must be re-enabled (not stuck in loading/disabled state)
      expect(screen.getByRole('button', { name: /start interview/i })).toBeEnabled();
    });
  });
});
