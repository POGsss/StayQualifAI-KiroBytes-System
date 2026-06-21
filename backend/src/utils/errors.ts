/**
 * Shared typed error hierarchy for the backend.
 *
 * The centralized error middleware (`middleware/error.ts`) maps any
 * {@link AppError} to the `{ data, error, meta }` envelope using its
 * `type` discriminator and `httpStatus`.
 *
 * NOTE: This module is authored across tasks 4.1 (full hierarchy) and 5.1
 * (serializer). It currently provides the base {@link AppError}, the
 * {@link isAppError} guard, the errors consumed by the existing middleware
 * (`InternalError`, `NotFoundError`), and the serializer error
 * (`DeserializationError`). Task 4.1 extends this with the remaining typed
 * errors (`ValidationError`, `UnsupportedFileTypeError`, `FileTooLargeError`,
 * `ParseError`, `AuthError`, `AiProviderError`).
 *
 * Named exports only. No `any`.
 */
import type { IApiError } from '../types/resume.types.js';

/**
 * Base class for all typed application errors.
 *
 * Carries the wire `type` discriminator and the `httpStatus` the error
 * middleware uses when serializing to the API envelope.
 */
export abstract class AppError extends Error {
  /** Stable, serializable discriminator surfaced in the API error envelope. */
  public abstract readonly type: string;

  /** HTTP status code the error middleware responds with. */
  public abstract readonly httpStatus: number;

  /** Optional structured details for debugging / client display. */
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    // Preserve the concrete subclass name on the error instance.
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
    // Restore the prototype chain (required when extending the built-in Error
    // with ES2022 class output).
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Serialize this error into the standard API error shape. */
  public toApiError(): IApiError {
    return {
      type: this.type,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/** Type guard narrowing an unknown thrown value to a typed {@link AppError}. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Raised when a stored representation cannot be deserialized back into a
 * well-formed domain object (e.g. missing required fields or wrong shape).
 *
 * Maps to HTTP 422 (Requirement 2.4).
 */
export class DeserializationError extends AppError {
  public readonly type = 'DeserializationError';
  public readonly httpStatus = 422;
}

/**
 * Raised when a requested resource is absent or not owned by the caller.
 * Ownership failures intentionally surface as not-found to avoid leaking the
 * existence of other users' data.
 *
 * Maps to HTTP 404 (Requirements 8.3, 9.3, 10.4, 11.3).
 */
export class NotFoundError extends AppError {
  public readonly type = 'NotFoundError';
  public readonly httpStatus = 404;
}

/**
 * Fallback error for unexpected failures. Maps to HTTP 500.
 */
export class InternalError extends AppError {
  public readonly type = 'InternalError';
  public readonly httpStatus = 500;
}

/**
 * Raised when request body/params/query fail validation, or a required input
 * is missing (e.g. missing JD, empty name, empty experience, missing required
 * section).
 *
 * Maps to HTTP 400 (Requirements 1.2, 1.3, 4.4, 5.4, 6.3, 7.3, 9.2, 11.4).
 */
export class ValidationError extends AppError {
  public readonly type = 'ValidationError';
  public readonly httpStatus = 400;
}

/**
 * Raised when an uploaded file's extension is not `.pdf` or `.docx`.
 *
 * Maps to HTTP 400 (Requirement 1.2).
 */
export class UnsupportedFileTypeError extends AppError {
  public readonly type = 'UnsupportedFileTypeError';
  public readonly httpStatus = 400;
}

/**
 * Raised when an uploaded file exceeds the 5 MB size limit.
 *
 * Maps to HTTP 413 (Requirement 1.3).
 */
export class FileTooLargeError extends AppError {
  public readonly type = 'FileTooLargeError';
  public readonly httpStatus = 413;
}

/**
 * Raised when a `.pdf`/`.docx` file cannot be parsed into a structured resume.
 *
 * Maps to HTTP 422 (Requirement 1.4).
 */
export class ParseError extends AppError {
  public readonly type = 'ParseError';
  public readonly httpStatus = 422;
}

/**
 * Raised when a request carries a missing or invalid Supabase JWT.
 *
 * Maps to HTTP 401 (Requirement 11.2).
 */
export class AuthError extends AppError {
  public readonly type = 'AuthError';
  public readonly httpStatus = 401;
}

/**
 * Raised when the AI provider (Gemini) is unavailable, errors, times out, or
 * returns malformed output. Isolates provider internals from clients.
 *
 * Maps to HTTP 502 (Requirements 6.4, 7.4).
 */
export class AiProviderError extends AppError {
  public readonly type = 'AiProviderError';
  public readonly httpStatus = 502;
}

/**
 * Raised when a duplicate resource conflict is detected — e.g. a user tries
 * to add a listing that already exists in their application tracker.
 *
 * Maps to HTTP 409 (Requirement 4.4).
 */
export class ConflictError extends AppError {
  public readonly type = 'ConflictError';
  public readonly httpStatus = 409;
}
