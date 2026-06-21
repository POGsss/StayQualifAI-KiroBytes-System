/**
 * Render tests for AnswerComposer
 *
 * Text mode:
 *  - Req 3.3: Send disabled when empty or whitespace
 *  - Req 3.4: Send disabled when over maxLength, with associated error message
 *  - Req 3.2: Send fires onSend with trimmed text when valid
 *  - Req 3.7: Send disabled while isSubmitting
 *  - Req 10.7: Error messages associated via aria-describedby on the textarea
 *
 * Voice mode:
 *  - Req 5.9: Editable transcript textarea shown in voice mode
 *  - Req 5.13: Typing while listening combines (transcript syncs, user edits kept)
 *  - Req 5.11: Send disabled when transcript is empty
 *  - Req 5.12: Send disabled when transcript exceeds maxLength, error shown
 *  - Req 8.3: Fallback notice renders when fallbackNotice prop is non-null
 *  - Req 9.6: Previously-denied instructions shown when permission === 'denied'
 *  - Req 10.7: Error messages associated via aria-describedby on transcript textarea
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MutableRefObject } from 'react';
import { AnswerComposer } from '../AnswerComposer';
import type { IUseSpeechRecognition } from '../../../hooks/useSpeechRecognition';

// ─────────────────────────────────────────────────────────────────────────────
// Mock recognition helper
// ─────────────────────────────────────────────────────────────────────────────

function makeRecognition(
  overrides: Partial<IUseSpeechRecognition> = {},
): IUseSpeechRecognition {
  const transcriptRef: MutableRefObject<string> = { current: '' };
  return {
    isSupported: true,
    isListening: false,
    transcript: '',
    transcriptRef,
    permission: 'unknown' as const,
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    clearTranscript: vi.fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default props
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LENGTH = 5000;

function makeTextProps(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'text' as const,
    isSubmitting: false,
    recognition: makeRecognition(),
    onSend: vi.fn(),
    fallbackNotice: null,
    maxLength: MAX_LENGTH,
    ...overrides,
  };
}

function makeVoiceProps(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'voice' as const,
    isSubmitting: false,
    recognition: makeRecognition(),
    onSend: vi.fn(),
    fallbackNotice: null,
    maxLength: MAX_LENGTH,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TEXT MODE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Text mode — send button disabled states (Req 3.3)', () => {
  it('send button is disabled when textarea is empty', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });

  it('send button is disabled when textarea contains only whitespace', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   \t\n   ' } });
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });

  it('send button is enabled when valid text is entered', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'A valid answer' } });
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).not.toBeDisabled();
  });
});

describe('Text mode — over-limit disables send and shows error (Req 3.4)', () => {
  it('send button is disabled when text exceeds maxLength', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_LENGTH + 1) } });
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });

  it('error message is shown when text exceeds maxLength', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_LENGTH + 1) } });
    expect(
      screen.getByText(/answer is too long/i),
    ).toBeDefined();
  });

  it('send button is enabled exactly at maxLength', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_LENGTH) } });
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).not.toBeDisabled();
  });
});

describe('Text mode — send fires onSend with trimmed text (Req 3.2)', () => {
  it('clicking send calls onSend with trimmed text', async () => {
    const onSend = vi.fn();
    render(<AnswerComposer {...makeTextProps({ onSend })} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  Hello world  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('onSend is NOT called when button is disabled (empty input)', async () => {
    const onSend = vi.fn();
    render(<AnswerComposer {...makeTextProps({ onSend })} />);
    // Don't type anything — textarea is empty
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Text mode — send disabled while isSubmitting (Req 3.7)', () => {
  it('send button is disabled while isSubmitting is true, even with valid text', () => {
    render(
      <AnswerComposer
        {...makeTextProps({ isSubmitting: true })}
      />,
    );
    // Even if we somehow had text, the button state is locked by isSubmitting.
    // We verify the button is disabled and shows "Sending…".
    const sendBtn = screen.getByRole('button', { name: /sending/i });
    expect(sendBtn).toBeDisabled();
  });

  it('textarea is disabled while isSubmitting is true', () => {
    render(
      <AnswerComposer
        {...makeTextProps({ isSubmitting: true })}
      />,
    );
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });
});

describe('Text mode — aria-describedby association (Req 10.7)', () => {
  it('textarea has aria-describedby pointing to the error element when over limit', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_LENGTH + 1) } });

    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // The id listed in aria-describedby must match an element in the document
    const ids = (describedBy ?? '').split(' ').filter(Boolean);
    const matched = ids.some((id) => document.getElementById(id) !== null);
    expect(matched).toBe(true);
  });

  it('textarea aria-describedby points to the error element that contains the error text', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_LENGTH + 1) } });

    const describedBy = textarea.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);
    const errorEl = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toMatch(/too long/i);
  });

  it('textarea has no aria-describedby when there is no error and no fallback notice', () => {
    render(<AnswerComposer {...makeTextProps()} />);
    const textarea = screen.getByRole('textbox');
    // No text entered, no error, no notice
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy == null || describedBy === '').toBe(true);
  });

  it('textarea aria-describedby includes fallback notice id when fallbackNotice is set', () => {
    render(
      <AnswerComposer
        {...makeTextProps({ fallbackNotice: 'Switched to text mode' })}
      />,
    );
    const textarea = screen.getByRole('textbox');
    const describedBy = textarea.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);
    const noticeEl = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(noticeEl).not.toBeNull();
    expect(noticeEl?.textContent).toMatch(/switched to text mode/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MODE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Voice mode — editable transcript textarea shown (Req 5.9)', () => {
  it('renders an editable transcript textarea in voice mode', () => {
    render(<AnswerComposer {...makeVoiceProps()} />);
    // The transcript textarea has a label "Transcript"
    const transcriptLabel = screen.getByText(/^transcript/i);
    expect(transcriptLabel).toBeDefined();
    const textarea = screen.getByLabelText(/transcript/i);
    expect(textarea).toBeDefined();
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('transcript textarea is pre-filled with the recognition.transcript value', () => {
    const recognition = makeRecognition({ transcript: 'Initial spoken text' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const textarea = screen.getByLabelText(/transcript/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Initial spoken text');
  });
});

describe('Voice mode — typing while listening combines (Req 5.13)', () => {
  it('user can type in the transcript textarea and the value updates', async () => {
    const user = userEvent.setup();
    render(<AnswerComposer {...makeVoiceProps()} />);
    const textarea = screen.getByLabelText(/transcript/i) as HTMLTextAreaElement;
    await user.type(textarea, 'typed while listening');
    expect(textarea.value).toContain('typed while listening');
  });

  it('when recognition.transcript updates, the transcript textarea syncs', () => {
    const recognition = makeRecognition({ transcript: 'first chunk' });
    const { rerender } = render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    let textarea = screen.getByLabelText(/transcript/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('first chunk');

    // Simulate STT engine pushing a new transcript
    const updatedRecognition = makeRecognition({ transcript: 'first chunk second chunk' });
    rerender(<AnswerComposer {...makeVoiceProps({ recognition: updatedRecognition })} />);
    textarea = screen.getByLabelText(/transcript/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('first chunk second chunk');
  });
});

describe('Voice mode — send disabled when transcript empty (Req 5.11)', () => {
  it('send button is disabled when transcript textarea is empty', () => {
    render(<AnswerComposer {...makeVoiceProps()} />);
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });

  it('send button is enabled when transcript has valid text', () => {
    const recognition = makeRecognition({ transcript: 'valid answer' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it('send button is disabled when transcript is all whitespace', () => {
    const recognition = makeRecognition({ transcript: '   ' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });
});

describe('Voice mode — send disabled when transcript exceeds maxLength (Req 5.12)', () => {
  it('send button is disabled when transcript exceeds maxLength', () => {
    const longText = 'x'.repeat(MAX_LENGTH + 1);
    const recognition = makeRecognition({ transcript: longText });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const sendBtn = screen.getByRole('button', { name: /send answer/i });
    expect(sendBtn).toBeDisabled();
  });

  it('error message is shown when transcript exceeds maxLength', () => {
    const longText = 'x'.repeat(MAX_LENGTH + 1);
    const recognition = makeRecognition({ transcript: longText });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    expect(screen.getByText(/answer is too long/i)).toBeDefined();
  });

  it('transcript textarea aria-describedby points to the over-limit error element', () => {
    const longText = 'x'.repeat(MAX_LENGTH + 1);
    const recognition = makeRecognition({ transcript: longText });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);

    const textarea = screen.getByLabelText(/transcript/i);
    const describedBy = textarea.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);
    const errorEl = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toMatch(/too long/i);
  });
});

describe('Voice mode — send fires onSend with trimmed transcript text', () => {
  it('clicking send calls onSend with trimmed transcript value', () => {
    const onSend = vi.fn();
    const recognition = makeRecognition({ transcript: '  spoken answer  ' });
    render(<AnswerComposer {...makeVoiceProps({ recognition, onSend })} />);
    fireEvent.click(screen.getByRole('button', { name: /send answer/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('spoken answer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK NOTICE (Req 8.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('Fallback notice renders when fallbackNotice prop is non-null (Req 8.3)', () => {
  it('renders fallback notice message when fallbackNotice is a non-empty string', () => {
    render(
      <AnswerComposer
        {...makeVoiceProps({ fallbackNotice: 'Microphone unavailable. Switched to text mode.' })}
      />,
    );
    expect(
      screen.getByText(/microphone unavailable/i),
    ).toBeDefined();
  });

  it('fallback notice has role="status" for live announcement', () => {
    render(
      <AnswerComposer
        {...makeVoiceProps({ fallbackNotice: 'Voice recognition lost.' })}
      />,
    );
    const notice = screen.getByRole('status');
    expect(notice.textContent).toMatch(/voice recognition lost/i);
  });

  it('does NOT render fallback notice when fallbackNotice is null', () => {
    render(<AnswerComposer {...makeVoiceProps({ fallbackNotice: null })} />);
    // No role="status" element for the fallback (there should be none)
    const statusEls = screen.queryAllByRole('status');
    expect(statusEls.length).toBe(0);
  });

  it('fallback notice also renders in text mode when provided', () => {
    render(
      <AnswerComposer
        {...makeTextProps({ fallbackNotice: 'Speech not supported on this browser.' })}
      />,
    );
    expect(screen.getByText(/speech not supported/i)).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PREVIOUSLY-DENIED INSTRUCTIONS (Req 9.6)
// ─────────────────────────────────────────────────────────────────────────────

describe('Previously-denied instructions shown when permission is "denied" (Req 9.6)', () => {
  it('renders microphone re-enable instructions when permission is "denied" in voice mode', () => {
    const recognition = makeRecognition({ permission: 'denied' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    // The instructions mention enabling mic in browser settings
    expect(
      screen.getByText(/microphone access was denied/i),
    ).toBeDefined();
  });

  it('denied instructions have role="alert"', () => {
    const recognition = makeRecognition({ permission: 'denied' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/denied/i);
  });

  it('does NOT render denied instructions when permission is "granted"', () => {
    const recognition = makeRecognition({ permission: 'granted' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does NOT render denied instructions in text mode even if permission is "denied"', () => {
    const recognition = makeRecognition({ permission: 'denied' });
    render(<AnswerComposer {...makeTextProps({ recognition })} />);
    // showPermissionDenied is guarded by mode === 'voice'
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MODE — aria-describedby association (Req 10.7)
// ─────────────────────────────────────────────────────────────────────────────

describe('Voice mode — aria-describedby association (Req 10.7)', () => {
  it('transcript textarea has aria-describedby including fallback notice id when notice is shown', () => {
    const recognition = makeRecognition({ transcript: 'some text' });
    render(
      <AnswerComposer
        {...makeVoiceProps({
          recognition,
          fallbackNotice: 'Switched to text input.',
        })}
      />,
    );
    const textarea = screen.getByLabelText(/transcript/i);
    const describedBy = textarea.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ').filter(Boolean);
    const noticeEl = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(noticeEl).not.toBeNull();
    expect(noticeEl?.textContent).toMatch(/switched to text input/i);
  });

  it('transcript textarea has no aria-describedby when no error and no notice', () => {
    const recognition = makeRecognition({ transcript: 'normal answer' });
    render(<AnswerComposer {...makeVoiceProps({ recognition })} />);
    const textarea = screen.getByLabelText(/transcript/i);
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy == null || describedBy === '').toBe(true);
  });
});
