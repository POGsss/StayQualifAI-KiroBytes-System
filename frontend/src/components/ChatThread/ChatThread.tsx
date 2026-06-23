import { useEffect, useRef, type JSX } from 'react';
import type { ChatMessage as ChatMessageData } from '../../types/interview.types';
import { ChatMessage } from './ChatMessage';

// ─── ChatThread ───────────────────────────────────────────────────────────────

export interface IChatThreadProps {
  /** Ordered array of messages to render (sorted by ascending position). */
  messages: ReadonlyArray<ChatMessageData>;
  /**
   * Human-readable label for the ARIA live region that announces new messages
   * to assistive technology (Req 10.5). Defaults to "Interview conversation".
   */
  liveRegionLabel?: string;
  /**
   * In-progress spoken answer for the current question. When non-null/non-empty
   * it is rendered as a pending "You" bubble at the bottom of the thread so the
   * transcript appears in real time as the candidate talks.
   */
  liveAnswer?: string | null;
}

/**
 * Renders the ordered Chat_Thread with autoscroll and an ARIA live region.
 *
 * - Messages are rendered in the order supplied (callers pass
 *   `deriveChatThread().messages` which is already sorted by position).
 * - Autoscroll: a `useRef` on a sentinel element at the bottom of the list
 *   calls `scrollIntoView({ behavior: 'smooth' })` whenever the `messages`
 *   array changes, keeping the most-recent message fully visible (Req 2.7).
 * - ARIA live region: a visually-hidden `aria-live="polite"` region is updated
 *   to the latest message text so assistive technology announces each new
 *   message (Req 10.5).
 *
 * Named export only — no default export.
 */
export function ChatThread({
  messages,
  liveRegionLabel = 'Interview conversation',
  liveAnswer = null,
}: IChatThreadProps): JSX.Element {
  // Sentinel element at the bottom; scrolled into view on each new message.
  const bottomRef = useRef<HTMLDivElement>(null);
  // The last message in the thread, used to populate the ARIA live region.
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const trimmedLiveAnswer = liveAnswer?.trim() ?? '';
  const hasLiveAnswer = trimmedLiveAnswer.length > 0;

  // Autoscroll whenever messages change or the live answer grows (Req 2.7).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveAnswer]);

  return (
    <div className="relative flex flex-col gap-1">
      {/* Scrollable thread container */}
      <div
        className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-label={liveRegionLabel}
        aria-live="off"
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Live, in-progress answer — rendered as a pending "You" bubble */}
        {hasLiveAnswer && (
          <div className="flex w-full justify-end" data-testid="chat-message-live">
            <div className="flex max-w-[80%] flex-col items-end gap-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                You
                <span className="inline-flex gap-0.5" aria-hidden="true">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-blue animate-bounce [animation-delay:0ms]" />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-blue animate-bounce [animation-delay:150ms]" />
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-blue animate-bounce [animation-delay:300ms]" />
                </span>
              </span>
              <p className="rounded-2xl bg-accent-blue/80 px-4 py-3 text-sm text-white">
                {trimmedLiveAnswer}
              </p>
            </div>
          </div>
        )}

        {/* Autoscroll sentinel — scrolled into view on message append */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/*
       * Visually-hidden ARIA live region (Req 10.5).
       *
       * Separate from the scrollable log so that the announcement fires
       * reliably; the log itself uses aria-live="off" to avoid double-
       * announcing. The live region text updates when messages change.
       */}
      <div
        aria-live="polite"
        aria-atomic="true"
        aria-label={liveRegionLabel}
        className="sr-only"
      >
        {lastMessage
          ? `${lastMessage.role === 'assistant' ? 'AI Interviewer' : 'You'}: ${lastMessage.text}`
          : ''}
      </div>
    </div>
  );
}
