/**
 * ResumeUploadCard — file drop zone + optional JD input + "Upload & Scan" CTA.
 *
 * Presentational: it owns the local drag-hover flag only; the selected file,
 * job-description text, loading flag, and the upload handler are all supplied by
 * the parent page so the file can be shared with the PDF preview.
 *
 * Named exports only. No `any`.
 */

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type JSX,
} from 'react';

import { Button } from '../Button';

/** File extensions accepted by the upload control (Requirement 1.1). */
const ACCEPTED_FILE_TYPES = '.pdf,.docx';

export interface IResumeUploadCardProps {
  file: File | null;
  jobDescription: string;
  isLoading: boolean;
  /** Enables the "Upload & Scan" action. */
  canScan: boolean;
  onFileChange: (file: File | null) => void;
  onJobDescriptionChange: (value: string) => void;
  onUploadAndScan: () => void;
}

export function ResumeUploadCard({
  file,
  jobDescription,
  isLoading,
  canScan,
  onFileChange,
  onJobDescriptionChange,
  onUploadAndScan,
}: IResumeUploadCardProps): JSX.Element {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      onFileChange(event.target.files?.[0] ?? null);
    },
    [onFileChange],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      setIsDragging(false);
      const dropped = event.dataTransfer.files?.[0] ?? null;
      if (dropped !== null) {
        onFileChange(dropped);
      }
    },
    [onFileChange],
  );

  return (
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
          isDragging ? 'border-primary bg-primary-50' : 'border-gray-300 bg-canvas'
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
        <p className="text-sm text-muted">Drag &amp; drop your file here, or</p>

        <label
          htmlFor="resume-file"
          className="cursor-pointer rounded-[10px] border-2 border-bauhaus-ink px-4 py-1.5 text-xs font-medium text-bauhaus-ink transition-colors hover:bg-bauhaus-ink hover:text-white focus-within:ring-2 focus-within:ring-bauhaus-blue/50"
        >
          Browse file
          <input
            ref={fileInputRef}
            id="resume-file"
            name="resume-file"
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>

        <p className="text-xs text-muted">PDF or Word (.docx)</p>

        {file !== null ? (
          <p
            className="max-w-full truncate text-xs font-medium text-ink"
            title={file.name}
          >
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
          onChange={(event): void => onJobDescriptionChange(event.target.value)}
          rows={3}
          placeholder="Paste a target job description to score keyword match and surface gaps."
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <Button
        onClick={onUploadAndScan}
        disabled={!canScan}
        className="self-end"
      >
        {isLoading ? 'Uploading…' : 'Upload & Scan'}
      </Button>
    </section>
  );
}
