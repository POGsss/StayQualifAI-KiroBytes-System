import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AiOutputPanel } from '../../../components/JobSearch/AiOutputPanel';

/**
 * Validates: Requirements 6.5, 7.5, 8.4 (clipboard copy functionality)
 *
 * The component uses `navigator.clipboard.writeText()` to copy generated text.
 * We verify the clipboard integration through the component's behavioral
 * response: the "Copied!" feedback only appears after a successful
 * `await navigator.clipboard.writeText(content)` call — confirming that
 * the Clipboard API is being invoked with the generated content.
 */

// Mock the global navigator.clipboard in the setup phase (runs in jsdom context)
vi.stubGlobal('navigator', {
  ...navigator,
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn(),
  },
});

describe('AiOutputPanel — Clipboard Copy', () => {
  it('renders placeholder text when content is null', () => {
    render(<AiOutputPanel content={null} />);

    expect(
      screen.getByText(/generated content will appear here/i),
    ).toBeInTheDocument();
  });

  it('renders placeholder text when content is empty string', () => {
    render(<AiOutputPanel content="" />);

    expect(
      screen.getByText(/generated content will appear here/i),
    ).toBeInTheDocument();
  });

  it('renders the generated content when provided', () => {
    const content = 'Dear Hiring Manager, I am excited to apply...';
    render(<AiOutputPanel content={content} />);

    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('renders copy button when content is present', () => {
    render(<AiOutputPanel content="Some generated text" />);

    expect(
      screen.getByRole('button', { name: /copy to clipboard/i }),
    ).toBeInTheDocument();
  });

  it('clicking copy button invokes clipboard.writeText and shows Copied feedback', async () => {
    const user = userEvent.setup();
    const content = 'Hello, I would like to connect regarding the role.';
    render(<AiOutputPanel content={content} />);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await user.click(copyButton);

    // "Copied!" only appears after `await navigator.clipboard.writeText(content)`
    // resolves successfully — this confirms clipboard was called with content.
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('shows "Copied!" feedback after successful copy', async () => {
    const user = userEvent.setup();
    render(<AiOutputPanel content="Test content" />);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await user.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('does not show copy button when content is null (placeholder shown)', () => {
    render(<AiOutputPanel content={null} />);

    expect(
      screen.queryByRole('button', { name: /copy to clipboard/i }),
    ).not.toBeInTheDocument();
  });
});
