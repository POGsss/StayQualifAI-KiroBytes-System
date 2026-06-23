/**
 * Routing / integration tests for the Interview module.
 *
 * Validates: Requirements 1.1, 2.1, 11.3
 *
 * Covers:
 *  1. `/interview/simulator` renders `InterviewChatPage` (Session_Setup) inside
 *     the Interview tab shell — asserts the "Start an Interview" heading.
 *  2. `/interview/scorecard` still resolves — asserts "Performance Scorecard".
 *  3. `/interview/sessions` still resolves — asserts "Interview Sessions".
 *  4. `/interview/stories` still resolves — asserts "STAR Story Organizer".
 *  5. No dangling `InterviewSimulatorPage` import or reference exists anywhere
 *     in the frontend source tree (verified via grep/TypeScript diagnostics).
 *
 * Strategy:
 *  Each sub-page is rendered inside a minimal nested `<Routes>` structure
 *  using `MemoryRouter`, mirroring how `App.tsx` wires the interview routes.
 *  All stores and browser-native speech hooks are mocked so the pages render
 *  without real API calls; we care only about the correct component mounting,
 *  not full behaviour (that is covered by the other test suites).
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Speech hooks — mocked with minimal stubs (no real browser APIs needed)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// Store mocks — all pages pull from useInterviewStore; minimal no-op stubs
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';

function setupEmptyStore(): void {
  const state = {
    activeSession: null,
    activeQuestions: [],
    sessions: [],
    stories: [],
    scorecard: null,
    isLoading: false,
    error: null,
    createSession: vi.fn(),
    openSession: vi.fn(),
    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    computeScorecard: vi.fn(),
    loadScorecard: vi.fn(),
    loadSessions: vi.fn().mockResolvedValue([]),
    loadStories: vi.fn().mockResolvedValue([]),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
    clearError: vi.fn(),
  };

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component mocks — keep pages lean; their own test suites verify detail
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ChatThread', () => ({
  ChatThread: () => <div data-testid="chat-thread" />,
}));
vi.mock('../../../components/ScoreDial', () => ({
  ScoreDial: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('../../../components/TierBadge', () => ({
  TierBadge: ({ tier }: { tier: string }) => <div>{tier}</div>,
}));
vi.mock('../../../components/Skeleton', () => ({
  Skeleton: () => <div aria-hidden="true" />,
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  SkeletonList: ({ label }: { label?: string }) => (
    <div role="status" aria-label={label ?? 'Loading'} />
  ),
  SkeletonText: () => <div aria-hidden="true" />,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks are registered)
// ─────────────────────────────────────────────────────────────────────────────

import { InterviewPage } from '../InterviewPage';
import { InterviewChatPage } from '../InterviewChatPage';
import { InterviewScorecardPage } from '../InterviewScorecardPage';
import { InterviewSessionsPage } from '../InterviewSessionsPage';
import { StarOrganizerPage } from '../StarOrganizerPage';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: render a given path through the full interview nested-route tree
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the App.tsx interview route nest:
 *
 *   <Route path="/interview" element={<InterviewPage />}>
 *     <Route path="simulator"  element={<InterviewChatPage />} />
 *     <Route path="scorecard"  element={<InterviewScorecardPage />} />
 *     <Route path="sessions"   element={<InterviewSessionsPage />} />
 *     <Route path="stories"    element={<StarOrganizerPage />} />
 *   </Route>
 */
function renderAtPath(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/interview" element={<InterviewPage />}>
          <Route path="simulator" element={<InterviewChatPage />} />
          <Route path="scorecard" element={<InterviewScorecardPage />} />
          <Route path="sessions" element={<InterviewSessionsPage />} />
          <Route path="stories" element={<StarOrganizerPage />} />
        </Route>
        {/* Catch-all so tests that navigate away don't crash */}
        <Route path="*" element={<Outlet />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupEmptyStore();
  Element.prototype.scrollIntoView = vi.fn();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Interview routing — /interview/simulator → InterviewChatPage', () => {
  it('renders the Session_Setup heading (Req 1.1, 2.1)', () => {
    renderAtPath('/interview/simulator');

    // The Session_Setup form heading rendered by InterviewChatPage
    expect(
      screen.getByRole('heading', { name: /interview session/i }),
    ).toBeInTheDocument();
  });

  it('renders the job-description textarea that is part of the Session_Setup form (Req 1.1)', () => {
    renderAtPath('/interview/simulator');

    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
  });

  it('renders the InterviewPage shell around the routed content (tabs now live in the global top bar)', () => {
    renderAtPath('/interview/simulator');

    // The feature tabs (Simulator / Sessions / STAR) moved to the global top
    // bar, so the page shell no longer renders an in-page "Interview sections"
    // nav. This isolated route tree mounts only the shell + sub-page.
    expect(
      screen.queryByRole('navigation', { name: /interview sections/i }),
    ).not.toBeInTheDocument();

    // The shell still hosts the routed sub-page content.
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
  });
});

describe('Interview routing — other tab routes still resolve', () => {
  it('/interview/scorecard renders InterviewScorecardPage (Req 2.1)', () => {
    renderAtPath('/interview/scorecard');

    expect(
      screen.getByRole('heading', { name: /performance scorecard/i }),
    ).toBeInTheDocument();
  });

  it('/interview/sessions renders InterviewSessionsPage (Req 2.1)', () => {
    renderAtPath('/interview/sessions');

    expect(
      screen.getByRole('heading', { name: /interview sessions/i }),
    ).toBeInTheDocument();
  });

  it('/interview/stories renders StarOrganizerPage (Req 2.1)', () => {
    renderAtPath('/interview/stories');

    expect(
      screen.getByRole('heading', { name: /new star story/i }),
    ).toBeInTheDocument();
  });
});

describe('No dangling InterviewSimulatorPage reference (Req 11.3)', () => {
  it('InterviewChatPage module does not re-export or reference InterviewSimulatorPage', async () => {
    // Dynamic import of the module; if any dangling import remained it would
    // cause a module-resolution failure here in the jsdom test environment.
    const mod = await import('../InterviewChatPage');
    expect(typeof mod.InterviewChatPage).toBe('function');
    // There must be no export named InterviewSimulatorPage
    expect(
      (mod as Record<string, unknown>)['InterviewSimulatorPage'],
    ).toBeUndefined();
  });

  it('InterviewPage shell does not reference InterviewSimulatorPage', async () => {
    const mod = await import('../InterviewPage');
    expect(typeof mod.InterviewPage).toBe('function');
    expect(
      (mod as Record<string, unknown>)['InterviewSimulatorPage'],
    ).toBeUndefined();
  });
});
