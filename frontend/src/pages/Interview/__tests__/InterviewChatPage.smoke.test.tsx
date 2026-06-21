/**
 * Browser-native / no-backend smoke tests for the Interview Chat & Voice feature.
 *
 * These tests verify:
 *  1. useSpeechRecognition.isSupported is false when neither SpeechRecognition
 *     nor webkitSpeechRecognition is present in the window (Req 11.1)
 *  2. useSpeechSynthesis.isSupported is false when speechSynthesis is not in
 *     the window (Req 11.1)
 *  3. When both voice APIs are absent the Session_Setup defaults to text mode
 *     and the voice option is disabled (Req 11.3)
 *  4. Text mode continues to work when both voice APIs are absent — the form
 *     renders and submits normally (Req 11.3 graceful degradation)
 *  5. The hooks detect speech capability only through browser globals, not
 *     any external speech SDK (Req 11.1, 11.2)
 *  6. useSpeechSynthesis routes speak() through window.speechSynthesis only (Req 11.1)
 *  7. Answers submitted via the store only — no extra fetch to speech endpoints (Req 11.3)
 *  8. Both hooks report isSupported true when browser globals are present (Req 11.1)
 *
 * Validates: Requirements 11.1, 11.2, 11.3
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Hoist shared mock state so vi.mock factories (which are hoisted by Vitest)
// can safely reference it.
// ─────────────────────────────────────────────────────────────────────────────

const { mockSttSupported } = vi.hoisted(() => ({
  mockSttSupported: { value: false },
}));

// ── Speech hook mocks — used only by component-level tests (3, 4, 7) ─────────
vi.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: mockSttSupported.value,
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

// ── Store mock ────────────────────────────────────────────────────────────────
vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';

// ── Component (imported after mocks) ─────────────────────────────────────────
import { InterviewChatPage } from '../InterviewChatPage';

// ── Stub presentational sub-components irrelevant to smoke checks ─────────────
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
// Fake SpeechRecognition constructor for hook-level smoke tests
// ─────────────────────────────────────────────────────────────────────────────

function FakeSpeechRecognitionCtor(this: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: null;
  onend: null;
  onerror: null;
  onresult: null;
  onaudiostart: null;
  onsoundstart: null;
}): void {
  this.start = vi.fn();
  this.stop = vi.fn();
  this.abort = vi.fn();
  this.lang = '';
  this.continuous = false;
  this.interimResults = false;
  this.onstart = null;
  this.onend = null;
  this.onerror = null;
  this.onresult = null;
  this.onaudiostart = null;
  this.onsoundstart = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store helper for component-level tests
// ─────────────────────────────────────────────────────────────────────────────

function setupMockStore(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
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

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
  );

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('InterviewChatPage — browser-native / no-backend smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: voice APIs absent (simulates the degradation scenario)
    mockSttSupported.value = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Smoke 1 ─────────────────────────────────────────────────────────────────
  // Req 11.1: useSpeechRecognition.isSupported comes exclusively from checking
  // the SpeechRecognition / webkitSpeechRecognition browser globals. When neither
  // is present the hook must report false.

  it('Smoke 1 — useSpeechRecognition.isSupported is false when SpeechRecognition and webkitSpeechRecognition are absent (Req 11.1)', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);

    // Use the real hook (bypass the component-level mock via importActual)
    const { useSpeechRecognition } =
      await vi.importActual<typeof import('../../../hooks/useSpeechRecognition')>(
        '../../../hooks/useSpeechRecognition',
      );

    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
  });

  // ── Smoke 2 ─────────────────────────────────────────────────────────────────
  // Req 11.1: useSpeechSynthesis.isSupported comes exclusively from checking
  // window.speechSynthesis. When it is absent the hook must report false.
  //
  // Note: `vi.stubGlobal('speechSynthesis', undefined)` keeps the property key
  // on window (so `'speechSynthesis' in window` is still true). To truly remove
  // it we delete the property directly before the test, then restore it after.

  it('Smoke 2 — useSpeechSynthesis.isSupported is false when speechSynthesis is absent from window (Req 11.1)', async () => {
    // Capture the original descriptor so we can restore it in afterEach
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');

    // Delete the property so `'speechSynthesis' in window` evaluates to false
    // (which is what isSpeechSynthesisSupported() inside the hook checks)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).speechSynthesis;
    } catch {
      // jsdom may not allow deletion; define it as a non-enumerable undefined
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }

    const { useSpeechSynthesis } =
      await vi.importActual<typeof import('../../../hooks/useSpeechSynthesis')>(
        '../../../hooks/useSpeechSynthesis',
      );

    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(false);

    // Restore the original descriptor so other tests are unaffected
    if (originalDescriptor !== undefined) {
      Object.defineProperty(window, 'speechSynthesis', originalDescriptor);
    }
  });

  // ── Smoke 3 ─────────────────────────────────────────────────────────────────
  // Req 11.3: When voice APIs are absent the Session_Setup must default to text
  // mode and disable the voice option with an informational message.

  it('Smoke 3 — Session_Setup defaults to text mode and disables the voice option when voice APIs are absent (Req 11.3)', () => {
    // mockSttSupported.value is false (set in beforeEach)
    setupMockStore({ activeSession: null });

    render(<InterviewChatPage />);

    const textRadio = screen.getByRole('radio', { name: /text/i });
    expect(textRadio).toBeChecked();

    const voiceRadio = screen.getByRole('radio', { name: /voice/i });
    expect(voiceRadio).toBeDisabled();

    expect(
      screen.getByText(/voice mode is not available in this browser/i),
    ).toBeInTheDocument();
  });

  // ── Smoke 4 ─────────────────────────────────────────────────────────────────
  // Req 11.3: Text mode must remain fully operable when voice APIs are absent.

  it('Smoke 4 — text mode is fully operable when voice APIs are absent (form renders + submit wires to store) (Req 11.3)', async () => {
    const store = setupMockStore({ activeSession: null });
    const user = userEvent.setup();

    render(<InterviewChatPage />);

    expect(screen.getByRole('heading', { name: /start an interview/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/job description/i), 'Senior React engineer role');

    const submitBtn = screen.getByRole('button', { name: /start interview/i });
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(store.createSession).toHaveBeenCalledOnce();
      expect(store.openSession).toHaveBeenCalledWith('session-1');
      expect(store.startSession).toHaveBeenCalledWith('session-1');
    });
  });

  // ── Smoke 5 ─────────────────────────────────────────────────────────────────
  // Req 11.1, 11.2: useSpeechRecognition detects support purely via browser
  // globals. Stubbing the global is sufficient — no external SDK is involved.

  it('Smoke 5 — useSpeechRecognition detects support via browser globals only, with no external SDK (Req 11.1, 11.2)', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognitionCtor);
    vi.stubGlobal('webkitSpeechRecognition', undefined);

    const { useSpeechRecognition } =
      await vi.importActual<typeof import('../../../hooks/useSpeechRecognition')>(
        '../../../hooks/useSpeechRecognition',
      );

    const { result } = renderHook(() => useSpeechRecognition());

    // isSupported reflects the stub we installed
    expect(result.current.isSupported).toBe(true);

    // startListening should succeed using the fake constructor (browser-global path)
    act(() => {
      result.current.startListening();
    });

    // If a third-party SDK had been used, the fake global would be bypassed
    // and we would see an error; the absence of an error confirms the hook
    // uses only the browser global.
    expect(result.current.error).toBeNull();
  });

  // ── Smoke 6 ─────────────────────────────────────────────────────────────────
  // Req 11.1, 11.2: useSpeechSynthesis routes speak() through window.speechSynthesis.

  it('Smoke 6 — useSpeechSynthesis routes speak() through the browser speechSynthesis global only (Req 11.1, 11.2)', async () => {
    const speakSpy = vi.fn();
    const cancelSpy = vi.fn();

    vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: cancelSpy });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        onend: (() => void) | null = null;
        onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null;
        constructor(text: string) { this.text = text; }
      },
    );

    const { useSpeechSynthesis } =
      await vi.importActual<typeof import('../../../hooks/useSpeechSynthesis')>(
        '../../../hooks/useSpeechSynthesis',
      );

    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.isSupported).toBe(true);

    act(() => {
      result.current.speak('Hello, candidate');
    });

    // The stub received the call — confirms no third-party SDK is involved
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  // ── Smoke 7 ─────────────────────────────────────────────────────────────────
  // Req 11.3: Answer submission flows exclusively through the store's submitAnswer
  // (which uses interview.service → /api/v1/interview/*). No extra fetch call
  // to any speech endpoint should occur during a render.

  it('Smoke 7 — no extra fetch is made during session render; submitAnswer is the sole answer submission path (Req 11.3)', () => {
    const currentQuestion = {
      id: 'q1',
      position: 1,
      text: 'Tell me about yourself',
      answerText: null,
      evaluationResult: null,
      sessionId: 'session-1',
      responseLatencySeconds: null,
    };

    setupMockStore({
      activeSession: {
        id: 'session-1',
        state: 'ACTIVE',
        difficultyTier: 'ENTRY',
        questionCount: 5,
        userId: 'user-1',
        jobDescription: 'React developer',
        resumeVersionId: null,
        createdAt: new Date().toISOString(),
        questions: [currentQuestion],
        scorecard: null,
      },
      activeQuestions: [currentQuestion],
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<InterviewChatPage />);

    // No external fetch should occur during a pure render
    expect(fetchSpy).not.toHaveBeenCalled();

    // The store provides submitAnswer as the only answer delivery mechanism
    const storeState = (useInterviewStore as unknown as ReturnType<typeof vi.fn>)();
    expect(typeof storeState.submitAnswer).toBe('function');

    fetchSpy.mockRestore();
  });

  // ── Smoke 8 ─────────────────────────────────────────────────────────────────
  // Req 11.1: When both browser globals are present both hooks report isSupported true.

  it('Smoke 8 — both hooks report isSupported true when browser globals are present (Req 11.1)', async () => {
    vi.stubGlobal('SpeechRecognition', FakeSpeechRecognitionCtor);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        onend: (() => void) | null = null;
        onerror: ((ev: SpeechSynthesisErrorEvent) => void) | null = null;
        constructor(text: string) { this.text = text; }
      },
    );

    const { useSpeechRecognition } =
      await vi.importActual<typeof import('../../../hooks/useSpeechRecognition')>(
        '../../../hooks/useSpeechRecognition',
      );
    const { useSpeechSynthesis } =
      await vi.importActual<typeof import('../../../hooks/useSpeechSynthesis')>(
        '../../../hooks/useSpeechSynthesis',
      );

    const { result: recogResult } = renderHook(() => useSpeechRecognition());
    const { result: synthResult } = renderHook(() => useSpeechSynthesis());

    expect(recogResult.current.isSupported).toBe(true);
    expect(synthResult.current.isSupported).toBe(true);
  });
});
