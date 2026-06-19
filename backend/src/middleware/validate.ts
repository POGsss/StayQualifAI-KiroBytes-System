/**
 * Request validation middleware.
 *
 * Builds an Express {@link RequestHandler} that validates the request `body`,
 * `params`, and/or `query` against per-route Zod schemas (Requirement 11.4).
 * Each provided part is parsed independently; on success the parsed (and thus
 * coerced/defaulted) value is written back onto the request so downstream
 * controllers consume normalized data. On the first failing part the handler
 * forwards a typed {@link ValidationError} carrying the flattened Zod issues as
 * `details`, so the centralized error middleware (`middleware/error.ts`)
 * serializes it into the standard `{ data: null, error, meta }` envelope.
 *
 * Validation runs before any business logic, so malformed requests never reach
 * the service layer or the database.
 *
 * Named exports only. No `any`.
 *
 * Requirements: 11.4
 */

import type { Request, RequestHandler, Response, NextFunction } from 'express';
import type { ZodError, ZodType } from 'zod';

import { ValidationError } from '../utils/errors.js';

/**
 * The request parts that can be validated. Each schema is optional; only the
 * parts supplied are parsed. `ZodType<unknown>` accepts any Zod schema while
 * keeping the input type as `unknown` (never `any`).
 */
export interface IValidationSchemas {
  /** Schema applied to `req.body`. */
  readonly body?: ZodType<unknown>;
  /** Schema applied to `req.params`. */
  readonly params?: ZodType<unknown>;
  /** Schema applied to `req.query`. */
  readonly query?: ZodType<unknown>;
}

/** Mutable view of the request parts this middleware may overwrite. */
type ValidatableRequest = Request & {
  body: unknown;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
};

/** The names of the request parts that can be validated. */
type RequestPart = keyof IValidationSchemas;

/**
 * Shapes a Zod validation failure into the structured `details` payload carried
 * by {@link ValidationError}. `fieldErrors` are namespaced by request part
 * (e.g. `body.name`) so a caller can tell which part failed.
 */
function toValidationDetails(
  part: RequestPart,
  error: ZodError
): { part: RequestPart; issues: ZodError['issues'] } {
  return { part, issues: error.issues };
}

/**
 * Creates request validation middleware for the supplied per-part Zod schemas.
 *
 * @param schemas - Optional Zod schemas keyed by request part (`body`,
 *   `params`, `query`). Parts without a schema are left untouched.
 * @returns An Express {@link RequestHandler} that validates the request and
 *   either writes the parsed values back onto the request and calls `next()`,
 *   or forwards a {@link ValidationError} on the first failing part.
 */
export function validate(schemas: IValidationSchemas): RequestHandler {
  const parts: readonly RequestPart[] = ['params', 'query', 'body'];

  return (req: Request, _res: Response, next: NextFunction): void => {
    const request = req as ValidatableRequest;

    for (const part of parts) {
      const schema = schemas[part];
      if (schema === undefined) {
        continue;
      }

      const result = schema.safeParse(request[part]);
      if (!result.success) {
        next(
          new ValidationError(
            `Request ${part} failed validation`,
            toValidationDetails(part, result.error)
          )
        );
        return;
      }

      // Write the parsed value back so downstream handlers receive the
      // coerced/defaulted output rather than the raw input.
      request[part] = result.data as ValidatableRequest[typeof part];
    }

    next();
  };
}
