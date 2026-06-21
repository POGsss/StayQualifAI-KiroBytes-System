/**
 * Tests for InterviewSessionsPage
 *
 * Covers:
 *  - Empty state (no sessions, not loading)
 *  - Loading skeleton (Req 14.1): role="status" while isLoading
 *  - Content replaces skeleton when loaded
 *  - Newest-first ordering (Req 13.2)
 *  - Session entry details: state, difficultyTier, createdAt (Req 13.2)
 *  - Scorecard fields shown when present: overallScore + passFailTier (Req 13.2)
 *  - Error with prior content preserved (Req 14.5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  isLoading: boolean;
  error: IStoreError | null;
  loadSessions: ReturnType<typeof vi.fn>;
  openSession: ReturnType<typeof vi.fn>;
}

function setupMockStore(overrides: Partial<MockStoreState>): void {
  const baseState: MockStoreState = {
    sessions: [],
    activeSession: null,
    isLoading: false,
    error: null,
    loadSessions: vi.fn(),
    openSession: vi.fn(),
  };
  const state = { ...baseState, ...overrides };
  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
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
    render(<InterviewSessionsPage />);

    // The page renders a status message explaining there are no sessions yet
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl.textContent).toMatch(/no interview sessions yet/i);
  });

  it('does not render any session rows when the list is empty', () => {
    setupMockStore({ sessions: [], isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // No "View detail" buttons should exist
    expect(screen.queryByRole('button', { name: /view detail/i })).toBeNull();
  });
});

// 2. Skeleton while loading (Req 14.1)
describe('InterviewSessionsPage — loading state (Req 14.1)', () => {
  it('renders a role="status" element while isLoading is true', () => {
    setupMockStore({ sessions: [], isLoading: true, error: null });
    render(<InterviewSessionsPage />);

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
  });

  it('shows loading text content while isLoading is true', () => {
    setupMockStore({ sessions: [], isLoading: true, error: null });
    render(<InterviewSessionsPage />);

    const statusEl = screen.getByRole('status');
    expect(statusEl.textContent).toMatch(/loading/i);
  });
});

// 3. Content replaces skeleton when loaded
describe('InterviewSessionsPage — content after loading', () => {
  it('does not show the loading status element when isLoading is false and sessions exist', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // The only role="status" should not contain "Loading" text
    const statusEls = screen.queryAllByRole('status');
    const loadingEl = statusEls.find((el) =>
      el.textContent?.match(/loading/i),
    );
    expect(loadingEl).toBeUndefined();
  });

  it('renders session rows when sessions are present and not loading', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    const viewButtons = screen.getAllByRole('button', { name: /view detail/i });
    expect(viewButtons).toHaveLength(mockSessions.length);
  });
});

// 4. Newest-first ordering (Req 13.2)
describe('InterviewSessionsPage — newest-first ordering (Req 13.2)', () => {
  it('renders the most recently created session first', () => {
    // Provide sessions in reverse order (older first) to verify sorting
    const reversedSessions: IInterviewSessionSummary[] = [
      mockSessions[1], // older: 2024-01-01
      mockSessions[0], // newer: 2024-01-02
    ];
    setupMockStore({ sessions: reversedSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // Get all table rows (excluding header)
    const rows = screen.getAllByRole('row');
    // rows[0] is the header; rows[1] is the first data row
    const firstDataRow = rows[1];
    // The first data row should contain the MID tier (newer session)
    expect(firstDataRow.textContent).toContain('MID');
  });

  it('renders the older session after the newer one', () => {
    const reversedSessions: IInterviewSessionSummary[] = [
      mockSessions[1], // older
      mockSessions[0], // newer
    ];
    setupMockStore({ sessions: reversedSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    const rows = screen.getAllByRole('row');
    // rows[2] is the second data row — should contain ENTRY (older session)
    const secondDataRow = rows[2];
    expect(secondDataRow.textContent).toContain('ENTRY');
  });
});

// 5. Session entry details (Req 13.2): state, tier, date
describe('InterviewSessionsPage — session entry details (Req 13.2)', () => {
  it('shows the lifecycle state for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    expect(screen.getByText('SCORED')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('shows the difficulty tier for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    expect(screen.getByText('MID')).toBeInTheDocument();
    expect(screen.getByText('ENTRY')).toBeInTheDocument();
  });

  it('shows the creation date for each session', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // Dates are formatted via toLocaleString; at minimum the year should appear
    // Both sessions are from 2024
    const cells = screen.getAllByRole('cell');
    const dateTexts = cells.map((c) => c.textContent ?? '');
    const hasSomeDate = dateTexts.some((t) => t.includes('2024'));
    expect(hasSomeDate).toBe(true);
  });
});

// 6. Scorecard shown when present (Req 13.2)
describe('InterviewSessionsPage — scorecard fields when present (Req 13.2)', () => {
  it('shows the overall score when a session has overallScore', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // session-1 has overallScore: 85
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('shows the TierBadge with passFailTier when a session has a scorecard', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // TierBadge is mocked to render a span[data-testid="tier-badge"] with the tier text
    const badges = screen.getAllByTestId('tier-badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges.some((b) => b.textContent === 'PASS')).toBe(true);
  });

  it('shows a dash placeholder when passFailTier is null', () => {
    setupMockStore({ sessions: mockSessions, isLoading: false, error: null });
    render(<InterviewSessionsPage />);

    // session-2 has null passFailTier — the page renders "—"
    const cells = screen.getAllByRole('cell');
    const dashCells = cells.filter((c) => c.textContent === '—');
    expect(dashCells.length).toBeGreaterThanOrEqual(1);
  });
});

// 7. Error with prior content preserved (Req 14.5)
describe('InterviewSessionsPage — error preserves prior content (Req 14.5)', () => {
  it('shows the error message when error is set', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Failed to load sessions',
    };
    setupMockStore({ sessions: mockSessions, isLoading: false, error });
    render(<InterviewSessionsPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('Failed to load sessions');
  });

  it('keeps the previously loaded session list visible when an error occurs', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Failed to load sessions',
    };
    // Simulate error while prior sessions remain in the store
    setupMockStore({ sessions: mockSessions, isLoading: false, error });
    render(<InterviewSessionsPage />);

    // Prior sessions should still be visible
    expect(screen.getByText('SCORED')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();

    // Error message is also visible simultaneously
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
