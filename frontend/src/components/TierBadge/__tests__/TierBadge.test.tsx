import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../TierBadge';

/**
 * Example-based render tests for the TierBadge presentational component.
 *
 * Validates: Requirements 5.7
 */
describe('TierBadge', () => {
  it('renders the visible PASS word and an accessible pass label', () => {
    render(<TierBadge tier="PASS" />);

    // Visible text signal (color is never the only signal).
    expect(screen.getByText('PASS')).toBeInTheDocument();
    // Accessible label exposed to assistive technology.
    expect(screen.getByLabelText('Result: pass')).toBeInTheDocument();
  });

  it('renders the visible FAIL word and an accessible fail label', () => {
    render(<TierBadge tier="FAIL" />);

    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByLabelText('Result: fail')).toBeInTheDocument();
  });

  it('does not expose the failing label when the tier is PASS', () => {
    render(<TierBadge tier="PASS" />);

    expect(screen.queryByLabelText('Result: fail')).not.toBeInTheDocument();
    expect(screen.queryByText('FAIL')).not.toBeInTheDocument();
  });

  it('does not expose the passing label when the tier is FAIL', () => {
    render(<TierBadge tier="FAIL" />);

    expect(screen.queryByLabelText('Result: pass')).not.toBeInTheDocument();
    expect(screen.queryByText('PASS')).not.toBeInTheDocument();
  });
});
