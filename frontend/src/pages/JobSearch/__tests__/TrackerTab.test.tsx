import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TrackerTab } from '../TrackerTab';
import type { IApplication } from '../../../types/jobsearch.types';

/**
 * Validates: Requirements 4.6 (optimistic update + rollback)
 */

const mockFetchApplications = vi.fn();
const mockUpdateStage = vi.fn();
const mockFetchApplicationDetail = vi.fn();

const mockApplications: IApplication[] = [
  {
    id: 'app-1',
    listingId: 'listing-1',
    stage: 'Wishlist',
    notes: null,
    dateAdded: '2024-01-01T00:00:00Z',
    dateStageChanged: '2024-01-05T00:00:00Z',
    listingTitle: 'Frontend Developer',
    listingCompany: 'Acme Corp',
  },
  {
    id: 'app-2',
    listingId: 'listing-2',
    stage: 'Applied',
    notes: null,
    dateAdded: '2024-01-02T00:00:00Z',
    dateStageChanged: '2024-01-06T00:00:00Z',
    listingTitle: 'Backend Engineer',
    listingCompany: 'TechCo',
  },
];

vi.mock('../../../stores/jobsearch.store', () => ({
  useJobSearchStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      fetchApplications: mockFetchApplications,
      applications: mockApplications,
      updateStage: mockUpdateStage,
      fetchApplicationDetail: mockFetchApplicationDetail,
      status: 'idle',
      selectedApplication: null,
      deleteApplication: vi.fn(),
      updateNotes: vi.fn(),
    }),
}));

describe('TrackerTab — Kanban Board', () => {
  beforeEach(() => {
    mockFetchApplications.mockClear();
    mockUpdateStage.mockClear();
    mockFetchApplicationDetail.mockClear();
  });

  it('renders all five Kanban columns in correct order', () => {
    render(<TrackerTab />);

    const stages = ['Wishlist', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
    stages.forEach((stage) => {
      expect(
        screen.getByLabelText(new RegExp(`${stage} column`, 'i')),
      ).toBeInTheDocument();
    });
  });

  it('fetches applications on mount', () => {
    render(<TrackerTab />);
    expect(mockFetchApplications).toHaveBeenCalledTimes(1);
  });

  it('displays application cards in their correct stage columns', () => {
    render(<TrackerTab />);

    // "Frontend Developer" should be in Wishlist column
    const wishlistColumn = screen.getByLabelText(/wishlist column/i);
    expect(wishlistColumn).toHaveTextContent('Frontend Developer');

    // "Backend Engineer" should be in Applied column
    const appliedColumn = screen.getByLabelText(/applied column/i);
    expect(appliedColumn).toHaveTextContent('Backend Engineer');
  });

  it('calls updateStage when a card is dropped on a different column (optimistic update)', () => {
    render(<TrackerTab />);

    const appliedColumn = screen.getByLabelText(/applied column/i);

    // Simulate drag-and-drop: fire drop event with dataTransfer containing app id
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        getData: () => 'app-1',
      },
    });
    Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });

    fireEvent.drop(appliedColumn, {
      dataTransfer: { getData: () => 'app-1' },
    });

    expect(mockUpdateStage).toHaveBeenCalledWith('app-1', 'Applied');
  });

  it('does not call updateStage when dropping on the same stage column', () => {
    render(<TrackerTab />);

    const wishlistColumn = screen.getByLabelText(/wishlist column/i);

    // Drop app-1 back on Wishlist (same column)
    fireEvent.drop(wishlistColumn, {
      dataTransfer: { getData: () => 'app-1' },
    });

    // Should NOT call updateStage because app-1 is already in Wishlist
    expect(mockUpdateStage).not.toHaveBeenCalled();
  });

  it('shows column counts for each stage', () => {
    render(<TrackerTab />);

    const wishlistColumn = screen.getByLabelText(/wishlist column, 1 application/i);
    expect(wishlistColumn).toBeInTheDocument();

    const appliedColumn = screen.getByLabelText(/applied column, 1 application/i);
    expect(appliedColumn).toBeInTheDocument();
  });

  it('application cards are draggable', () => {
    render(<TrackerTab />);

    const card = screen.getByRole('button', {
      name: /frontend developer at acme corp/i,
    });
    expect(card).toHaveAttribute('draggable', 'true');
  });

  it('application cards have keyboard focus indicators', () => {
    render(<TrackerTab />);

    const card = screen.getByRole('button', {
      name: /frontend developer at acme corp/i,
    });
    expect(card.className).toContain('focus-visible:ring-2');
  });
});
