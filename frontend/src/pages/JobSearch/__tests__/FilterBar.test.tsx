import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FilterBar } from '../../../components/JobSearch/FilterBar';
import type { IListingFilters } from '../../../types/jobsearch.types';

/**
 * Validates: Requirements 10.2, 10.3 (filter bar interactions)
 */

describe('FilterBar — Filter Interactions', () => {
  const mockOnFilterChange = vi.fn();
  const defaultFilters: IListingFilters = {};

  beforeEach(() => {
    mockOnFilterChange.mockClear();
  });

  it('renders all four filter inputs (work mode, location, keyword, company)', () => {
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByLabelText(/work mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keyword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
  });

  it('work mode select has all options (All Modes, Remote, Hybrid, Onsite)', () => {
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const select = screen.getByLabelText(/work mode/i) as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveTextContent('All Modes');
    expect(options[1]).toHaveTextContent('Remote');
    expect(options[2]).toHaveTextContent('Hybrid');
    expect(options[3]).toHaveTextContent('Onsite');
  });

  it('changing work mode triggers onFilterChange immediately', async () => {
    const user = userEvent.setup();
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const select = screen.getByLabelText(/work mode/i);
    await user.selectOptions(select, 'Remote');

    expect(mockOnFilterChange).toHaveBeenCalledWith({ workMode: 'Remote' });
  });

  it('typing in location field triggers debounced onFilterChange', async () => {
    const user = userEvent.setup();
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const locationInput = screen.getByLabelText(/location/i);
    await user.type(locationInput, 'NY');

    // Wait for the debounce (300ms) to fire
    await waitFor(
      () => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          expect.objectContaining({ location: 'NY' }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('typing in keyword field triggers debounced onFilterChange', async () => {
    const user = userEvent.setup();
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const keywordInput = screen.getByLabelText(/keyword/i);
    await user.type(keywordInput, 'React');

    await waitFor(
      () => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          expect.objectContaining({ keyword: 'React' }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('typing in company field triggers debounced onFilterChange', async () => {
    const user = userEvent.setup();
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const companyInput = screen.getByLabelText(/company/i);
    await user.type(companyInput, 'Go');

    await waitFor(
      () => {
        expect(mockOnFilterChange).toHaveBeenCalledWith(
          expect.objectContaining({ company: 'Go' }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('all inputs have visible focus indicator classes', () => {
    render(<FilterBar filters={defaultFilters} onFilterChange={mockOnFilterChange} />);

    const locationInput = screen.getByLabelText(/location/i);
    expect(locationInput.className).toContain('focus-visible:ring-2');

    const keywordInput = screen.getByLabelText(/keyword/i);
    expect(keywordInput.className).toContain('focus-visible:ring-2');

    const select = screen.getByLabelText(/work mode/i);
    expect(select.className).toContain('focus-visible:ring-2');
  });

  it('reflects external filter values in inputs', () => {
    const filters: IListingFilters = {
      workMode: 'Hybrid',
      location: 'London',
      keyword: 'TypeScript',
      company: 'Meta',
    };

    render(<FilterBar filters={filters} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByLabelText(/work mode/i)).toHaveValue('Hybrid');
    expect(screen.getByLabelText(/location/i)).toHaveValue('London');
    expect(screen.getByLabelText(/keyword/i)).toHaveValue('TypeScript');
    expect(screen.getByLabelText(/company/i)).toHaveValue('Meta');
  });
});
