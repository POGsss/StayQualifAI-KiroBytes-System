/**
 * Render tests for VoiceControls
 *
 * Covers:
 *  - Req 10.4: Icon-only controls expose accessible names via aria-label
 *  - Req 10.6: Mic capture state exposed via aria-pressed and toggles on click
 *  - Req  4.3: Replay handler fires when the Replay button is clicked
 *  - Req  4.4: Stop handler fires when the Stop button is clicked
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceControls } from '../VoiceControls';

// ─── default props ─────────────────────────────────────────────────────────

const defaultProps = {
  isListening: false,
  isSpeaking: false,
  isTtsSupported: true,
  isSttSupported: true,
  onMicToggle: vi.fn(),
  onReplay: vi.fn(),
  onStop: vi.fn(),
};

function setup(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  const result = render(<VoiceControls {...props} />);
  return { ...result, props };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. Accessible names (Req 10.4) ────────────────────────────────────────

describe('accessible names on icon-only controls (Req 10.4)', () => {
  it('mic button has aria-label "Start listening" when not listening', () => {
    setup({ isSttSupported: true, isListening: false });
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeDefined();
  });

  it('mic button has aria-label "Stop listening" when listening', () => {
    setup({ isSttSupported: true, isListening: true });
    expect(screen.getByRole('button', { name: 'Stop listening' })).toBeDefined();
  });

  it('replay button has aria-label "Replay question"', () => {
    setup({ isTtsSupported: true });
    expect(screen.getByRole('button', { name: 'Replay question' })).toBeDefined();
  });

  it('stop button has aria-label "Stop playback"', () => {
    setup({ isSpeaking: true });
    expect(screen.getByRole('button', { name: 'Stop playback' })).toBeDefined();
  });
});

// ─── 2. Mic capture state exposed to AT (Req 10.6) ─────────────────────────

describe('mic capture state exposed to assistive tech (Req 10.6)', () => {
  it('mic button has aria-pressed false when isListening is false', () => {
    setup({ isListening: false });
    const btn = screen.getByRole('button', { name: 'Start listening' });
    // aria-pressed may be the boolean false or the string "false"
    const pressed = btn.getAttribute('aria-pressed');
    expect(pressed === 'false' || pressed === null ? false : pressed === 'true').toBe(false);
  });

  it('mic button has aria-pressed true when isListening is true', () => {
    setup({ isListening: true });
    const btn = screen.getByRole('button', { name: 'Stop listening' });
    const pressed = btn.getAttribute('aria-pressed');
    expect(pressed === 'true').toBe(true);
  });
});

// ─── 3. Mic state toggles (Req 10.6) ───────────────────────────────────────

describe('mic state toggle (Req 10.6)', () => {
  it('clicking the mic button calls onMicToggle', () => {
    const onMicToggle = vi.fn();
    setup({ onMicToggle, isListening: false });
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(onMicToggle).toHaveBeenCalledTimes(1);
  });

  it('aria-label changes from "Start listening" to "Stop listening" when isListening toggles', () => {
    const { rerender } = render(<VoiceControls {...defaultProps} isListening={false} />);
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeDefined();

    rerender(<VoiceControls {...defaultProps} isListening={true} />);
    expect(screen.getByRole('button', { name: 'Stop listening' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Start listening' })).toBeNull();
  });
});

// ─── 4. Replay handler fires (Req 4.3) ─────────────────────────────────────

describe('replay handler (Req 4.3)', () => {
  it('clicking the Replay button calls onReplay', () => {
    const onReplay = vi.fn();
    setup({ onReplay, isTtsSupported: true });
    fireEvent.click(screen.getByRole('button', { name: 'Replay question' }));
    expect(onReplay).toHaveBeenCalledTimes(1);
  });
});

// ─── 5. Stop handler fires (Req 4.4) ───────────────────────────────────────

describe('stop handler and visibility (Req 4.4)', () => {
  it('stop button is shown when isSpeaking is true', () => {
    setup({ isSpeaking: true });
    expect(screen.getByRole('button', { name: 'Stop playback' })).toBeDefined();
  });

  it('clicking the Stop button calls onStop', () => {
    const onStop = vi.fn();
    setup({ onStop, isSpeaking: true });
    fireEvent.click(screen.getByRole('button', { name: 'Stop playback' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('stop button is NOT shown when isSpeaking is false', () => {
    setup({ isSpeaking: false });
    expect(screen.queryByRole('button', { name: 'Stop playback' })).toBeNull();
  });
});

// ─── 6. Conditional rendering ──────────────────────────────────────────────

describe('conditional rendering', () => {
  it('mic button is shown when isSttSupported is true', () => {
    setup({ isSttSupported: true, isListening: false });
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeDefined();
  });

  it('mic button is NOT shown when isSttSupported is false', () => {
    setup({ isSttSupported: false });
    expect(screen.queryByRole('button', { name: 'Start listening' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop listening' })).toBeNull();
  });

  it('replay button is shown when isTtsSupported is true', () => {
    setup({ isTtsSupported: true });
    expect(screen.getByRole('button', { name: 'Replay question' })).toBeDefined();
  });

  it('replay button is NOT shown when isTtsSupported is false', () => {
    setup({ isTtsSupported: false });
    expect(screen.queryByRole('button', { name: 'Replay question' })).toBeNull();
  });
});
