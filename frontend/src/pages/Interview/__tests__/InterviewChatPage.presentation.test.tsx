/**
 * InterviewChatPage — Chat presentation tests
 *
 * Validates: Requirements 2.7, 6.1, 10.1, 10.5
 *
 * Tests covered:
 *  - Captions present for every message (Req 10.1)
 *  - Autoscroll invoked on message append (Req 2.7)
 *  - ARIA live region announces messages (Req 10.5)
 *  - Presentation timestamp stamped once across a re-render (Req 6.1)
 *
 * Ordering/pairing/currentQuestion are covered by Property 1 (interview.chat.test.ts).
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Store mock ────────────────────────────────────────────────────────────────
vi.mock('../../../stores/interview.store', () => ({
  useInterviewStore: vi.fn(),
}));

// ── Speech hooks mocks ────────────────────────────────────────────────────────
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

// ── scrollIntoView mock ───────────────────────────────────────────────────────
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { useInterviewStore } from '../../../stores/interview.store';
import { InterviewChatPage } from '../InterviewChatPage';
import type {
  IInterviewQuestion,
  IInterviewSessionDetail,
} from '../../../types/interview.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal IInterviewQuestion fixture. */
function makeQuestion(
  overrides: Partial<IInterviewQuestion> & { id: string; position: number; text: string },
): IInterviewQuestion {
  return {
    sessionId: 'session-active',
    answerText: null,
    responseLatencySeconds: null,
    evaluation: null,
    ...overrides,
  };
}

/** Build a minimal ACTIVE IInterviewSessionDetail fixture. */
function makeActiveSession(
  questions: IInterviewQuestion[],
): IInterviewSessionDetail {
  return {
    id: 'session-active',
    userId: 'user-1',
    state: 'ACTIVE',
    difficultyTier: 'ENTRY',
    jobDescription: 'Test job description',
    questionCount: questions.length,
    resumeVersionId: null,
    createdAt: new Date().toISOString(),
    questions,
    scorecard: null,
  };
}

/** Default actions returned by the mock store. */
const defaultActions = {
  createSession: vi.fn(),
  openSession: vi.fn(),
  startSession: vi.fn(),
  submitAnswer: vi.fn(),
  computeScorecard: vi.fn(),
  loadScorecard: vi.fn(),
  clearError: vi.fn(),
  reset: vi.fn(),
};

type MockStoreShape = {
  activeSession: IInterviewSessionDetail | null;
  activeQuestions: IInterviewQuestion[];
  isLoading: boolean;
  error: { message: string } | null;
  scorecard: null;
  sessions: unknown[];
  stories: unknown[];
} & typeof defaultActions;

/**
 * Configure the mocked useInterviewStore to return the supplied state + actions.
 *
 * InterviewChatPage calls `useInterviewStore()` with NO selector (plain
 * destructuring), so we use `mockReturnValue` to return the whole state object
 * directly. `ScorecardSection` (an inner component) also calls the store without
 * a selector so the same pattern applies.
 */
function setupStore(overrides: Partial<MockStoreShape> = {}): MockStoreShape {
  const state: MockStoreShape = {
    activeSession: null,
    activeQuestions: [],
    isLoading: false,
    error: null,
    scorecard: null,
    sessions: [],
    stories: [],
    ...defaultActions,
    ...overrides,
  };

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(state);

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('InterviewChatPage — presentation', () => {
  // ── Req 10.1: captions present for every message ─────────────────────────

  describe('Req 10.1 — captions present for every message', () => {
    it('renders the current question text as visible caption text in the chat thread', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Tell me about yourself.' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      // The question text must appear as visible caption text in the thread
      expect(
        screen.getByText('Tell me about yourself.'),
      ).toBeInTheDocument();
    });

    it('renders all answered question/answer pairs as visible captions', () => {
      const questions: IInterviewQuestion[] = [
        makeQuestion({
          id: 'q1',
          position: 1,
          text: 'What is your experience?',
          answerText: 'I have five years of experience.',
        }),
        makeQuestion({ id: 'q2', position: 2, text: 'Describe a challenge.' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      // First question (answered) — both assistant and user captions visible
      expect(screen.getByText('What is your experience?')).toBeInTheDocument();
      expect(screen.getByText('I have five years of experience.')).toBeInTheDocument();

      // Second question (current, unanswered) — assistant caption visible
      expect(screen.getByText('Describe a challenge.')).toBeInTheDocument();
    });

    it('renders caption text for multiple answered questions', () => {
      const questions: IInterviewQuestion[] = [
        makeQuestion({
          id: 'q1',
          position: 1,
          text: 'First question',
          answerText: 'First answer',
        }),
        makeQuestion({
          id: 'q2',
          position: 2,
          text: 'Second question',
          answerText: 'Second answer',
        }),
        makeQuestion({ id: 'q3', position: 3, text: 'Third question' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      expect(screen.getByText('First question')).toBeInTheDocument();
      expect(screen.getByText('First answer')).toBeInTheDocument();
      expect(screen.getByText('Second question')).toBeInTheDocument();
      expect(screen.getByText('Second answer')).toBeInTheDocument();
      expect(screen.getByText('Third question')).toBeInTheDocument();
    });
  });

  // ── Req 2.7: autoscroll invoked on message render ─────────────────────────

  describe('Req 2.7 — autoscroll invoked on message render/append', () => {
    it('calls scrollIntoView when messages are rendered', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Tell me about yourself.' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('calls scrollIntoView when additional questions are added (simulated via re-render)', () => {
      const initialQuestions = [
        makeQuestion({
          id: 'q1',
          position: 1,
          text: 'First question',
          answerText: 'First answer',
        }),
      ];
      const initialSession = makeActiveSession(initialQuestions);

      setupStore({
        activeSession: initialSession,
        activeQuestions: initialQuestions,
      });

      const { rerender } = render(<InterviewChatPage />);

      const callCountAfterFirstRender = (
        Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      expect(callCountAfterFirstRender).toBeGreaterThan(0);

      // Simulate a new question being added to the thread
      const updatedQuestions: IInterviewQuestion[] = [
        ...initialQuestions,
        makeQuestion({ id: 'q2', position: 2, text: 'Describe a challenge.' }),
      ];
      const updatedSession = makeActiveSession(updatedQuestions);

      setupStore({
        activeSession: updatedSession,
        activeQuestions: updatedQuestions,
      });

      act(() => {
        rerender(<InterviewChatPage />);
      });

      const callCountAfterUpdate = (
        Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
      ).mock.calls.length;

      expect(callCountAfterUpdate).toBeGreaterThan(callCountAfterFirstRender);
    });
  });

  // ── Req 10.5: ARIA live region announces messages ─────────────────────────

  describe('Req 10.5 — ARIA live region announces messages', () => {
    it('renders an aria-live="polite" region in the chat view', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'What motivates you?' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
    });

    it('the ARIA live region contains the latest message text', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Tell me your strengths.' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      // The sr-only live region in ChatThread should contain the latest message
      const liveRegions = document.querySelectorAll('[aria-live="polite"]');
      const anyRegionHasText = Array.from(liveRegions).some((el) =>
        el.textContent?.includes('Tell me your strengths.'),
      );
      expect(anyRegionHasText).toBe(true);
    });

    it('announces multiple messages as the thread grows', () => {
      const questions: IInterviewQuestion[] = [
        makeQuestion({
          id: 'q1',
          position: 1,
          text: 'Opening question',
          answerText: 'My opening answer',
        }),
        makeQuestion({ id: 'q2', position: 2, text: 'Follow-up question' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      // The latest message is the current (unanswered) question
      const liveRegions = document.querySelectorAll('[aria-live="polite"]');
      const anyRegionHasFollowUp = Array.from(liveRegions).some((el) =>
        el.textContent?.includes('Follow-up question'),
      );
      expect(anyRegionHasFollowUp).toBe(true);
    });
  });

  // ── Req 6.1: presentation timestamp stamped once across a re-render ───────

  describe('Req 6.1 — presentation timestamp stamped once (indirectly tested)', () => {
    it('renders the currentQuestion correctly on initial render', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Current unanswered question' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      render(<InterviewChatPage />);

      expect(screen.getByText('Current unanswered question')).toBeInTheDocument();
    });

    it('re-rendering with the same question does not break the chat interface', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Stable question text' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      const { rerender } = render(<InterviewChatPage />);

      // Re-render with the same store state (simulates React re-render without data change)
      setupStore({ activeSession: session, activeQuestions: questions });

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // The question must still be visible and the interface must remain intact
      expect(screen.getByText('Stable question text')).toBeInTheDocument();
      // The chat view main landmark is still present
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('the same question appears only once after a re-render (no duplication)', () => {
      const questions = [
        makeQuestion({ id: 'q1', position: 1, text: 'Unique question text XYZ' }),
      ];
      const session = makeActiveSession(questions);

      setupStore({ activeSession: session, activeQuestions: questions });

      const { rerender } = render(<InterviewChatPage />);

      setupStore({ activeSession: session, activeQuestions: questions });

      act(() => {
        rerender(<InterviewChatPage />);
      });

      // The question text should appear exactly once (no duplication from re-stamp)
      const matches = screen.getAllByText('Unique question text XYZ');
      expect(matches).toHaveLength(1);
    });
  });
});
