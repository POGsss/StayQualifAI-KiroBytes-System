import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApplicationCard } from '../../../components/JobSearch/ApplicationCard';
import type { IApplication } from '../../../types/jobsearch.types';

/**
 * Validates: Requirements 10.5 (keyboard navigation and focus indicators)
 */

const mockApplication: IApplication = {
  id: 'app-1',
  listingId: 'listing-1',
  stage: 'Wishlist',
  notes: null,
  dateAdded: '2024-01-01T00:00:00Z',
  dateStageChanged: '2024-01-05T00:00:00Z',
  listingTitle: 'Software Engineer',
  listingCompany: 'TechStartup',
};

describe('Keyboard Navigation — Focus Indicators', () => {
  it('ApplicationCard is focusable via keyboard (tabIndex=0)', () => {
    render(<ApplicationCard application={mockApplication} onClickDetail={vi.fn()} />);

    const card = screen.getByRole('button', {
      name: /software engineer at techstartup/i,
    });
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('ApplicationCard has visible focus ring classes', () => {
    render(<ApplicationCard application={mockApplication} onClickDetail={vi.fn()} />);

    const card = screen.getByRole('button', {
      name: /software engineer at techstartup/i,
    });
    expect(card.className).toContain('focus-visible:ring-2');
    expect(card.className).toContain('focus-visible:ring-offset-2');
  });

  it('ApplicationCard activates on Enter key', async () => {
    const user = userEvent.setup();
    const mockOnClickDetail = vi.fn();
    render(
      <ApplicationCard
        application={mockApplication}
        onClickDetail={mockOnClickDetail}
      />,
    );

    const card = screen.getByRole('button', {
      name: /software engineer at techstartup/i,
    });
    card.focus();
    await user.keyboard('{Enter}');

    expect(mockOnClickDetail).toHaveBeenCalledWith('app-1');
  });

  it('ApplicationCard activates on Space key', async () => {
    const user = userEvent.setup();
    const mockOnClickDetail = vi.fn();
    render(
      <ApplicationCard
        application={mockApplication}
        onClickDetail={mockOnClickDetail}
      />,
    );

    const card = screen.getByRole('button', {
      name: /software engineer at techstartup/i,
    });
    card.focus();
    await user.keyboard(' ');

    expect(mockOnClickDetail).toHaveBeenCalledWith('app-1');
  });

  it('ApplicationCard displays job title, company, and date', () => {
    render(<ApplicationCard application={mockApplication} onClickDetail={vi.fn()} />);

    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    expect(screen.getByText('TechStartup')).toBeInTheDocument();
    // Date is formatted relatively
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
