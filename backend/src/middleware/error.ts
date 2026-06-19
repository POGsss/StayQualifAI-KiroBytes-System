/**
 * Centralized Express error-handling middleware.
 *
 * Serializes any thrown typed error (see `utils/errors.ts`) into the standard
 * `{ data: null, error, meta }` envelope (`IApiResponse`) and responds with the
 * error's mapped HTTP status. Unknown / non-typed errors fall back to
 * `InternalError` (500). `meta` always carries a `requestId` and `timestamp`.
 *
 * Requirements: 12.1, 12.3
 */

import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

import type { IApiError, IApiResponse } from '../types/resume.types.js';
import { AppError, InternalError, isAppError } from '../utils/errors.js';

/**
 * Normalizes an unknown thrown value into a typed {@link AppError}. Already
 * typed errors pass through unchanged; anything else becomes an
 * {@link InternalError} so the response status and envelope stay consistent.
 */
function toAppError(err: unknown): AppError {
  if (isAppError(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return new InternalError(message);
}

/**
 * Resolves the request id to surface in `meta`. Honors an upstream
 * `x-request-id` header when present, otherwise generates a UUID.
 */
function resolveRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && header.length > 0 && header[0]) {
    return header[0];
  }
  return randomUUID();
}

/**
 * Express error middleware. Must be registered last (after all routes) and
 * must keep the four-parameter signature so Express recognizes it as an
 * error handler.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If headers are already sent, defer to Express's default handler.
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError: AppError = toAppError(err);
  const error: IApiError = appError.toApiError();

  const body: IApiResponse<null> = {
    data: null,
    error,
    meta: {
      requestId: resolveRequestId(req),
      timestamp: new Date().toISOString(),
    },
  };

  res.status(appError.httpStatus).json(body);
};
