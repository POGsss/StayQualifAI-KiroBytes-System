/**
 * Unit tests for `ConflictError` serialization (interview spec task 1.4).
 *
 * Requirements: 7.5 (answer submitted to an already-answered question →
 * conflict) and 13.3 (duplicate STAR_Story title → conflict).
 *
 * NOTE ON ENVELOPE SHAPE: The interview design.md describes the API error
 * shape as `{ code, message }`. The actual shared platform implementation
 * (`backend/src/utils/errors.ts` + `backend/src/types/resume.types.ts`) uses
 * `type` as the wire discriminator field — i.e. the design's `code` naming
 * maps onto the platform's `type` discriminator. These tests assert against
 * the ACTUAL implemented shape (`{ type, message }`) so they pass against real
 * code; changing the shared shape to `code` would break Module 1 (Resume),
 * which already depends on the `type` discriminator.
 */
import { describe, it, expect } from 'vitest';

import { ConflictError, isAppError } from '../src/utils/errors.js';
import type { IApiError } from '../src/types/resume.types.js';

describe('ConflictError serialization', () => {
  it('toApiError() produces a { code, message } shape (platform discriminator is `type`)', () => {
    const message = 'A STAR_Story with this title already exists';
    const error = new ConflictError(message);

    const apiError: IApiError = error.toApiError();

    // `type` is the platform discriminator that the interview design refers to
    // as `code`.
    expect(apiError.type).toBe('ConflictError');
    expect(apiError.message).toBe(message);
    // Exactly the discriminator + message when no details are supplied.
    expect(Object.keys(apiError).sort()).toEqual(['message', 'type']);
  });

  it('isAppError recognizes a ConflictError instance', () => {
    const error = new ConflictError('answer already submitted');

    expect(isAppError(error)).toBe(true);
  });

  it('maps to HTTP 409 (the status the error middleware responds with)', () => {
    const error = new ConflictError('conflict');

    expect(error.httpStatus).toBe(409);
  });

  it('includes structured details in the serialized error when provided', () => {
    const details = { conflictingTitle: 'Led migration' };
    const error = new ConflictError('duplicate title', details);

    const apiError = error.toApiError();

    expect(apiError.details).toEqual(details);
    expect(apiError.type).toBe('ConflictError');
  });
});
