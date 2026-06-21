/**
 * Edge / validation tests for STAR_Story input schemas (interview spec task 9.3).
 *
 * These assert the Zod schemas in `src/routes/interview.schemas.ts` behave
 * exactly as the acceptance criteria require:
 *
 *  - 7.2  Create rejects missing/blank required fields and identifies EVERY
 *         missing or blank field.
 *  - 7.3  A create `title` over 200 chars STOPS validation first: only the
 *         title max-length error is reported, even when other fields are also
 *         invalid.
 *  - 7.4  Create rejects STAR content fields over 2 000 chars and identifies
 *         EVERY over-limit field.
 *  - 9.6  An update supplying none of the five fields is rejected.
 *  - 9.2  An update with a blank supplied field is rejected and identifies the
 *         blank field.
 *
 * The tests use `safeParse` and assert on the resulting issue `path`s (and the
 * `params.rule` markers the schemas attach) so they verify which field each
 * error targets, not just that validation failed.
 */
import { describe, it, expect } from 'vitest';
import type { ZodIssue } from 'zod';

import {
  createStarSchema,
  updateStarSchema,
  TITLE_MAX_LENGTH,
  STAR_FIELD_MAX_LENGTH,
} from '../src/routes/interview.schemas.js';

/** The leaf field name an issue targets (first path segment), or '' for root. */
function issueField(issue: ZodIssue): string {
  return issue.path.length > 0 ? String(issue.path[0]) : '';
}

/** Set of distinct field names referenced by the issues. */
function issueFields(issues: readonly ZodIssue[]): Set<string> {
  return new Set(issues.map(issueField));
}

/** The `rule` marker the schemas attach to custom issues, when present. */
function issueRule(issue: ZodIssue): string | undefined {
  if (issue.code === 'custom' && issue.params !== undefined) {
    const rule = (issue.params as { rule?: unknown }).rule;
    return typeof rule === 'string' ? rule : undefined;
  }
  return undefined;
}

/** A valid baseline create payload. */
const validCreate = {
  title: 'Led the migration',
  situation: 'The legacy system was failing under load.',
  task: 'I had to design a resilient replacement.',
  action: 'I led a phased migration with feature flags.',
  result: 'Throughput doubled with zero downtime.',
};

describe('createStarSchema — Requirement 7.2 (missing/blank required fields)', () => {
  it('accepts a fully populated, valid payload', () => {
    const result = createStarSchema.safeParse(validCreate);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validCreate);
    }
  });

  it('identifies every blank field (empty string / whitespace only)', () => {
    const result = createStarSchema.safeParse({
      title: '   ',
      situation: '',
      task: '\t\n',
      action: 'real action',
      result: 'real result',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issueFields(result.error.issues);
      expect(fields).toEqual(new Set(['title', 'situation', 'task']));
      // The valid fields are not flagged.
      expect(fields.has('action')).toBe(false);
      expect(fields.has('result')).toBe(false);
    }
  });

  it('identifies every absent field', () => {
    // Only `title` supplied; the other four are missing entirely.
    const result = createStarSchema.safeParse({ title: 'Only a title' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issueFields(result.error.issues);
      expect(fields).toEqual(
        new Set(['situation', 'task', 'action', 'result'])
      );
    }
  });
});

describe('createStarSchema — Requirement 7.3 (title > 200 stops validation first)', () => {
  it('reports ONLY the title max-length error even when other fields are invalid', () => {
    const result = createStarSchema.safeParse({
      title: 'x'.repeat(TITLE_MAX_LENGTH + 1),
      situation: '', // also blank
      task: '', // also blank
      action: 'z'.repeat(STAR_FIELD_MAX_LENGTH + 1), // also too long
      result: '', // also blank
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // First-stop: a single issue, on `title`, for max length.
      expect(result.error.issues).toHaveLength(1);
      const [issue] = result.error.issues;
      expect(issueField(issue)).toBe('title');
      expect(issueRule(issue)).toBe('maxLength');
    }
  });

  it('accepts a title of exactly the maximum length', () => {
    const result = createStarSchema.safeParse({
      ...validCreate,
      title: 'x'.repeat(TITLE_MAX_LENGTH),
    });

    expect(result.success).toBe(true);
  });
});

describe('createStarSchema — Requirement 7.4 (STAR field > 2000 identified)', () => {
  it('identifies each STAR content field that exceeds the limit', () => {
    const result = createStarSchema.safeParse({
      title: 'Valid title',
      situation: 's'.repeat(STAR_FIELD_MAX_LENGTH + 1),
      task: 'valid task',
      action: 'a'.repeat(STAR_FIELD_MAX_LENGTH + 1),
      result: 'r'.repeat(STAR_FIELD_MAX_LENGTH + 5),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const overLimit = result.error.issues.filter(
        (issue) => issueRule(issue) === 'maxLength'
      );
      expect(issueFields(overLimit)).toEqual(
        new Set(['situation', 'action', 'result'])
      );
      // The within-limit field is not flagged.
      expect(issueFields(result.error.issues).has('task')).toBe(false);
    }
  });

  it('accepts STAR content fields at exactly the maximum length', () => {
    const result = createStarSchema.safeParse({
      title: 'Valid title',
      situation: 's'.repeat(STAR_FIELD_MAX_LENGTH),
      task: 't'.repeat(STAR_FIELD_MAX_LENGTH),
      action: 'a'.repeat(STAR_FIELD_MAX_LENGTH),
      result: 'r'.repeat(STAR_FIELD_MAX_LENGTH),
    });

    expect(result.success).toBe(true);
  });
});

describe('updateStarSchema — Requirement 9.6 (update with no supplied fields)', () => {
  it('rejects an empty update body', () => {
    const result = updateStarSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      const [issue] = result.error.issues;
      expect(issueRule(issue)).toBe('atLeastOneField');
    }
  });

  it('accepts an update supplying a single valid field', () => {
    const result = updateStarSchema.safeParse({ title: 'Renamed story' });

    expect(result.success).toBe(true);
    if (result.success) {
      // Only the supplied field is present in the narrowed patch.
      expect(result.data).toEqual({ title: 'Renamed story' });
    }
  });
});

describe('updateStarSchema — Requirement 9.2 (blank supplied update field rejected)', () => {
  it('rejects a supplied field that is blank and identifies it', () => {
    const result = updateStarSchema.safeParse({ situation: '   ' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issueFields(result.error.issues);
      expect(fields).toEqual(new Set(['situation']));
      expect(result.error.issues.every((i) => issueRule(i) === 'blank')).toBe(
        true
      );
    }
  });

  it('identifies every blank supplied field while ignoring absent ones', () => {
    const result = updateStarSchema.safeParse({
      title: 'Valid title',
      situation: '',
      action: '\n\t ',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const blanks = result.error.issues.filter(
        (issue) => issueRule(issue) === 'blank'
      );
      expect(issueFields(blanks)).toEqual(new Set(['situation', 'action']));
      // The supplied valid field and the absent fields are not flagged.
      expect(issueFields(result.error.issues).has('title')).toBe(false);
    }
  });
});
