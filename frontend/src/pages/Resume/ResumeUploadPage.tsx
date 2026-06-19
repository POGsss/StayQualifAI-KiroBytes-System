/**
 * ResumeUploadPage — ATS Resume Scanner & Keyword Optimizer entry point.
 *
 * Drives the upload + scan workflow against the Resume Zustand store:
 *   1. The user selects a `.pdf`/`.docx` file and (optionally) pastes a job
 *      description.
 *   2. On submit, the page calls `uploadResume(file)` to parse the file into a
 *      `IStructuredResume`.
 *   3. Once parsed content is returned, it immediately calls
 *      `scan(content, jobDescription || undefined)` to compute the ATS
 *      compatibility score and keyword suggestions.
 *   4. The `ScoreGauge` and `KeywordList` presentational components render the
 *      results, with the ATS contributing factors listed alongside.
 *
 * The page derives all result/async state from the store (no duplicated UI
 * copies) and keeps local React state only for the controlled form inputs.
 *
 * Requirements: 1.1 (upload + parse), 1.5 (structured resume returned),
 * 3.4 (score + contributing factors), 4.1 (keyword suggestions).
 *
 * Named exports only. No `any`.
 */

import { useCallback, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';

import { KeywordList } from '../../components/KeywordList';
import { ScoreGauge } from '../../components/ScoreGauge';
import { useResumeStore } from '../../stores/resume.store';

/** File extensions accepted by the upload control (Requirement 1.1). */
const ACCEPTED_FILE_TYPES = '.pdf,.docx';

export function ResumeUploadPage(): JSX.Element {
  const status = useResumeStore((state) => state.status);
  const error = useResumeStore((state) => state.error);
  const scanResult = useResumeStore((state) => state.scanResult);
  const keywordSuggestions = useResumeStore((state) => state.keywordSuggestions);
  const uploadResume = useResumeStore((state) => state.uploadResume);
  const scan = useResumeStore((state) => state.scan);

  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>('');

  const isLoading = status === 'loading';
  const canSubmit = file !== null && !isLoading;

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
  }, []);

  const handleJobDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      setJobDescription(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (file === null) {
        return;
      }

      const content = await uploadResume(file);
      if (content === null) {
        // Upload/parse failed — the store captured the error; stop here.
        return;
      }

      const trimmedJd = jobDescription.trim();
      await scan(content, trimmedJd.length > 0 ? trimmedJd : undefined);
    },
    [file, jobDescription, scan, uploadResume],
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900">ATS Resume Scanner</h1>
        <p className="text-gray-600">
          Upload your resume and, optionally, paste a job description to get an ATS
          compatibility score and tailored keyword suggestions.
        </p>
      </header>

      <section aria-labelledby="upload-form-heading">
        <h2 id="upload-form-heading" className="sr-only">
          Upload and scan
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="resume-file" className="text-sm font-medium text-gray-700">
              Resume file (.pdf or .docx)
            </label>
            <input
              id="resume-file"
              name="resume-file"
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              aria-describedby="resume-file-hint"
              className="block w-full rounded-md border border-gray-300 bg-white text-sm text-gray-700 file:mr-4 file:cursor-pointer file:rounded-l-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            />
            <p id="resume-file-hint" className="text-xs text-gray-500">
              Supported formats: PDF and Word (.docx).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="job-description"
              className="text-sm font-medium text-gray-700"
            >
              Job description (optional)
            </label>
            <textarea
              id="job-description"
              name="job-description"
              value={jobDescription}
              onChange={handleJobDescriptionChange}
              rows={6}
              aria-describedby="job-description-hint"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            />
            <p id="job-description-hint" className="text-xs text-gray-500">
              Paste a target job description to score against it and surface missing
              keywords.
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Scanning…' : 'Upload & scan'}
            </button>
          </div>
        </form>
      </section>

      {isLoading ? (
        <p role="status" className="text-sm text-gray-600">
          Analyzing your resume…
        </p>
      ) : null}

      {status === 'error' && error !== null ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error.message}
        </p>
      ) : null}

      {scanResult !== null ? (
        <section aria-labelledby="results-heading" className="flex flex-col gap-6">
          <h2 id="results-heading" className="text-xl font-semibold text-gray-900">
            Scan results
          </h2>

          <ScoreGauge score={scanResult.score} label="ATS compatibility score" />

          {scanResult.factors.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Contributing factors
              </h3>
              <ul className="flex flex-col gap-2">
                {scanResult.factors.map((factor) => (
                  <li
                    key={factor.label}
                    className="rounded-md border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {factor.label}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">
                        {factor.impact >= 0 ? `+${factor.impact}` : factor.impact}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{factor.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-700">Keyword suggestions</h3>
            <KeywordList suggestions={keywordSuggestions} label="Keyword suggestions" />
          </div>
        </section>
      ) : null}
    </main>
  );
}
