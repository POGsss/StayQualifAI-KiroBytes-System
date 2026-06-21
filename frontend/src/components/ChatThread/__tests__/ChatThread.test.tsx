import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatThread } from '../ChatThread';
import { ChatMessage as ChatMessageComponent } from '../ChatMessage';
import type { ChatMessage } from '../../../types/interview.types';

// ─── scrollIntoView mock ───────────────────────────────────────────────────────
// jsdom does not implement scrollIntoView; provide a no-op spy globally.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const assistantMsg: ChatMessage = {
  id: 'q1:assistant',
  role: 'assistant',
  text: 'Tell me about yourself.',
  position: 1,
};

const userMsg: ChatMessage = {
  id: 'q1:user',
  role: 'user',
  text: 'I am a software engineer with 5 years of experience.',
  position: 1,
};

const assistantMsg2: ChatMessage = {
  id: 'q2:assistant',
  role: 'assistant',
  text: 'What is your greatest strength?',
  position: 2,
};

// ─── ChatMessage component tests ──────────────────────────────────────────────

describe('ChatMessage', () => {
  it('renders the message text as visible caption text (Req 10.1)', () => {
    render(<ChatMessageComponent message={assistantMsg} />);
    expect(screen.getByText(assistantMsg.text)).toBeInTheDocument();
  });

  it('renders the user message text as visible caption text (Req 10.1)', () => {
    render(<ChatMessageComponent message={userMsg} />);
    expect(screen.getByText(userMsg.text)).toBeInTheDocument();
  });

  it('renders "AI Interviewer" label for assistant role', () => {
    render(<ChatMessageComponent message={assistantMsg} />);
    expect(screen.getByText('AI Interviewer')).toBeInTheDocument();
  });

  it('renders "You" label for user role', () => {
    render(<ChatMessageComponent message={userMsg} />);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('applies role-distinct styling: assistant uses justify-start, user uses justify-end', () => {
    const { container: assistantContainer } = render(
      <ChatMessageComponent message={assistantMsg} />,
    );
    const { container: userContainer } = render(
      <ChatMessageComponent message={userMsg} />,
    );

    // The outer wrapper carries the alignment class
    const assistantWrapper = assistantContainer.firstElementChild;
    const userWrapper = userContainer.firstElementChild;

    expect(assistantWrapper?.className).toContain('justify-start');
    expect(userWrapper?.className).toContain('justify-end');
  });
});

// ─── ChatThread component tests ───────────────────────────────────────────────

describe('ChatThread', () => {
  it('renders all messages in order', () => {
    const messages: ChatMessage[] = [assistantMsg, userMsg, assistantMsg2];
    render(<ChatThread messages={messages} />);

    expect(screen.getByText(assistantMsg.text)).toBeInTheDocument();
    expect(screen.getByText(userMsg.text)).toBeInTheDocument();
    expect(screen.getByText(assistantMsg2.text)).toBeInTheDocument();
  });

  it('renders an empty thread without errors', () => {
    render(<ChatThread messages={[]} />);
    // No messages — just verify it renders without throwing
    expect(screen.queryByRole('log')).toBeInTheDocument();
  });

  it('autoscroll — scrollIntoView is called when messages are initially rendered (Req 2.7)', () => {
    render(<ChatThread messages={[assistantMsg]} />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('autoscroll — scrollIntoView is called again when a new message is appended (Req 2.7)', () => {
    const { rerender } = render(<ChatThread messages={[assistantMsg]} />);

    // Reset the call count after initial render
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();

    // Re-render with a second message appended
    rerender(<ChatThread messages={[assistantMsg, userMsg]} />);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('ARIA live region contains the last message text (Req 10.5)', () => {
    const messages: ChatMessage[] = [assistantMsg, userMsg];
    render(<ChatThread messages={messages} />);

    // The last message is the user message; the live region should contain its text
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toContain(userMsg.text);
  });

  it('ARIA live region updates when messages change (Req 10.5)', () => {
    const { rerender } = render(<ChatThread messages={[assistantMsg]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain(assistantMsg.text);

    // Add a new user message
    rerender(<ChatThread messages={[assistantMsg, userMsg]} />);

    expect(liveRegion?.textContent).toContain(userMsg.text);
  });

  it('ARIA live region prefixes assistant messages with "AI Interviewer:" (Req 10.5)', () => {
    render(<ChatThread messages={[assistantMsg]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain('AI Interviewer:');
    expect(liveRegion?.textContent).toContain(assistantMsg.text);
  });

  it('ARIA live region prefixes user messages with "You:" (Req 10.5)', () => {
    render(<ChatThread messages={[assistantMsg, userMsg]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toContain('You:');
    expect(liveRegion?.textContent).toContain(userMsg.text);
  });

  it('ARIA live region is empty when there are no messages (Req 10.5)', () => {
    render(<ChatThread messages={[]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent?.trim()).toBe('');
  });

  it('uses a custom liveRegionLabel when provided', () => {
    render(
      <ChatThread messages={[assistantMsg]} liveRegionLabel="Custom region" />,
    );

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute('aria-label', 'Custom region');
  });

  it('uses the default liveRegionLabel "Interview conversation" when none is provided', () => {
    render(<ChatThread messages={[assistantMsg]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute('aria-label', 'Interview conversation');
  });
});
