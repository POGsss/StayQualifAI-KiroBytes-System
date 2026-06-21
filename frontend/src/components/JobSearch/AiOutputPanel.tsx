import { useCallback, useState } from 'react';
import type { JSX } from 'react';

/**
 * AiOutputPanel — displays AI-generated text with a copy-to-clipboard button.
 *
 * When content is present, renders the text in a scrollable, read-only panel
 * with a copy button positioned at the top-right. Uses the native Clipboard API
 * (`navigator.clipboard.writeText`) per workspace steering rules. Shows brief
 * "Copied!" feedback after a successful copy.
 *
 * When content is null or empty, displays placeholder guidance text.
 */

export interface IAiOutputPanelProps {
  /** The generated text to display, or null/empty when nothing has been generated. */
  content: string | null;
}

export function AiOutputPanel({ content }: IAiOutputPanelProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (): Promise<void> => {
    if (content === null || content.length === 0) return;

    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in insecure contexts; silently degrade.
    }
  }, [content]);

  if (content === null || content.length === 0) {
    return (
      <div className="rounded-xl bg-gray-50 p-6">
        <p className="text-sm text-gray-400">
          Generated content will appear here. Select an application and content type above,
          then click Generate.
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl bg-gray-50 p-6">
      {/* Copy button — top-right */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className="absolute end-4 top-4 rounded-lg bg-white p-2 text-gray-500 shadow-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {copied ? (
          <span className="text-xs font-medium text-accent-green">Copied!</span>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>

      {/* Generated text */}
      <div className="max-h-96 overflow-y-auto pe-8 font-mono text-sm whitespace-pre-wrap text-gray-800">
        {content}
      </div>
    </div>
  );
}
