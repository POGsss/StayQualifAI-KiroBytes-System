import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { JobSearchPage } from '../JobSearchPage';

/**
 * JobSearchPage content rendering.
 *
 * The feature tab navigation (Listings / Tracker / AI Writer) now lives in the
 * global top bar (see `App.tsx`), which reads/writes the active tab via the
 * shared Zustand store. This page is therefore only responsible for rendering
 * the content of whichever tab is active. These tests verify that mapping; the
 * tab controls themselves are covered alongside the top bar.
 */

// Mock the Zustand store — only the active tab matters now that the tab
// children are stubbed below.
let mockActiveTab = 'listings';
const mockSetActiveTab = vi.fn();

vi.mock('../../../stores/jobsearch.store', () => ({
  useJobSearchStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeTab: mockActiveTab, setActiveTab: mockSetActiveTab }),
}));

// Stub the three tab content components so we can assert which one renders.
vi.mock('../ListingsTab', () => ({
  ListingsTab: () => <div data-testid="listings-tab" />,
}));
vi.mock('../TrackerTab', () => ({
  TrackerTab: () => <div data-testid="tracker-tab" />,
}));
vi.mock('../AiWriterTab', () => ({
  AiWriterTab: () => <div data-testid="ai-writer-tab" />,
}));

describe('JobSearchPage — active tab content', () => {
  beforeEach(() => {
    mockActiveTab = 'listings';
    mockSetActiveTab.mockClear();
  });

  it('renders the Listings content by default', () => {
    render(<JobSearchPage />);

    expect(screen.getByTestId('listings-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('tracker-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-writer-tab')).not.toBeInTheDocument();
  });

  it('renders the Tracker content when the tracker tab is active', () => {
    mockActiveTab = 'tracker';
    render(<JobSearchPage />);

    expect(screen.getByTestId('tracker-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('listings-tab')).not.toBeInTheDocument();
  });

  it('renders the AI Writer content when the ai-writer tab is active', () => {
    mockActiveTab = 'ai-writer';
    render(<JobSearchPage />);

    expect(screen.getByTestId('ai-writer-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('listings-tab')).not.toBeInTheDocument();
  });
});
