/**
 * ResumeUploadPage — ATS Resume Scanner dashboard (Bauhaus redesign).
 *
 * Resume intelligence dashboard that focuses on ATS analysis and AI-powered
 * resume feedback. Layout:
 *
 *   ┌───────────────────────────────────┬──────────────────────────┐
 *   │  KPI cards (ATS · Keyword · Struct)│  Upload card              │
 *   │  ─────────────────────────────────│  - drag & drop + JD        │
 *   │  Resume Preview                    │  AI Review card            │
 *   │  - real PDF viewer of the file     │  - strengths / weaknesses  │
 *   │  - Analyze / Download actions      │  - missing keywords / recs │
 *   └───────────────────────────────────┴──────────────────────────┘
 *
 * The KPI cards and the document preview now share the LEFT column; the upload
 * and AI-review cards sit in the right column. The preview is a genuine PDF
 * viewer fed the uploaded file (see {@link ResumePdfPreview}), not a parsed-DOM
 * reconstruction. All presentational pieces are extracted into reusable
 * `components/Resume/*` components.
 *
 * Workflow against the Resume Zustand store:
 *   1. User drops/selects a `.pdf`/`.docx` file (and optionally pastes a JD).
 *   2. "Upload & Scan" calls `uploadResume(file)` → parsed `IStructuredResume`,
 *      then `scan(content, jd?)` to compute the ATS score + keyword suggestions.
 *   3. KPI cards, the document preview, and the AI Review panel all derive from
 *      store state. Local React state holds only the controlled form inputs.
 *
 * Requirements: 1.1 (upload + parse), 1.5 (structured resume returned),
 * 3.4 (score + contributing factors), 4.1 (keyword suggestions).
 *
 * Named exports only. No `any`.
 */

import { useCallback, useMemo, useState, type JSX } from 'react';

import { Button } from '../../components/Button';
import { KpiCard } from '../../components/KpiCard';
import {
  ResumeAiReview,
  ResumePdfPreview,
  ResumeUploadCard,
} from '../../components/Resume';
import { useResumeStore } from '../../stores/resume.store';
import type {
  IAtsScanResult,
  IMatchResult,
  IScoreFactor,
  IStructuredResume,
} from '../../types/resume.types';

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
 * All three default to 0 before any scan has run.
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
  const structure = scan.factors.length > 0 ? clampScore(50 + netImpact) : ats;

  return { ats, keyword, structure };
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

  const isLoading = status === 'loading';
  const canScan = file !== null && !isLoading;

  const kpis = useMemo(
    () => deriveKpiScores(scanResult, matchResult),
    [scanResult, matchResult],
  );

  const runScan = useCallback(
    async (content: IStructuredResume): Promise<void> => {
      const trimmedJd = jobDescription.trim();
      await scan(content, trimmedJd.length > 0 ? trimmedJd : undefined);
    },
    [jobDescription, scan],
  );

  const handleUploadAndScan = useCallback((): void => {
    void (async (): Promise<void> => {
      if (file === null) {
        return;
      }
      const content = await uploadResume(file);
      if (content === null) {
        // Upload/parse failed — the store captured the error; stop here.
        return;
      }
      await runScan(content);
    })();
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
      {/* Error banner */}
      {status === 'error' && error !== null ? (
        <p
          role="alert"
          className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
        >
          {error.message}
        </p>
      ) : null}

      {/* Two-column layout: left = KPIs + preview (≈70%), right = upload + AI review (≈30%) */}
      <div className="grid gap-6 lg:grid-cols-[7fr_3fr]">
        {/* Left column: KPI cards above the resume preview */}
        <div className="flex flex-col gap-6">
          <section
            aria-label="Resume scores"
            className="grid gap-4 sm:grid-cols-3"
          >
            <KpiCard label="ATS Score" value={kpis.ats} tone="blue" unit="%" />
            <KpiCard
              label="Keyword Match Score"
              value={kpis.keyword}
              tone="yellow"
              unit="%"
            />
            <KpiCard
              label="Resume Structure Score"
              value={kpis.structure}
              tone="red"
              unit="%"
            />
          </section>

          {/* Resume Preview panel */}
          <section
            aria-labelledby="preview-heading"
            className="flex min-h-[28rem] flex-col gap-4 rounded-2xl bg-surface p-6 shadow-panel"
          >
            <h2 id="preview-heading" className="text-lg font-bold text-ink">
              Resume Preview
            </h2>

            <div className="min-h-[20rem] flex-1 overflow-hidden rounded-xl bg-canvas">
              <ResumePdfPreview file={file} />
            </div>

            {/* Bottom actions */}
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleDownloadReport}
                disabled={!hasResults}
              >
                Download Report
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={resumeContent === null || isLoading}
              >
                {isLoading ? 'Analyzing…' : 'Analyze Resume'}
              </Button>
            </div>
          </section>
        </div>

        {/* Right column: Upload card + AI Review card */}
        <div className="flex flex-col gap-6">
          <ResumeUploadCard
            file={file}
            jobDescription={jobDescription}
            isLoading={isLoading}
            canScan={canScan}
            onFileChange={setFile}
            onJobDescriptionChange={setJobDescription}
            onUploadAndScan={handleUploadAndScan}
          />

          <ResumeAiReview
            hasResults={hasResults}
            strengths={strengths}
            weaknesses={weaknesses}
            missingKeywords={missingKeywords}
            recommendations={recommendations}
          />
        </div>
      </div>
    </div>
  );
}
