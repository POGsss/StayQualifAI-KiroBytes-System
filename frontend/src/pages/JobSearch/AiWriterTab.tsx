import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

import { AiOutputPanel } from '../../components/JobSearch/AiOutputPanel';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Panel } from '../../components/Panel';
import { Select } from '../../components/Select';
import { useJobSearchStore } from '../../stores/jobsearch.store';
import type { AiContentType } from '../../stores/jobsearch.store';

/**
 * AiWriterTab — form-driven AI content generation interface.
 *
 * Allows the user to select a tracked application, choose a content type
 * (cover letter, LinkedIn outreach, or follow-up email), and generate
 * AI-written text. LinkedIn outreach exposes optional recipient name/role
 * fields. The generated output is displayed in an AiOutputPanel with
 * copy-to-clipboard support.
 *
 * Accessibility:
 * - All inputs have associated `<label>` elements
 * - Error alert is dismissible with a close button
 * - Loading state disables the Generate button and shows a spinner
 */

const CONTENT_TYPES: ReadonlyArray<{ id: AiContentType; label: string }> = [
  { id: 'cover-letter', label: 'Cover Letter' },
  { id: 'linkedin-outreach', label: 'LinkedIn Outreach' },
  { id: 'follow-up-email', label: 'Follow-Up Email' },
];

export function AiWriterTab(): JSX.Element {
  const applications = useJobSearchStore((s) => s.applications);
  const generatedContent = useJobSearchStore((s) => s.generatedContent);
  const status = useJobSearchStore((s) => s.status);
  const error = useJobSearchStore((s) => s.error);
  const fetchApplications = useJobSearchStore((s) => s.fetchApplications);
  const generateContent = useJobSearchStore((s) => s.generateContent);
  const clearError = useJobSearchStore((s) => s.clearError);

  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [contentType, setContentType] = useState<AiContentType>('cover-letter');
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('');

  const isLoading = status === 'loading';
  const canGenerate = selectedApplicationId.length > 0 && !isLoading;

  // Fetch applications on mount if not already loaded
  useEffect(() => {
    if (applications.length === 0) {
      void fetchApplications();
    }
  }, [applications.length, fetchApplications]);

  const handleGenerate = useCallback((): void => {
    if (!canGenerate) return;

    const name = contentType === 'linkedin-outreach' && recipientName.trim().length > 0
      ? recipientName.trim()
      : undefined;
    const role = contentType === 'linkedin-outreach' && recipientRole.trim().length > 0
      ? recipientRole.trim()
      : undefined;

    void generateContent(contentType, selectedApplicationId, name, role);
  }, [canGenerate, contentType, selectedApplicationId, recipientName, recipientRole, generateContent]);

  const appOptions = [
    { value: '', label: 'Select an application…' },
    ...applications.map((app) => ({
      value: app.id,
      label: `${app.listingTitle} — ${app.listingCompany}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Form panel */}
      <Panel title="AI Content Generator">
        <div className="flex flex-col gap-4">
          {/* Application selector */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="ai-application-select"
              className="text-sm font-medium text-muted"
            >
              Application
            </label>
            <Select
              id="ai-application-select"
              value={selectedApplicationId}
              onChange={(e) => setSelectedApplicationId(e.target.value)}
              disabled={isLoading}
              options={appOptions}
            />
          </div>

          {/* Content type selector */}
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-muted">Content Type</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {CONTENT_TYPES.map((type) => (
                <label
                  key={type.id}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="radio"
                    name="ai-content-type"
                    value={type.id}
                    checked={contentType === type.id}
                    onChange={() => setContentType(type.id)}
                    disabled={isLoading}
                    className="h-4 w-4 border-gray-300 text-accent-blue focus:ring-accent-blue/40"
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </fieldset>

          {/* LinkedIn-specific fields */}
          {contentType === 'linkedin-outreach' && (
            <div className="flex flex-col gap-4 rounded-[10px] border border-gray-200 bg-canvas p-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="ai-recipient-name"
                  className="text-sm font-medium text-muted"
                >
                  Recipient Name <span className="text-gray-400">(optional)</span>
                </label>
                <Input
                  id="ai-recipient-name"
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. Jane Smith"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="ai-recipient-role"
                  className="text-sm font-medium text-muted"
                >
                  Recipient Role <span className="text-gray-400">(optional)</span>
                </label>
                <Input
                  id="ai-recipient-role"
                  type="text"
                  value={recipientRole}
                  onChange={(e) => setRecipientRole(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. Hiring Manager"
                />
              </div>
            </div>
          )}

          {/* Generate button */}
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="self-start"
          >
            {isLoading && (
              <svg
                className="h-4 w-4 animate-spin mr-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {isLoading ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </Panel>

      {/* Error alert */}
      {error !== null && (
        <div
          role="alert"
          className="flex items-start justify-between rounded-[10px] border border-accent-red/40 bg-accent-red/10 p-4 text-ink"
        >
          <p className="text-sm">{error.message}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="ms-4 shrink-0 rounded p-1 text-accent-red hover:bg-accent-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Output panel */}
      <AiOutputPanel content={generatedContent} />
    </div>
  );
}
