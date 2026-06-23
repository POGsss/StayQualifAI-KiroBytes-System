/**
 * Tests for StarOrganizerPage
 *
 * Covers (task 10.6):
 *  - Two clearly separated sections: create form + saved stories (Req 13.4)
 *  - SkeletonList / loading indicator (role="status" + aria-busy) while loading (Req 14.3)
 *  - Content replaces loading indicator when stories are present
 *  - Empty state when stories list is empty and not loading (Req 13.6)
 *  - Error banner shown while prior content is preserved (Req 14.5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mock the interview store ─────────────────────────────────────────────────
vi.mock('../../../stores/interview.store');
import { useInterviewStore } from '../../../stores/interview.store';
import type { IStarStory } from '../../../types/interview.types';
import type { IStoreError } from '../../../stores/interview.store';
import { StarOrganizerPage } from '../StarOrganizerPage';

// ─── Store state type for test helpers ───────────────────────────────────────
interface MockStoreState {
  stories: IStarStory[];
  isLoading: boolean;
  error: IStoreError | null;
  loadStories: ReturnType<typeof vi.fn>;
  createStory: ReturnType<typeof vi.fn>;
  updateStory: ReturnType<typeof vi.fn>;
  deleteStory: ReturnType<typeof vi.fn>;
  getStory: ReturnType<typeof vi.fn>;
}

function setupMockStore(overrides: Partial<MockStoreState> = {}): void {
  const base: MockStoreState = {
    stories: [],
    isLoading: false,
    error: null,
    loadStories: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    deleteStory: vi.fn(),
    getStory: vi.fn(),
  };
  const state = { ...base, ...overrides };
  (useInterviewStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  );
}

// ─── Fixture ──────────────────────────────────────────────────────────────────
const mockStory: IStarStory = {
  id: 'story-1',
  title: 'Led migration to microservices',
  situation: 'The monolith was causing deployment bottlenecks.',
  task: 'Lead the architecture migration.',
  action: 'Designed the new service boundaries.',
  result: 'Reduced deploy time by 60%.',
  createdAt: new Date().toISOString(),
};

const mockStory2: IStarStory = {
  id: 'story-2',
  title: 'Improved test coverage',
  situation: 'Test coverage was below 30%.',
  task: 'Raise coverage to 80%.',
  action: 'Introduced property-based tests.',
  result: 'Coverage reached 85%.',
  createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// 1. Two clearly separated sections (Req 13.4)
describe('StarOrganizerPage — two sections (Req 13.4)', () => {
  it('renders the "New STAR story" create form section', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    // The create form has an accessible heading
    expect(
      screen.getByRole('heading', { name: /new star story/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Your stories" saved-stories list section', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    expect(
      screen.getByRole('heading', { name: /your stories/i }),
    ).toBeInTheDocument();
  });

  it('renders the create form with a submit button', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    expect(
      screen.getByRole('button', { name: /save story/i }),
    ).toBeInTheDocument();
  });

  it('renders the create form with all required STAR text inputs', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    // Title field
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    // The four STAR textarea fields
    expect(screen.getByLabelText(/situation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/task/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/action/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/result/i)).toBeInTheDocument();
  });

  it('the create form and the stories list are distinct elements on the page', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    const createFormHeading = screen.getByRole('heading', {
      name: /new star story/i,
    });
    const storiesHeading = screen.getByRole('heading', {
      name: /your stories/i,
    });

    // Both headings exist and are different DOM nodes
    expect(createFormHeading).toBeInTheDocument();
    expect(storiesHeading).toBeInTheDocument();
    expect(createFormHeading).not.toBe(storiesHeading);
  });
});

// 2. Loading state — role="status" + aria-busy (Req 14.3)
describe('StarOrganizerPage — loading state (Req 14.3)', () => {
  it('renders a role="status" element when isLoading is true and stories are empty', () => {
    setupMockStore({ stories: [], isLoading: true, error: null });
    render(<StarOrganizerPage />);

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
  });

  it('the loading indicator exposes a loading aria-label', () => {
    setupMockStore({ stories: [], isLoading: true, error: null });
    render(<StarOrganizerPage />);

    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveAttribute('aria-label');
    expect(statusEl.getAttribute('aria-label')).toMatch(/loading/i);
  });
});

// 3. Content replaces loading indicator when data arrives
describe('StarOrganizerPage — content after loading', () => {
  it('does not show a loading indicator when not loading and stories are present', () => {
    setupMockStore({
      stories: [mockStory],
      isLoading: false,
      error: null,
    });
    render(<StarOrganizerPage />);

    const statusEls = screen.queryAllByRole('status');
    const loadingEl = statusEls.find((el) =>
      el.textContent?.match(/loading/i),
    );
    expect(loadingEl).toBeUndefined();
  });

  it('renders the story title when stories are loaded', () => {
    setupMockStore({
      stories: [mockStory],
      isLoading: false,
      error: null,
    });
    render(<StarOrganizerPage />);

    expect(
      screen.getByText('Led migration to microservices'),
    ).toBeInTheDocument();
  });

  it('renders a View button for each loaded story', () => {
    setupMockStore({
      stories: [mockStory, mockStory2],
      isLoading: false,
      error: null,
    });
    render(<StarOrganizerPage />);

    const viewButtons = screen.getAllByRole('button', { name: /view/i });
    expect(viewButtons).toHaveLength(2);
  });
});

// 4. Empty state (Req 13.6)
describe('StarOrganizerPage — empty state (Req 13.6)', () => {
  it('shows a "no stories" message when the list is empty and not loading', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    // The page renders a status element describing the empty state
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl.textContent).toMatch(/no star stories yet/i);
  });

  it('does not render any View or Edit buttons when no stories exist', () => {
    setupMockStore({ stories: [], isLoading: false, error: null });
    render(<StarOrganizerPage />);

    expect(screen.queryByRole('button', { name: /^view$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });
});

// 5. Error with prior content preserved (Req 14.5)
describe('StarOrganizerPage — error preserves prior content (Req 14.5)', () => {
  it('shows the error message via role="alert" when error is set', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Failed to load STAR stories',
    };
    setupMockStore({ stories: [mockStory], isLoading: false, error });
    render(<StarOrganizerPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('Failed to load STAR stories');
  });

  it('keeps previously loaded story titles visible when an error occurs', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Refresh failed',
    };
    setupMockStore({ stories: [mockStory, mockStory2], isLoading: false, error });
    render(<StarOrganizerPage />);

    // Prior stories still visible
    expect(
      screen.getByText('Led migration to microservices'),
    ).toBeInTheDocument();
    expect(screen.getByText('Improved test coverage')).toBeInTheDocument();

    // Error alert is also visible simultaneously
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('Refresh failed');
  });

  it('shows the error alert without story rows when no prior stories exist', () => {
    const error: IStoreError = {
      type: 'network_error',
      message: 'Could not fetch stories',
    };
    setupMockStore({ stories: [], isLoading: false, error });
    render(<StarOrganizerPage />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^view$/i })).toBeNull();
  });
});
