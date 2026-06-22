/**
 * ResumePdfPreview — renders the uploaded resume as an actual document, not a
 * reconstructed DOM tree of parsed fields.
 *
 * When the selected file is a PDF, it is shown in a native `<object>` PDF
 * viewer driven by a blob object URL (created/revoked as the file changes).
 * Non-PDF files (e.g. `.docx`) cannot be rendered inline by the browser, so a
 * clear fallback with a download link is shown instead. With no file selected
 * an empty-state hint is rendered.
 *
 * The object URL lifecycle is managed in an effect so the previous URL is
 * always revoked before a new one is created — no leaks across re-selects.
 *
 * Named exports only. No `any`.
 */

import { useEffect, useState, type JSX } from 'react';

export interface IResumePdfPreviewProps {
  /** The currently selected resume file, or `null` before any upload. */
  file: File | null;
}

/** True when the file is a PDF (by MIME type or `.pdf` extension). */
function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

export function ResumePdfPreview({ file }: IResumePdfPreviewProps): JSX.Element {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file === null || !isPdf(file)) {
      setObjectUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return (): void => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // No file selected yet — empty state.
  if (file === null) {
    return (
      <div className="flex h-full min-h-[20rem] items-center justify-center rounded-xl bg-canvas p-4 text-center">
        <p className="max-w-xs text-sm text-muted">
          Upload a resume to preview the document here exactly as an ATS sees it.
        </p>
      </div>
    );
  }

  // PDF — render the real document in a native viewer.
  if (objectUrl !== null) {
    return (
      <object
        data={objectUrl}
        type="application/pdf"
        title="Resume PDF preview"
        className="h-full min-h-[28rem] w-full rounded-xl bg-canvas"
      >
        <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 rounded-xl bg-canvas p-4 text-center">
          <p className="text-sm text-muted">
            Your browser can&rsquo;t display this PDF inline.
          </p>
          <a
            href={objectUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-accent-blue underline"
          >
            Open {file.name} in a new tab
          </a>
        </div>
      </object>
    );
  }

  // Non-PDF (e.g. .docx) — can't render inline; offer a clear fallback.
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 rounded-xl bg-canvas p-6 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-10 text-muted"
        aria-hidden="true"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
      <p className="max-w-xs text-sm text-muted">
        <span className="font-semibold text-ink">{file.name}</span> can&rsquo;t be
        previewed inline. Upload a PDF to see the rendered document, or scan to
        review the parsed content.
      </p>
    </div>
  );
}
