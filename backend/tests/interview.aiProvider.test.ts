/**
 * Unit tests for the module-local Gemini wrapper failure mapping
 * (interview spec task 3.2).
 *
 * Requirements: 2.4, 4.5, 5.12 — every AI failure mode (network error,
 * timeout, empty response, invalid JSON, schema-validation failure) MUST be
 * translated into a typed `AiProviderError` so callers never see Gemini
 * internals. A successful, schema-conforming response returns the parsed value.
 *
 * The `@google/generative-ai` SDK is mocked so `generateContent` /
 * `response.text()` can be driven per test. The mock factory references a
 * hoisted `vi.fn()` (`mockGenerateContent`) so each test reconfigures the
 * single Gemini contact point in isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';

import { generateJson } from '../src/services/interview.aiProvider.service.js';
import { AiProviderError } from '../src/utils/errors.js';

// Hoisted so the (also hoisted) vi.mock factory can close over it.
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

/** Minimal schema used by the success / schema-failure cases. */
const personSchema = z.object({ name: z.string() });

/** Build a fake Gemini result whose `response.text()` yields `text`. */
function fakeResult(text: string): { response: { text: () => string } } {
  return { response: { text: (): string => text } };
}

describe('interview AI wrapper — generateJson failure mapping', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    // The lazy client reads this on first construction; keep it set so the
    // wrapper exercises the real generation path rather than the missing-key
    // guard.
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps a network error (generateContent rejects) to AiProviderError', async () => {
    mockGenerateContent.mockRejectedValue(new Error('fetch failed'));

    await expect(
      generateJson({ prompt: 'hi', schema: personSchema })
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('maps a request timeout (AbortController fires) to AiProviderError', async () => {
    // Never settle on its own; reject only when the wrapper aborts the signal.
    mockGenerateContent.mockImplementation(
      (_req: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = opts?.signal;
          if (signal !== undefined) {
            signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted'));
            });
          }
        })
    );

    // Tiny timeout keeps the test fast and guarantees it cannot hang.
    const error = await generateJson({
      prompt: 'hi',
      schema: personSchema,
      timeoutMs: 10,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).message).toContain('timed out');
  });

  it('maps an empty response to AiProviderError', async () => {
    mockGenerateContent.mockResolvedValue(fakeResult('   '));

    await expect(
      generateJson({ prompt: 'hi', schema: personSchema })
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('maps invalid (non-JSON) output to AiProviderError', async () => {
    mockGenerateContent.mockResolvedValue(fakeResult('not json at all {'));

    await expect(
      generateJson({ prompt: 'hi', schema: personSchema })
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('maps a schema-validation failure (valid JSON, wrong shape) to AiProviderError', async () => {
    mockGenerateContent.mockResolvedValue(
      fakeResult(JSON.stringify({ unexpected: true }))
    );

    await expect(
      generateJson({ prompt: 'hi', schema: personSchema })
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('returns the parsed value for a valid, schema-conforming JSON response', async () => {
    mockGenerateContent.mockResolvedValue(
      fakeResult(JSON.stringify({ name: 'Ada' }))
    );

    const result = await generateJson({ prompt: 'hi', schema: personSchema });

    expect(result).toEqual({ name: 'Ada' });
  });
});
