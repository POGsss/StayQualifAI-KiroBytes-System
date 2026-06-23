/**
 * Tests for InterviewSessionsPage (two-pane card layout).
 *
 * Covers:
 *  - Empty state (no sessions, not loading)
 *  - Loading skeleton (Req 14.1): role="status" while isLoading
 *  - Content replaces skeleton when loaded
 *  - Newest-first ordering (Req 13.2)
 *  - Session entry details: state, difficultyTier, createdAt (Req 13.2)
 *  - Overall score shown when present (Req 13.2)
 *  - Selecting a session opens it
 *  - Error with prior content preserved (Req 14.5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { JSX } from 'react';

// ─── Mock TierBadge to avoid complex rendering ───────────────────────────────
vi.mock('../../../components/TierBadge', () => ({
  TierBadge: ({ tier }: { tier: string }): JSX.Element => (
    <span data-testid="tier-badge">{tier}</span>
  ),
}));

// ─── Mock the interview store ─────────────────────────────────────────────────
vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';
import type { IInterviewSessionSummary } from '../../../types/interview.types';
import type { IStoreError } from '../../../stores/interview.store';
import { InterviewSessionsPage } from '../InterviewSessionsPage';

// ─── Store state type used for test helpers ────────────────────────────────────
interface MockStoreState {
  sessions: IInterviewSessionSummary[];
  activeSession: null;
  scorecard: null;
  isLoading: boolean;
  error: IStoreError | null;
  loadSessions: ReturnType<typeof vi.fn>;
  openSession: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  computeScorecard: ReturnType<typeof vi.fn>;
}

let mockOpenSession: ReturnType<typeof vi.fn>;

function setupMockStore(overrides: Partial<MockStoreState>): void {
  mockOpenSession = vi.fn();
  const baseState: MockStoreState = {
    sessions: [],
    activeSession: null,
    scorecard: null,
    isLoading: false,
    error: null,
    loadSessions: vi.fn(),
    openSession: mockOpenSession,
    startSession: vi.fn(),
    deleteSession: vi.fn(() => Promise.resolve(true)),
    computeScorecard: vi.fn(),
  };
  const state = { ...baseState, ...overrides, openSession: mockOpenSession };
  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <InterviewSessionsPage />
    </MemoryRouter>,
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSessions: IInterviewSessionSummary[] = [
  {
    id: 'session-1',
    state: 'SCORED',
    difficultyTier: 'MID',
    createdAt: '2024-01-02T00:00:00Z', // newer
    overallScore: 85,
    passFailTier: 'PASS',
  },
  {
    id: 'session-2',
    state: 'COMPLETED',
    difficultyTier: 'ENTRY',
    createdAt: '2024-01-01T00:00:00Z', // older
    overallScore: null,
    passFailTier: null,
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// 1. Empty state
describe('InterviewSessionsPage — empty state', () => {
  it('shows "no sessions" message when sessions list is empty and not loading', () => {
    setupMockStore({ sessions: [], isLoading: false, error: null });
    renderPage();

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl.textContent).toMatch(/no interview sessions yet/i);
  });

  it('does not render any session entries when the list is empty', () => {
    setupMockStore({ sessions: [], isLoading: false, error: null });
    renderPage();

    expect(screen.queryByRole('button', { name: /view detail/i })).toBeNull();
  });
});

// 2. Skeleton while loading (Req 14.1)
describe('InterviewSessionsPage — loading state (Req 14.1)', () => {
  it('renders a role="status" element while isLoading is true', () => {
    setupMockStore({ sessions: [], isLoading: true, error: null });
    renderPage();

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
  });

  it('exposes an accessible loading label while isLoading is true', () => {
    setupMockStore({ sessions: [], isLoading: true, error: null });
    renderPage();

    expect(
      screen.getByRole('status', { name: /loading interview sessions/i }),
    ).toBeInTheDocument();
  });
});

// 3. Content replaces skeleton when loaded
describe('InterviewSessionsPage — content after loading', () => {
  it('does not show a loading status element when isLoading is false and sessions exist', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    const statusEls = screen.queryAllByRole('status');
    const loadingEl = statusEls.find((el) => el.getAttribute('aria-busy') === 'true');
    expect(loadingEl).toBeUndefined();
  });

  it('renders a "View detail" button for each session when present', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    const viewButtons = screen.getAllByRole('button', { name: /view detail/i });
    expect(viewButtons).toHaveLength(mockSessions.length);
  });
});

// 4. Newest-first ordering (Req 13.2)
describe('InterviewSessionsPage — newest-first ordering (Req 13.2)', () => {
  it('renders the most recently created session first', () => {
    const reversedSessions: IInterviewSessionSummary[] = [
      mockSessions[1]!, // older: 2024-01-01
      mockSessions[0]!, // newer: 2024-01-02
    ];
    setupMockStore({ sessions: reversedSessions, isLoading: false, error: null });
    renderPage();

    const items = screen.getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('MID'); // newer first
  });

  it('renders the older session after the newer one', () => {
    const reversedSessions: IInterviewSessionSummary[] = [
      mockSessions[1]!,
      mockSessions[0]!,
    ];
    setupMockStore({ sessions: reversedSessions, isLoading: false, error: null });
    renderPage();

    const items = screen.getAllByRole('listitem');
    expect(items[1]!.textContent).toContain('ENTRY'); // older second
  });
});

// 5. Session entry details (Req 13.2): state, tier, date
describe('InterviewSessionsPage — session entry details (Req 13.2)', () => {
  it('shows the lifecycle state for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    expect(screen.getByText('SCORED')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('shows the difficulty tier for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    expect(screen.getByText('MID')).toBeInTheDocument();
    expect(screen.getByText('ENTRY')).toBeInTheDocument();
  });

  it('shows the creation date for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    const items = screen.getAllByRole('listitem');
    const hasYear = items.some((el) => (el.textContent ?? '').includes('2024'));
    expect(hasYear).toBe(true);
  });
});

// 6. Score shown when present (Req 13.2)
describe('InterviewSessionsPage — score field when present (Req 13.2)', () => {
  it('shows the overall score when a session has overallScore', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('shows a not-scored hint when overallScore is null', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    expect(screen.getByText(/not scored yet/i)).toBeInTheDocument();
  });
});

// 7. Selecting a session opens it
describe('InterviewSessionsPage — selecting a session', () => {
  it('calls openSession when "View detail" is clicked', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    renderPage();

    const viewButtons = screen.getAllByRole('button', { name: /view detail/i });
    fireEvent.click(viewButtons[0]!);
    expect(mockOpenSession).toHaveBeenCalledTimes(1);
  });
});

// 8. Error with prior content preserved (Req 14.5)
describe('InterviewSessionsPage — error preserves prior content (Req 14.5)', () => {
  it('shows the error message when error is set', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Failed to load sessions',
    };
    setupMockStore({ sessions: mockSessions, isLoading: false, error });
    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('Failed to load sessions');
  });

  it('keeps the previously loaded session list visible when an error occurs', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Failed to load sessions',
    };
    setupMockStore({ sessions: mockSessions, isLoading: false, error });
    renderPage();

    expect(screen.getByText('SCORED')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
