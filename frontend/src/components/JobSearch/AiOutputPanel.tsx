import { useCallback, useState } from 'react';
import type { JSX } from 'react';

import { Button } from '../Button';
import { Panel } from '../Panel';

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
      <Panel className="bg-canvas border border-gray-200">
        <p className="text-sm text-muted">
          Generated content will appear here. Select an application and content type above,
          then click Generate.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="relative">
      {/* Copy button — top-right */}
      <Button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        variant="subtle"
        size="sm"
        className="absolute end-4 top-4"
      >
        {copied ? (
          <span className="text-xs font-semibold text-accent-blue">Copied!</span>
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
      </Button>

      {/* Generated text */}
      <div className="max-h-96 overflow-y-auto pe-8 font-mono text-sm whitespace-pre-wrap text-ink bg-canvas border border-gray-200 rounded-[10px] p-4">
        {content}
      </div>
    </Panel>
  );
}
