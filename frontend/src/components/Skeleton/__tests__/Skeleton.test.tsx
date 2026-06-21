import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonCard, SkeletonList } from '../../Skeleton';

// ─── SkeletonList — loading region ARIA (Req 14.6) ───────────────────────────

describe('SkeletonList — loading region ARIA', () => {
  it('renders with role="status"', () => {
    render(<SkeletonList label="Loading sessions" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('exposes aria-busy="true"', () => {
    render(<SkeletonList label="Loading sessions" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('exposes the provided aria-label', () => {
    render(<SkeletonList label="Loading sessions" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-label', 'Loading sessions');
  });

  it('forwards a custom aria-label value', () => {
    render(<SkeletonList label="Loading interview results" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading interview results',
    );
  });
});

// ─── SkeletonList — row count (Req 14.6) ─────────────────────────────────────

describe('SkeletonList — row count', () => {
  it('renders 3 rows when rows={3}', () => {
    const { container } = render(<SkeletonList label="Loading" rows={3} />);
    const region = screen.getByRole('status');
    // Each row is a direct child div of the status container
    const rows = within(region).getAllByRole('generic', { hidden: true });
    // Count only the direct children (each row wrapper)
    const directChildren = Array.from(region.children);
    expect(directChildren).toHaveLength(3);
    void rows; // suppress unused warning
  });

  it('renders 4 rows by default (no rows prop)', () => {
    const { container } = render(<SkeletonList label="Loading" />);
    const region = screen.getByRole('status');
    const directChildren = Array.from(region.children);
    expect(directChildren).toHaveLength(4);
    void container;
  });

  it('renders 1 row when rows={1}', () => {
    render(<SkeletonList label="Loading" rows={1} />);
    const region = screen.getByRole('status');
    expect(Array.from(region.children)).toHaveLength(1);
  });
});

// ─── Skeleton (single block) — decorative / aria-hidden (Req 14.7) ───────────

describe('Skeleton — single shimmer block', () => {
  it('is aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('contains no focusable elements', () => {
    const { container } = render(<Skeleton />);
    const focusable = container.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

// ─── SkeletonText — aria-hidden + focusable-free (Req 14.7) ──────────────────

describe('SkeletonText — decorative lines', () => {
  it('all shimmer lines are aria-hidden', () => {
    const { container } = render(<SkeletonText lines={2} />);
    // Every [aria-hidden] descendant is present; none should be missing
    const visibleInteractive = container.querySelectorAll(
      '[aria-hidden="false"], [aria-hidden=""]',
    );
    expect(visibleInteractive).toHaveLength(0);
    const hiddenShimmers = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenShimmers.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the requested number of lines when lines={2}', () => {
    const { container } = render(<SkeletonText lines={2} />);
    // Each Skeleton block is a div with aria-hidden; count them
    const shimmers = container.querySelectorAll('[aria-hidden="true"]');
    expect(shimmers).toHaveLength(2);
  });

  it('contains no focusable elements', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const focusable = container.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

// ─── SkeletonCard — renders without errors (Req 14.7) ────────────────────────

describe('SkeletonCard', () => {
  it('renders without throwing', () => {
    expect(() => render(<SkeletonCard />)).not.toThrow();
  });

  it('is aria-hidden (purely decorative)', () => {
    const { container } = render(<SkeletonCard />);
    const cardRoot = container.firstElementChild as HTMLElement;
    expect(cardRoot).toHaveAttribute('aria-hidden', 'true');
  });

  it('contains no focusable elements', () => {
    const { container } = render(<SkeletonCard />);
    const focusable = container.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });
});

// ─── SkeletonList — inner shimmer shapes are aria-hidden (Req 14.7) ──────────

describe('SkeletonList — shimmer shapes inside are aria-hidden', () => {
  it('exposes no focusable element inside the loading region', () => {
    render(<SkeletonList label="Loading" rows={2} />);
    const region = screen.getByRole('status');
    const focusable = region.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable).toHaveLength(0);
  });

  it('shimmer shape blocks (animate-pulse) inside the region carry aria-hidden', () => {
    render(<SkeletonList label="Loading" rows={2} />);
    const region = screen.getByRole('status');
    // The individual Skeleton blocks are the shimmer shapes; they must be aria-hidden.
    // SkeletonList rows render: row-wrapper[aria-hidden] > avatar Skeleton + text-col > 2× Skeleton
    // So with rows=2 we expect 2 row wrappers + (2+2)×2=8 Skeleton blocks = 10 aria-hidden divs in total.
    const hiddenDivs = region.querySelectorAll('[aria-hidden="true"]');
    // At minimum every Skeleton shimmer block is aria-hidden
    expect(hiddenDivs.length).toBeGreaterThanOrEqual(4); // 2 rows × 2 shimmers each (min)
    // None of the aria-hidden elements should contain focusable children
    hiddenDivs.forEach((el) => {
      const focusable = el.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      expect(focusable).toHaveLength(0);
    });
  });
});
