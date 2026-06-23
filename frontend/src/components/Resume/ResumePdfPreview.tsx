/**
 * ResumePdfPreview — a custom PDF viewer (powered by pdf.js) that renders the
 * uploaded resume one page at a time onto a canvas. The page is drawn at the
 * document's native aspect ratio, so the rendered page's height adjusts to the
 * real PDF page height rather than being forced into a fixed box.
 *
 * Only a single page is shown at a time; the toolbar exposes prev/next page
 * navigation. The whole thing is wrapped in {@link ResumeDocumentFrame} so it
 * looks identical to the Builder's document preview.
 *
 * Non-PDF files (e.g. `.docx`) cannot be rasterized inline, so a clear fallback
 * with a download link is shown. With no file selected, an empty-state hint is
 * rendered inside the same frame.
 *
 * Named exports only. No `any`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
// Vite resolves this to a hashed asset URL for the pdf.js worker.
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { DocumentPageNav, ResumeDocumentFrame } from './ResumeDocumentFrame';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

/** Hard cap on the rendered page width (CSS px) to match the Builder page. */
const MAX_PAGE_WIDTH = 800;

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
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNum, setPageNum] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  // ── Load the document whenever the selected file changes ────────────────
  useEffect(() => {
    setDoc(null);
    setNumPages(0);
    setPageNum(1);
    setLoadError(null);
    setDownloadUrl(null);

    if (file === null) {
      return undefined;
    }

    // Non-PDF: provide a download link instead of rasterizing.
    if (!isPdf(file)) {
      const url = URL.createObjectURL(file);
      setDownloadUrl(url);
      return (): void => {
        URL.revokeObjectURL(url);
      };
    }

    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;

    void (async (): Promise<void> => {
      try {
        const data = await file.arrayBuffer();
        if (cancelled) {
          return;
        }
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        loaded = pdf;
        setDoc(pdf);
        setNumPages(pdf.numPages);
        setPageNum(1);
      } catch {
        if (!cancelled) {
          setLoadError('This PDF could not be rendered.');
        }
      }
    })();

    return (): void => {
      cancelled = true;
      if (loaded !== null) {
        void loaded.destroy();
      }
    };
  }, [file]);

  // ── Render the current page (re-runs on page change / resize) ───────────
  const renderPage = useCallback(async (): Promise<void> => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (doc === null || canvas === null || container === null) {
      return;
    }

    // Cancel any in-flight render before starting a new one.
    if (renderTaskRef.current !== null) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const page = await doc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(
      container.clientWidth || MAX_PAGE_WIDTH,
      MAX_PAGE_WIDTH,
    );
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const dpr = window.devicePixelRatio || 1;
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }

    // Backing store at device resolution for crisp text; CSS size at the
    // page's native aspect ratio so the height tracks the real PDF page.
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const task = page.render({
      canvasContext: context,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    renderTaskRef.current = task;

    try {
      await task.promise;
    } catch {
      // Render was cancelled/superseded — safe to ignore.
    } finally {
      if (renderTaskRef.current === task) {
        renderTaskRef.current = null;
      }
    }
  }, [doc, pageNum]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  // Re-render on container resize so the page always fits the column width.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      void renderPage();
    });
    observer.observe(container);
    return (): void => {
      observer.disconnect();
    };
  }, [renderPage]);

  const goPrev = useCallback((): void => {
    setPageNum((current) => Math.max(1, current - 1));
  }, []);
  const goNext = useCallback((): void => {
    setPageNum((current) => Math.min(numPages, current + 1));
  }, [numPages]);

  // ── Empty state (matches the Builder's gray, dashed empty state) ─────────
  if (file === null) {
    return (
      <div className="no-print flex min-h-[30rem] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-3 size-12 text-muted"
          aria-hidden="true"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
        </svg>
        <p className="text-sm font-semibold text-ink">No Resume Uploaded</p>
        <p className="mt-1 max-w-[250px] text-xs text-muted">
          Upload a resume to preview the document here exactly as an ATS sees it.
        </p>
      </div>
    );
  }

  // ── Non-PDF fallback (e.g. .docx) ────────────────────────────────────────
  if (downloadUrl !== null) {
    return (
      <ResumeDocumentFrame toolbarLeft={<DocumentPageNav page={1} total={1} />}>
        <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 border border-gray-300 bg-white p-6 text-center shadow-sm">
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
            <span className="font-semibold text-ink">{file.name}</span>{' '}
            can&rsquo;t be previewed inline. Upload a PDF to see the rendered
            document, or scan to review the parsed content.
          </p>
          <a
            href={downloadUrl}
            download={file.name}
            className="text-sm font-semibold text-accent-blue underline"
          >
            Download {file.name}
          </a>
        </div>
      </ResumeDocumentFrame>
    );
  }

  // ── PDF render error ─────────────────────────────────────────────────────
  if (loadError !== null) {
    return (
      <ResumeDocumentFrame toolbarLeft={<DocumentPageNav page={1} total={1} />}>
        <div className="flex min-h-[20rem] flex-col items-center justify-center gap-2 border border-gray-300 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink">{loadError}</p>
          <p className="max-w-xs text-xs text-muted">
            The file may be corrupted or password-protected.
          </p>
        </div>
      </ResumeDocumentFrame>
    );
  }

  // ── PDF — one page at a time on a canvas ─────────────────────────────────
  return (
    <ResumeDocumentFrame
      toolbarLeft={
        <DocumentPageNav
          page={pageNum}
          total={numPages}
          onPrev={goPrev}
          onNext={goNext}
        />
      }
    >
      <div ref={containerRef} className="flex w-full justify-center">
        <canvas
          ref={canvasRef}
          aria-label={`Resume PDF preview, page ${pageNum} of ${Math.max(numPages, 1)}`}
          className="block max-w-full border border-gray-300 bg-white shadow-sm"
        />
      </div>
    </ResumeDocumentFrame>
  );
}
