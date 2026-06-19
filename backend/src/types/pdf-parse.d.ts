/**
 * Ambient type declaration for the `pdf-parse` library's internal entry point.
 *
 * The package's top-level `pdf-parse` entry (`index.js`) runs a debug routine
 * at import time that reads a bundled sample PDF from disk when it cannot find
 * a parent module — under Node's ESM/CJS interop this throws an `ENOENT`. We
 * therefore import the implementation module directly
 * (`pdf-parse/lib/pdf-parse.js`), which has no such side effect.
 *
 * The shipped `@types/pdf-parse` only declares the `'pdf-parse'` specifier, so
 * this declaration mirrors the same surface for the subpath we import. No
 * `any` — the loosely-typed `info`/`metadata` fields are exposed as `unknown`.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }

  interface PdfParseOptions {
    max?: number;
    version?: string;
  }

  function pdfParse(dataBuffer: Buffer | Uint8Array, options?: PdfParseOptions): Promise<PdfParseResult>;

  export = pdfParse;
}
