/**
 * Interview module-local AI_Provider (Gemini) wrapper — Requirements 2.4, 4.5, 5.12.
 *
 * This file is the SINGLE point of contact with Google Gemini for the Interview
 * module. It deliberately does **not** import Module 1's
 * `services/aiProvider.service.ts`; instead it reuses the *same pattern*
 * (lazy client init, JSON-mode generation, Zod validation, `AbortController`
 * timeout, failure → `AiProviderError`) so that the Interview module performs
 * no cross-module imports (design "Module Isolation").
 *
 * Failure contract
 * ----------------
 * ANY failure mode is translated into a typed {@link AiProviderError} so callers
 * (Question_Generator, Answer_Evaluator, Scorecard_Engine) can satisfy
 * Requirements 2.4 / 4.5 / 5.12 uniformly without knowing Gemini internals:
 *   - missing API key (invoked without configuration),
 *   - network error / fetch failure,
 *   - request timeout (enforced via {@link AbortController}, default 30 s),
 *   - quota / rate-limit / HTTP errors surfaced by the SDK,
 *   - empty or non-text response,
 *   - response that is not valid JSON,
 *   - response that does not satisfy the caller-supplied Zod schema.
 *
 * The original cause is preserved in {@link AiProviderError.details} for
 * debugging while the public message stays provider-agnostic.
 *
 * Configuration
 * -------------
 * The API key is read from the `GEMINI_API_KEY` environment variable and is
 * NEVER hardcoded. The client is lazily initialized so importing this module
 * never throws when the key is absent; a missing key only fails an actual
 * {@link generateJson} invocation (as an `AiProviderError`).
 *
 * Named exports only. Explicit return types. No `any` — generics and `unknown`.
 */
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';
import type { ZodType } from 'zod';

import { AiProviderError } from '../utils/errors.js';

/** Environment variable that holds the Gemini API key. Never hardcode the key. */
const API_KEY_ENV_VAR = 'GEMINI_API_KEY';

/** Free-tier Gemini model used for all structured generation. */
const MODEL_NAME = 'gemini-1.5-flash';

/** Default request timeout in milliseconds before the call is aborted. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Parameters accepted by {@link generateJson}. */
export interface IGenerateJsonParams<T> {
  /** The user/content prompt sent to the model. */
  prompt: string;
  /** Zod schema the parsed JSON response must satisfy. */
  schema: ZodType<T>;
  /** Optional system instruction steering the model's behavior. */
  systemInstruction?: string;
  /** Optional per-call timeout override in milliseconds. Defaults to 30_000. */
  timeoutMs?: number;
}

/**
 * Lazily-constructed singleton SDK client. Kept module-private so the key is
 * read at first use rather than at import time.
 */
let cachedClient: GoogleGenerativeAI | undefined;

/**
 * Resolve the Gemini API key from the environment, or throw an
 * {@link AiProviderError} when it is absent. Callers map this uniformly per
 * Requirements 2.4 / 4.5 / 5.12.
 */
function requireApiKey(): string {
  const key: string | undefined = process.env[API_KEY_ENV_VAR];
  if (key === undefined || key.trim().length === 0) {
    throw new AiProviderError(
      'The AI provider is not configured. Set the GEMINI_API_KEY environment variable.'
    );
  }
  return key;
}

/**
 * Lazily build (and cache) the SDK client. Importing this module never triggers
 * client construction, so an absent key only fails an actual invocation.
 */
function getClient(): GoogleGenerativeAI {
  if (cachedClient === undefined) {
    cachedClient = new GoogleGenerativeAI(requireApiKey());
  }
  return cachedClient;
}

/**
 * Build a model configured to return JSON. `responseMimeType` instructs Gemini
 * to emit a JSON document rather than free-form prose.
 */
function getModel(systemInstruction?: string): GenerativeModel {
  return getClient().getGenerativeModel({
    model: MODEL_NAME,
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
}

/**
 * Send a structured prompt to Gemini, request JSON output, parse it, and
 * validate it against `schema`.
 *
 * On success the parsed, schema-validated value of type `T` is returned. On ANY
 * failure (missing key, network, timeout, quota, empty/non-text response,
 * invalid JSON, or schema mismatch) an {@link AiProviderError} is thrown with
 * the original cause attached in `details`.
 */
export async function generateJson<T>(
  params: IGenerateJsonParams<T>
): Promise<T> {
  const { prompt, schema, systemInstruction } = params;
  const timeoutMs: number =
    params.timeoutMs !== undefined ? params.timeoutMs : DEFAULT_TIMEOUT_MS;

  const model: GenerativeModel = getModel(systemInstruction);

  const rawText: string = await requestText(model, prompt, timeoutMs);
  const parsed: unknown = parseJson(rawText);
  return validate(schema, parsed);
}

/**
 * Issue the generation request with an {@link AbortController}-based timeout and
 * extract the response text. Network errors, timeouts, quota/HTTP errors, and
 * empty responses are all normalized to {@link AiProviderError}.
 */
async function requestText(
  model: GenerativeModel,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const result = await model.generateContent(
      { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      { signal: controller.signal }
    );

    const text: string = result.response.text();
    if (text.trim().length === 0) {
      throw new AiProviderError('The AI provider returned an empty response.');
    }
    return text;
  } catch (cause: unknown) {
    // Re-throw our own typed error untouched (e.g. the empty-response case).
    if (cause instanceof AiProviderError) {
      throw cause;
    }
    const aborted: boolean = controller.signal.aborted;
    const message: string = aborted
      ? `The AI provider request timed out after ${timeoutMs}ms.`
      : 'The AI provider request failed.';
    throw new AiProviderError(message, cause);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse model output as JSON. A malformed document is treated as a provider
 * failure (Requirements 2.4 / 4.5 / 5.12).
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause: unknown) {
    throw new AiProviderError(
      'The AI provider returned a response that was not valid JSON.',
      cause
    );
  }
}

/**
 * Validate parsed JSON against the caller-supplied Zod schema. A schema
 * mismatch is treated as a provider failure so callers map it uniformly.
 */
function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      'The AI provider returned a response in an unexpected shape.',
      result.error.format()
    );
  }
  return result.data;
}
