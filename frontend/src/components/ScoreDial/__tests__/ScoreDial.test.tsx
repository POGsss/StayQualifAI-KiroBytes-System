import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreDial } from '../ScoreDial';

/**
 * Example-based render tests for the ScoreDial presentational component.
 *
 * Validates: Requirements 5.6
 */
describe('ScoreDial', () => {
  it('renders a meter exposing the numeric score via ARIA value attributes', () => {
    render(<ScoreDial score={72} label="Answer quality" />);

    const meter = screen.getByRole('meter', { name: /answer quality/i });
    expect(meter).toBeInTheDocument();
    expect(meter).toHaveAttribute('aria-valuenow', '72');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '72 out of 100');
  });

  it('shows a visible numeric readout of the score', () => {
    render(<ScoreDial score={48} label="Latency" />);

    // The center readout renders the numeric value as visible text.
    expect(screen.getByText('48')).toBeInTheDocument();
  });

  it('uses the provided label as the accessible name', () => {
    render(<ScoreDial score={90} label="Grammar" />);

    expect(screen.getByRole('meter', { name: 'Grammar' })).toBeInTheDocument();
  });

  it('falls back to a default accessible name when no label is provided', () => {
    render(<ScoreDial score={55} />);

    expect(screen.getByRole('meter', { name: /dimension score/i })).toBeInTheDocument();
  });

  it('rounds fractional scores for the displayed value', () => {
    render(<ScoreDial score={72.6} label="Pressure" />);

    const meter = screen.getByRole('meter', { name: /pressure/i });
    expect(meter).toHaveAttribute('aria-valuenow', '73');
    expect(screen.getByText('73')).toBeInTheDocument();
  });

  it('clamps a score above 100 down to 100', () => {
    render(<ScoreDial score={150} label="Overall" />);

    const meter = screen.getByRole('meter', { name: /overall/i });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '100 out of 100');
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('clamps a negative score up to 0', () => {
    render(<ScoreDial score={-10} label="Overall" />);

    const meter = screen.getByRole('meter', { name: /overall/i });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter).toHaveAttribute('aria-valuetext', '0 out of 100');
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('treats NaN as 0', () => {
    render(<ScoreDial score={Number.NaN} label="Overall" />);

    const meter = screen.getByRole('meter', { name: /overall/i });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
