import type { JSX } from 'react';
import type { ChatMessage as ChatMessageData } from '../../types/interview.types';

// ─── ChatMessage ──────────────────────────────────────────────────────────────

export interface IChatMessageProps {
  message: ChatMessageData;
}

/**
 * Renders a single Chat_Thread entry as visible caption text.
 *
 * - Assistant messages: left-aligned with a soft gray bubble and an
 *   "AI Interviewer" label, satisfying the role-distinct styling requirement.
 * - User messages: right-aligned with a solid Bauhaus-blue background.
 * - `message.text` is always rendered as visible caption text (Req 10.1).
 *
 * Named export only — no default export (platform convention).
 */
export function ChatMessage({ message }: IChatMessageProps): JSX.Element {
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}
      data-testid={`chat-message-${message.id}`}
    >
      <div
        className={`flex max-w-[80%] flex-col gap-1 ${isAssistant ? 'items-start' : 'items-end'}`}
      >
        {/* Role label — assistive context above the bubble */}
        <span className="text-xs font-medium text-muted">
          {isAssistant ? 'AI Interviewer' : 'You'}
        </span>

        {/* Message bubble — caption text always present (Req 10.1) */}
        <p
          className={
            isAssistant
              ? 'rounded-2xl bg-canvas px-4 py-3 text-sm text-ink'
              : 'rounded-2xl bg-accent-blue px-4 py-3 text-sm text-white'
          }
        >
          {message.text}
        </p>
      </div>
    </div>
  );
}
