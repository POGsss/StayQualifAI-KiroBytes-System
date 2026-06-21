/**
 * Tests for InterviewScorecardPage
 *
 * Validates: Requirements 13.3, 14.2, 14.4, 14.5
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the store BEFORE importing the component
vi.mock('../../../stores/interview.store', () => ({
  useInterviewStore: vi.fn(),
}));

// Mock ScoreDial and TierBadge to avoid complex SVG rendering
vi.mock('../../../components/ScoreDial', () => ({
  ScoreDial: ({ score, label }: { score: number; label: string }) => (
    <div data-testid="score-dial">
      {label}: {score}
    </div>
  ),
}));

vi.mock('../../../components/TierBadge', () => ({
  TierBadge: ({ tier }: { tier: string }) => (
    <div data-testid="tier-badge">{tier}</div>
  ),
}));

// Mock Skeleton so it renders with its role="status" wrapper
vi.mock('../../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card">Loading…</div>,
  SkeletonList: ({ label }: { label?: string }) => (
    <div role="status" aria-busy="true" aria-label={label ?? 'Loading'}>
      Loading list…
    </div>
  ),
}));

import { useInterviewStore } from '../../../stores/interview.store';
import { InterviewScorecardPage } from '../InterviewScorecardPage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

type MockStoreState = {
  activeSession: null | { id: string; state: string; difficultyTier: string; questionCount: number };
  sessions: unknown[];
  scorecard: typeof mockScorecard | null;
  isLoading: boolean;
  error: null | { message: string };
  loadSessions: ReturnType<typeof vi.fn>;
  openSession: ReturnType<typeof vi.fn>;
  computeScorecard: ReturnType<typeof vi.fn>;
  loadScorecard: ReturnType<typeof vi.fn>;
};

function setupStore(overrides: Partial<MockStoreState> = {}): void {
  const state: MockStoreState = {
    activeSession: null,
    sessions: [],
    scorecard: null,
    isLoading: false,
    error: null,
    loadSessions: vi.fn(),
    openSession: vi.fn(),
    computeScorecard: vi.fn(),
    loadScorecard: vi.fn(),
    ...overrides,
  };

  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: MockStoreState) => unknown) => selector(state),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InterviewScorecardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Empty state (Req 13.6) ────────────────────────────────────────────
  it('shows "no scorecard yet" message when not loading and no scorecard is present', () => {
    setupStore({ isLoading: false, scorecard: null, activeSession: null });

    render(<InterviewScorecardPage />);

    // The page must show an informative empty-state message
    expect(
      screen.getByText(/no scorecard yet/i),
    ).toBeInTheDocument();
  });

  // ── 2. Skeleton while loading (Req 14.2, 14.4) ───────────────────────────
  it('shows a role="status" skeleton when isLoading is true and no scorecard is present', () => {
    setupStore({ isLoading: true, scorecard: null, activeSession: null });

    render(<InterviewScorecardPage />);

    // The Results panel wraps the skeleton in a role="status" container
    const statusRegion = screen.getByRole('status', { name: /loading scorecard/i });
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion).toHaveAttribute('aria-busy', 'true');

    // The skeleton card itself should be visible
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument();
  });

  it('does NOT show the "no scorecard yet" message while loading', () => {
    setupStore({ isLoading: true, scorecard: null, activeSession: null });

    render(<InterviewScorecardPage />);

    expect(screen.queryByText(/no scorecard yet/i)).not.toBeInTheDocument();
  });

  // ── 3. Content replaces skeleton after loading (Req 14.4) ────────────────
  it('shows scorecard content (not skeleton) when loading is false and a scorecard is present', () => {
    setupStore({
      isLoading: false,
      scorecard: mockScorecard,
      activeSession: {
        id: 'session-1',
        state: 'SCORED',
        difficultyTier: 'ENTRY',
        questionCount: 5,
      },
    });

    render(<InterviewScorecardPage />);

    // Skeleton must NOT be present
    expect(
      screen.queryByRole('status', { name: /loading scorecard/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-card')).not.toBeInTheDocument();

    // Scorecard content must be present
    expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    expect(screen.getAllByTestId('score-dial').length).toBeGreaterThan(0);
  });

  // ── 4. Error with prior content preserved (Req 14.5) ────────────────────
  it('shows the error banner AND preserves prior scorecard content when an error occurs', () => {
    setupStore({
      isLoading: false,
      scorecard: mockScorecard,
      activeSession: {
        id: 'session-1',
        state: 'SCORED',
        difficultyTier: 'ENTRY',
        questionCount: 5,
      },
      error: { message: 'Failed to refresh scorecard' },
    });

    render(<InterviewScorecardPage />);

    // Error banner visible
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/failed to refresh scorecard/i)).toBeInTheDocument();

    // Prior scorecard content still present
    expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    expect(screen.getAllByTestId('score-dial').length).toBeGreaterThan(0);
  });

  it('shows the error banner alone (no scorecard) when error occurs with no prior scorecard', () => {
    setupStore({
      isLoading: false,
      scorecard: null,
      activeSession: null,
      error: { message: 'Network error' },
    });

    render(<InterviewScorecardPage />);

    // Error banner visible
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();

    // No scorecard dials or badges
    expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-dial')).not.toBeInTheDocument();
  });

  // ── 5. ScoreDial / TierBadge arrangement (Req 13.3) ─────────────────────
  it('renders TierBadge and multiple ScoreDial components when a scorecard is present', () => {
    setupStore({
      isLoading: false,
      scorecard: mockScorecard,
      activeSession: {
        id: 'session-1',
        state: 'SCORED',
        difficultyTier: 'ENTRY',
        questionCount: 5,
      },
    });

    render(<InterviewScorecardPage />);

    // TierBadge for pass/fail
    const tierBadge = screen.getByTestId('tier-badge');
    expect(tierBadge).toBeInTheDocument();
    expect(tierBadge).toHaveTextContent('PASS');

    // ScoreDials: 1 overall + 4 dimensions = 5 total
    const dials = screen.getAllByTestId('score-dial');
    expect(dials.length).toBe(5);

    // Verify each dimension label is present
    expect(screen.getByText(/answer quality/i)).toBeInTheDocument();
    expect(screen.getByText(/grammar/i)).toBeInTheDocument();
    expect(screen.getByText(/latency/i)).toBeInTheDocument();
    expect(screen.getByText(/pressure handling/i)).toBeInTheDocument();
    // "Overall" appears both in the "Overall Score" heading span and inside the dial mock,
    // so use getAllByText and confirm at least one match exists.
    expect(screen.getAllByText(/overall/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the correct score values in each dial', () => {
    setupStore({
      isLoading: false,
      scorecard: mockScorecard,
      activeSession: {
        id: 'session-1',
        state: 'SCORED',
        difficultyTier: 'ENTRY',
        questionCount: 5,
      },
    });

    render(<InterviewScorecardPage />);

    expect(screen.getByText(/overall: 82/i)).toBeInTheDocument();
    expect(screen.getByText(/answer quality: 80/i)).toBeInTheDocument();
    expect(screen.getByText(/grammar: 75/i)).toBeInTheDocument();
    expect(screen.getByText(/latency: 90/i)).toBeInTheDocument();
    expect(screen.getByText(/pressure handling: 85/i)).toBeInTheDocument();
  });

  // ── 6. Page structure ────────────────────────────────────────────────────
  it('renders the Results panel heading', () => {
    setupStore({ isLoading: false, scorecard: null, activeSession: null });

    render(<InterviewScorecardPage />);

    expect(
      screen.getByRole('heading', { name: /results/i }),
    ).toBeInTheDocument();
  });

  it('renders the page heading "Performance Scorecard"', () => {
    setupStore({ isLoading: false, scorecard: null, activeSession: null });

    render(<InterviewScorecardPage />);

    expect(
      screen.getByRole('heading', { name: /performance scorecard/i }),
    ).toBeInTheDocument();
  });
});
