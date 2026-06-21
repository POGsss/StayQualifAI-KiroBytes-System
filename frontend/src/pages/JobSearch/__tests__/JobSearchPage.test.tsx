import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { JobSearchPage } from '../JobSearchPage';

/**
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

// Mock the Zustand store
const mockSetActiveTab = vi.fn();
let mockActiveTab = 'listings';

vi.mock('../../../stores/jobsearch.store', () => ({
  useJobSearchStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeTab: mockActiveTab,
      setActiveTab: mockSetActiveTab,
      // ListingsTab needs
      listings: [],
      listingsMeta: null,
      filters: {},
      status: 'idle',
      error: null,
      fetchListings: vi.fn(),
      setFilters: vi.fn(),
      setPage: vi.fn(),
      // TrackerTab needs
      applications: [],
      fetchApplications: vi.fn(),
      updateStage: vi.fn(),
      fetchApplicationDetail: vi.fn(),
      selectedApplication: null,
      deleteApplication: vi.fn(),
      updateNotes: vi.fn(),
      // AiWriterTab needs
      generatedContent: null,
      generateContent: vi.fn(),
    }),
}));

describe('JobSearchPage — Tab Navigation', () => {
  beforeEach(() => {
    mockActiveTab = 'listings';
    mockSetActiveTab.mockClear();
  });

  it('renders all three tabs (Listings, Tracker, AI Writer)', () => {
    render(<JobSearchPage />);

    expect(screen.getByRole('tab', { name: /listings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /tracker/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ai writer/i })).toBeInTheDocument();
  });

  it('displays Listings tab as active by default', () => {
    render(<JobSearchPage />);

    const listingsTab = screen.getByRole('tab', { name: /listings/i });
    expect(listingsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('active tab has primary border class (visual indicator)', () => {
    render(<JobSearchPage />);

    const listingsTab = screen.getByRole('tab', { name: /listings/i });
    expect(listingsTab.className).toContain('border-primary');
  });

  it('inactive tabs do not have primary border', () => {
    render(<JobSearchPage />);

    const trackerTab = screen.getByRole('tab', { name: /tracker/i });
    expect(trackerTab.className).toContain('border-transparent');
  });

  it('clicking a tab calls setActiveTab with the correct tab id', async () => {
    const user = userEvent.setup();
    render(<JobSearchPage />);

    await user.click(screen.getByRole('tab', { name: /tracker/i }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('tracker');
  });

  it('only the active tab panel is visible', () => {
    render(<JobSearchPage />);

    const listingsPanel = screen.getByRole('tabpanel', { name: /listings/i });
    expect(listingsPanel).not.toHaveAttribute('hidden');

    // Other panels should be hidden (not rendered since activeTab != their id)
    const trackerPanel = document.getElementById('tabpanel-tracker');
    expect(trackerPanel).toHaveAttribute('hidden');
  });

  it('tabs are keyboard-navigable with ArrowRight', async () => {
    const user = userEvent.setup();
    render(<JobSearchPage />);

    const listingsTab = screen.getByRole('tab', { name: /listings/i });
    listingsTab.focus();

    await user.keyboard('{ArrowRight}');
    expect(mockSetActiveTab).toHaveBeenCalledWith('tracker');
  });

  it('tabs are keyboard-navigable with ArrowLeft (wraps around)', async () => {
    const user = userEvent.setup();
    render(<JobSearchPage />);

    const listingsTab = screen.getByRole('tab', { name: /listings/i });
    listingsTab.focus();

    await user.keyboard('{ArrowLeft}');
    expect(mockSetActiveTab).toHaveBeenCalledWith('ai-writer');
  });

  it('tab buttons have visible focus indicator classes', () => {
    render(<JobSearchPage />);

    const listingsTab = screen.getByRole('tab', { name: /listings/i });
    expect(listingsTab.className).toContain('focus-visible:ring-2');
  });

  it('uses correct ARIA roles (tablist, tab, tabpanel)', () => {
    render(<JobSearchPage />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    // Only one visible panel
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });
});
