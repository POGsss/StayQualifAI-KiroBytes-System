/**
 * Upload middleware (Requirements 1.2, 1.3).
 *
 * Parses a single `multipart/form-data` resume upload using `multer` with
 * in-memory storage, then exposes the parsed file to downstream controllers as
 * `req.file`. Two guards run before any parsing/persistence happens:
 *
 *   - A 5 MB maximum file size (a resolved design decision). When exceeded,
 *     multer's `LIMIT_FILE_SIZE` error is translated into a typed
 *     {@link FileTooLargeError} (HTTP 413, Requirement 1.3).
 *   - A `.pdf` / `.docx` extension guard (with a secondary MIME-type check).
 *     Unsupported types are rejected with a typed
 *     {@link UnsupportedFileTypeError} (HTTP 400, Requirement 1.2).
 *
 * All rejections are forwarded via `next(err)` so the centralized error
 * middleware serializes them into the standard `{ data, error, meta }`
 * envelope. The middleware never throws synchronously.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { extname } from 'node:path';

import multer from 'multer';
import type { Request, RequestHandler } from 'express';

import {
  FileTooLargeError,
  UnsupportedFileTypeError,
  ValidationError,
  InternalError,
  isAppError,
} from '../utils/errors.js';

/** Maximum accepted upload size in bytes (5 MB — resolved design decision). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The multipart form field the resume file is expected to arrive under. */
export const UPLOAD_FIELD_NAME = 'file';

/** File extensions accepted by the upload guard (lowercase, dot-prefixed). */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.pdf', '.docx'];

/**
 * MIME types corresponding to the allowed extensions. Used as a secondary,
 * defense-in-depth guard; generic/empty types are tolerated because many
 * browsers and HTTP clients send `application/octet-stream` for uploads.
 */
const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** MIME types that are accepted regardless of the allow-list (too generic to trust). */
const TOLERATED_GENERIC_MIME_TYPES: readonly string[] = ['', 'application/octet-stream'];

/**
 * Rejects any file whose extension is not `.pdf`/`.docx`, with a secondary
 * MIME-type sanity check. Rejection is signalled by passing a typed
 * {@link UnsupportedFileTypeError} to the callback; multer forwards it to the
 * completion callback where it is propagated unchanged.
 */
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const extension: string = extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    cb(
      new UnsupportedFileTypeError(
        `Unsupported file type "${extension || file.originalname}". Only .pdf and .docx files are accepted.`,
        { allowedExtensions: ALLOWED_EXTENSIONS }
      )
    );
    return;
  }

  const mimeType: string = file.mimetype;
  const mimeAccepted: boolean =
    TOLERATED_GENERIC_MIME_TYPES.includes(mimeType) || ALLOWED_MIME_TYPES.includes(mimeType);

  if (!mimeAccepted) {
    cb(
      new UnsupportedFileTypeError(
        `Unsupported file content type "${mimeType}". Only .pdf and .docx files are accepted.`,
        { allowedMimeTypes: ALLOWED_MIME_TYPES }
      )
    );
    return;
  }

  cb(null, true);
}

/**
 * Configured multer parser: in-memory storage so the parsed buffer is
 * available as `req.file.buffer` for the downstream Resume_Parser, with the
 * 5 MB size limit enforced (Requirement 1.3) and the extension guard applied
 * (Requirement 1.2).
 */
const multipartParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
}).single(UPLOAD_FIELD_NAME);

/**
 * Translates a multer / file-filter error into a typed {@link AppError}.
 *
 *   - Errors raised by {@link fileFilter} (already typed) pass through.
 *   - multer's `LIMIT_FILE_SIZE` becomes {@link FileTooLargeError} (413).
 *   - Any other multer error becomes {@link ValidationError} (400) — these are
 *     malformed-request conditions (e.g. unexpected field, too many files).
 *   - Anything else becomes {@link InternalError} (500).
 */
function translateUploadError(err: unknown): Error {
  if (isAppError(err)) {
    return err;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new FileTooLargeError(
        `Uploaded file exceeds the maximum allowed size of ${MAX_UPLOAD_BYTES} bytes (5 MB).`,
        { maxBytes: MAX_UPLOAD_BYTES }
      );
    }
    return new ValidationError(`Malformed file upload: ${err.message}.`, { code: err.code });
  }

  if (err instanceof Error) {
    return new InternalError(err.message);
  }

  return new InternalError('Unexpected error while processing the file upload.');
}

/**
 * Express middleware that parses a single resume file upload and enforces the
 * size and type guards. On success the parsed file is available as `req.file`;
 * on failure a typed error is forwarded to the centralized error middleware.
 */
export const uploadResumeFile: RequestHandler = (req, res, next): void => {
  multipartParser(req, res, (err: unknown): void => {
    if (err === undefined || err === null) {
      next();
      return;
    }
    next(translateUploadError(err));
  });
};
