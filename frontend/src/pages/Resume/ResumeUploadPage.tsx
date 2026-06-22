/**
 * ResumeUploadPage — ATS Resume Scanner dashboard (Bauhaus redesign).
 *
 * Resume intelligence dashboard that focuses on ATS analysis and AI-powered
 * resume feedback. Layout (matches the Figma "Resume" wireframe):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  KPI row — ATS Score (blue) · Keyword Match (yellow) ·         │
 *   │            Resume Structure (red)                              │
 *   ├───────────────────────────────────┬──────────────────────────┤
 *   │  Resume Preview (≈70%)            │  Upload card (≈30%)        │
 *   │  - scrollable parsed document     │  - drag & drop + button    │
 *   │  - Analyze Resume / Download      │  AI Review card            │
 *   │    Report actions                 │  - strengths / weaknesses  │
 *   │                                   │  - missing keywords / recs │
 *   └───────────────────────────────────┴──────────────────────────┘
 *
 * Workflow against the Resume Zustand store:
 *   1. User drops/selects a `.pdf`/`.docx` file (and optionally pastes a JD).
 *   2. "Upload & Scan" calls `uploadResume(file)` → parsed `IStructuredResume`,
 *      then `scan(content, jd?)` to compute the ATS score + keyword suggestions.
 *   3. KPI cards, the document preview, and the AI Review panel all derive from
 *      store state — no duplicated UI copies. Local React state holds only the
 *      controlled form inputs and drag-hover flag.
 *
 * Requirements: 1.1 (upload + parse), 1.5 (structured resume returned),
 * 3.4 (score + contributing factors), 4.1 (keyword suggestions).
 *
 * Named exports only. No `any`.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type JSX,
} from 'react';

import { useResumeStore } from '../../stores/resume.store';
import type {
  IAtsScanResult,
  IMatchResult,
  IScoreFactor,
  IStructuredResume,
} from '../../types/resume.types';

/** File extensions accepted by the upload control (Requirement 1.1). */
const ACCEPTED_FILE_TYPES = '.pdf,.docx';

/** Clamp an arbitrary number into the inclusive 0..100 range and round it. */
function clampScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Derived KPI percentages rendered in the top stat cards. */
interface IKpiScores {
  /** ATS compatibility score (the authoritative scan score). */
  ats: number;
  /** Keyword match — from a match result, else estimated from suggestion volume. */
  keyword: number;
  /** Resume structure health — derived from the scan's contributing factors. */
  structure: number;
}

/**
 * Derive the three KPI percentages from the available scan/match results.
 *
 * - `ats` is the authoritative `scanResult.score`.
 * - `keyword` prefers an explicit `matchResult.score`; without one it estimates
 *   coverage from how many keyword gaps the scan surfaced (fewer gaps → higher).
 * - `structure` is a standalone "structure health" proxy centered at 50 and
 *   nudged by the net of the scan's positive/negative contributing factors.
 *
 * All three default to 0 before any scan has run. These are transparent
 * heuristics over real scan data and can be replaced by dedicated backend
 * scores later without touching the UI.
 */
function deriveKpiScores(
  scan: IAtsScanResult | null,
  match: IMatchResult | null,
): IKpiScores {
  const keywordFromMatch = match !== null ? clampScore(match.score) : null;

  if (scan === null) {
    return { ats: 0, keyword: keywordFromMatch ?? 0, structure: 0 };
  }

  const ats = clampScore(scan.score);
  const keyword =
    keywordFromMatch ?? clampScore(100 - scan.keywordSuggestions.length * 8);
  const netImpact = scan.factors.reduce((sum, factor) => sum + factor.impact, 0);
  const structure =
    scan.factors.length > 0 ? clampScore(50 + netImpact) : ats;

  return { ats, keyword, structure };
}

type KpiTone = 'blue' | 'yellow' | 'red';

/** Solid-fill stat card (Bauhaus KPI). White text on blue/red, ink on yellow. */
function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: KpiTone;
}): JSX.Element {
  const fill: Record<KpiTone, string> = {
    blue: 'bg-accent-blue text-white',
    yellow: 'bg-accent-yellow text-ink',
    red: 'bg-accent-red text-white',
  };
  const muted = tone === 'yellow' ? 'text-ink/70' : 'text-white/80';

  return (
    <div className={`rounded-2xl p-5 shadow-card ${fill[tone]}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>
        {label}
      </p>
      <p className="mt-3 text-4xl font-bold leading-none">
        {value}
        <span className="ml-0.5 text-2xl font-semibold">%</span>
      </p>
    </div>
  );
}

/** Section block inside the document preview (heading + lines). */
function PreviewSection({
  heading,
  lines,
}: {
  heading: string;
  lines: string[];
}): JSX.Element | null {
  const visible = lines.filter((line) => line.trim().length > 0);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {heading}
      </h3>
      <ul className="flex flex-col gap-1 text-sm text-ink">
        {visible.map((line, index) => (
          <li key={`${heading}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Render the parsed structured resume as a readable, scrollable document. */
function ResumeDocumentPreview({
  content,
}: {
  content: IStructuredResume;
}): JSX.Element {
  const { contact } = content;
  const contactLine = [contact.email, contact.phone, contact.location]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('  ·  ');

  const experienceLines = content.experience.flatMap((section) => section.items);
  const educationLines = content.education.flatMap((section) => section.items);
  const additionalLines = content.additional.flatMap((section) => section.items);

  return (
    <article className="flex flex-col gap-5 rounded-xl bg-white p-6 text-ink ring-1 ring-gray-200">
      <header className="flex flex-col gap-1 border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-ink">
          {contact.name.trim().length > 0 ? contact.name : 'Unnamed candidate'}
        </h2>
        {contactLine.length > 0 ? (
          <p className="text-sm text-muted">{contactLine}</p>
        ) : null}
        {contact.links.length > 0 ? (
          <p className="text-sm text-accent-blue">{contact.links.join('  ·  ')}</p>
        ) : null}
      </header>

      <PreviewSection
        heading="Summary"
        lines={content.summary.length > 0 ? [content.summary] : []}
      />
      <PreviewSection heading="Experience" lines={experienceLines} />
      <PreviewSection heading="Education" lines={educationLines} />
      <PreviewSection heading="Skills" lines={content.skills} />
      <PreviewSection heading="Additional" lines={additionalLines} />
    </article>
  );
}

/** A labelled list block in the AI Review panel. */
function ReviewBlock({
  heading,
  items,
  tone,
  emptyHint,
}: {
  heading: string;
  items: string[];
  tone: 'positive' | 'negative' | 'keyword' | 'neutral';
  emptyHint: string;
}): JSX.Element {
  const dot: Record<typeof tone, string> = {
    positive: 'bg-accent-blue',
    negative: 'bg-accent-red',
    keyword: 'bg-accent-yellow',
    neutral: 'bg-muted',
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={`size-2 rounded-full ${dot[tone]}`} aria-hidden="true" />
        {heading}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyHint}</p>
      ) : tone === 'keyword' ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={heading}>
          {items.map((item, index) => (
            <li
              key={`${heading}-${index}`}
              className="rounded-full bg-accent-yellow/20 px-2.5 py-0.5 text-xs font-semibold text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm text-ink" aria-label={heading}>
          {items.map((item, index) => (
            <li key={`${heading}-${index}`} className="flex gap-2">
              <span className="text-muted" aria-hidden="true">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Format a factor for display in the strengths/weaknesses lists. */
function formatFactor(factor: IScoreFactor): string {
  return `${factor.label} — ${factor.detail}`;
}

/** Build a plain-text ATS report from the current scan result + resume. */
function buildReport(
  scan: IAtsScanResult,
  kpis: IKpiScores,
  content: IStructuredResume | null,
): string {
  const lines: string[] = [
    'StayQualifAI — ATS Resume Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Candidate: ${content?.contact.name ?? 'Unknown'}`,
    '',
    'Scores',
    `  ATS Compatibility: ${kpis.ats}%`,
    `  Keyword Match:     ${kpis.keyword}%`,
    `  Resume Structure:  ${kpis.structure}%`,
    '',
    'Contributing factors',
  ];

  if (scan.factors.length === 0) {
    lines.push('  (none)');
  } else {
    for (const factor of scan.factors) {
      const sign = factor.impact >= 0 ? `+${factor.impact}` : `${factor.impact}`;
      lines.push(`  [${sign}] ${factor.label} — ${factor.detail}`);
    }
  }

  lines.push('', 'Missing / suggested keywords');
  if (scan.keywordSuggestions.length === 0) {
    lines.push('  (none)');
  } else {
    for (const suggestion of scan.keywordSuggestions) {
      lines.push(`  - ${suggestion.term}: ${suggestion.reason}`);
    }
  }

  return lines.join('\n');
}

export function ResumeUploadPage(): JSX.Element {
  const status = useResumeStore((state) => state.status);
  const error = useResumeStore((state) => state.error);
  const scanResult = useResumeStore((state) => state.scanResult);
  const matchResult = useResumeStore((state) => state.matchResult);
  const resumeContent = useResumeStore((state) => state.resumeContent);
  const uploadResume = useResumeStore((state) => state.uploadResume);
  const scan = useResumeStore((state) => state.scan);

  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === 'loading';
  const canScan = file !== null && !isLoading;

  const kpis = useMemo(
    () => deriveKpiScores(scanResult, matchResult),
    [scanResult, matchResult],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped !== null) {
      setFile(dropped);
    }
  }, []);

  const runScan = useCallback(
    async (content: IStructuredResume): Promise<void> => {
      const trimmedJd = jobDescription.trim();
      await scan(content, trimmedJd.length > 0 ? trimmedJd : undefined);
    },
    [jobDescription, scan],
  );

  const handleUploadAndScan = useCallback(async (): Promise<void> => {
    if (file === null) {
      return;
    }
    const content = await uploadResume(file);
    if (content === null) {
      // Upload/parse failed — the store captured the error; stop here.
      return;
    }
    await runScan(content);
  }, [file, runScan, uploadResume]);

  // Re-run the ATS analysis against the already-parsed resume content.
  const handleAnalyze = useCallback((): void => {
    if (resumeContent === null) {
      return;
    }
    void runScan(resumeContent);
  }, [resumeContent, runScan]);

  const handleDownloadReport = useCallback((): void => {
    if (scanResult === null) {
      return;
    }
    const report = buildReport(scanResult, kpis, resumeContent);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ats-resume-report.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [scanResult, kpis, resumeContent]);

  // AI Review content derived from the scan result.
  const strengths = useMemo(
    () =>
      (scanResult?.factors ?? [])
        .filter((factor) => factor.impact >= 0)
        .map(formatFactor),
    [scanResult],
  );
  const weaknesses = useMemo(
    () =>
      (scanResult?.factors ?? [])
        .filter((factor) => factor.impact < 0)
        .map(formatFactor),
    [scanResult],
  );
  const missingKeywords = useMemo(
    () => (scanResult?.keywordSuggestions ?? []).map((suggestion) => suggestion.term),
    [scanResult],
  );
  const recommendations = useMemo(
    () => (scanResult?.keywordSuggestions ?? []).map((suggestion) => suggestion.reason),
    [scanResult],
  );

  const hasResults = scanResult !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <section aria-label="Resume scores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="ATS Score" value={kpis.ats} tone="blue" />
        <KpiCard label="Keyword Match Score" value={kpis.keyword} tone="yellow" />
        <KpiCard label="Resume Structure Score" value={kpis.structure} tone="red" />
      </section>

      {/* Error banner */}
      {status === 'error' && error !== null ? (
        <p
          role="alert"
          className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
        >
          {error.message}
        </p>
      ) : null}

      {/* Main two-column layout: preview (≈70%) + upload/AI review (≈30%) */}
      <div className="grid gap-6 lg:grid-cols-[7fr_3fr]">
        {/* Left: Resume Preview panel */}
        <section
          aria-labelledby="preview-heading"
          className="flex min-h-[28rem] flex-col gap-4 rounded-2xl bg-surface p-6 shadow-panel"
        >
          <h2 id="preview-heading" className="text-lg font-bold text-ink">
            Resume Preview
          </h2>

          <div className="min-h-[20rem] flex-1 overflow-y-auto rounded-xl bg-canvas p-4">
            {resumeContent !== null ? (
              <ResumeDocumentPreview content={resumeContent} />
            ) : (
              <div className="flex h-full min-h-[16rem] items-center justify-center text-center">
                <p className="max-w-xs text-sm text-muted">
                  Upload a resume to preview the parsed document here and verify its
                  content.
                </p>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={!hasResults}
              className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download Report
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={resumeContent === null || isLoading}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Analyzing…' : 'Analyze Resume'}
            </button>
          </div>
        </section>

        {/* Right column: Upload card + AI Review card */}
        <div className="flex flex-col gap-6">
          {/* Upload card */}
          <section
            aria-labelledby="upload-heading"
            className="flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-panel"
          >
            <h2 id="upload-heading" className="text-lg font-bold text-ink">
              Upload your resume
            </h2>

            {/* Drag & drop area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary-50'
                  : 'border-gray-300 bg-canvas'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-10 text-muted"
                aria-hidden="true"
              >
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <p className="text-sm text-muted">
                Drag &amp; drop your file here, or
              </p>

              <label
                htmlFor="resume-file"
                className="cursor-pointer rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface focus-within:ring-2 focus-within:ring-primary/40"
              >
                Browse file
                <input
                  ref={fileInputRef}
                  id="resume-file"
                  name="resume-file"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              <p className="text-xs text-muted">PDF or Word (.docx)</p>

              {file !== null ? (
                <p className="max-w-full truncate text-xs font-medium text-ink" title={file.name}>
                  Selected: {file.name}
                </p>
              ) : null}
            </div>

            {/* Optional JD to power the keyword-match score */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="job-description" className="text-sm font-medium text-ink">
                Job description <span className="text-muted">(optional)</span>
              </label>
              <textarea
                id="job-description"
                name="job-description"
                value={jobDescription}
                onChange={(event): void => setJobDescription(event.target.value)}
                rows={3}
                placeholder="Paste a target job description to score keyword match and surface gaps."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <button
              type="button"
              onClick={(): void => {
                void handleUploadAndScan();
              }}
              disabled={!canScan}
              className="self-end rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Uploading…' : 'Upload & Scan'}
            </button>
          </section>

          {/* AI Review card */}
          <section
            aria-labelledby="ai-review-heading"
            className="flex flex-col gap-5 rounded-2xl bg-surface p-6 shadow-panel"
          >
            <h2 id="ai-review-heading" className="text-lg font-bold text-ink">
              AI Review
            </h2>

            {hasResults ? (
              <>
                <ReviewBlock
                  heading="Strengths"
                  items={strengths}
                  tone="positive"
                  emptyHint="No standout strengths detected yet."
                />
                <ReviewBlock
                  heading="Weaknesses"
                  items={weaknesses}
                  tone="negative"
                  emptyHint="No weaknesses flagged — nice work."
                />
                <ReviewBlock
                  heading="Missing Keywords"
                  items={missingKeywords}
                  tone="keyword"
                  emptyHint="Your resume already covers the relevant terms."
                />
                <ReviewBlock
                  heading="ATS Recommendations"
                  items={recommendations}
                  tone="neutral"
                  emptyHint="No additional recommendations."
                />
              </>
            ) : (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {/* Placeholder skeleton lines (matches the wireframe). */}
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className={`h-3 rounded-full bg-gray-200 ${
                      index % 4 === 3 ? 'w-1/2' : index % 2 === 0 ? 'w-full' : 'w-4/5'
                    }`}
                  />
                ))}
              </div>
            )}

            {!hasResults ? (
              <p className="text-sm text-muted">
                Upload and scan a resume to see AI-powered strengths, weaknesses, and
                ATS recommendations.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
