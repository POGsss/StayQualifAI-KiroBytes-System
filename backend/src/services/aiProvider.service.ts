/**
 * AI_Provider (Gemini) wrapper — Requirements 6.4, 7.4.
 *
 * This module is the SINGLE point of contact with Google Gemini (free tier).
 * Every AI-backed service (`Job_Matcher`, `Bullet_Generator`) goes through
 * {@link generateJson} so that provider concerns — authentication, JSON-shaped
 * output, response parsing, schema validation, timeouts, and failure
 * normalization — live in exactly one place.
 *
 * Failure contract
 * ----------------
 * ANY failure mode is translated into a typed {@link AiProviderError} so callers
 * can satisfy Requirements 6.4 and 7.4 uniformly without knowing anything about
 * Gemini internals:
 *   - missing API key (invoked without configuration),
 *   - network error / fetch failure,
 *   - request timeout (enforced via {@link AbortController}),
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
 * One or more API keys are read from the environment and tried in order,
 * providing fallback across keys to ride out per-key rate limits / quota
 * exhaustion (HTTP 429) without surfacing a failure to the caller. Keys are
 * resolved (in order, de-duplicated) from:
 *   - `GEMINI_API_KEYS`        — optional comma-separated list (highest priority)
 *   - `GEMINI_API_KEY`         — primary key
 *   - `GEMINI_API_KEY_FALLBACK`— secondary key
 *   - `GEMINI_API_KEY_2`       — tertiary key
 * When a generation call fails with a retryable, key-specific error (rate
 * limit / quota / auth / transient server error) and another key is available,
 * the call is retried with the next key. Non-retryable errors (e.g. a 404 for a
 * bad model, an invalid JSON body, or a schema mismatch) are not retried across
 * keys, since a different key would not help.
 *
 * The model is `gemini-flash-latest` by default and can be overridden with the
 * `GEMINI_MODEL` environment variable. (The previously hardcoded
 * `gemini-1.5-flash` was retired by Google and now returns 404.)
 *
 * Keys are never hardcoded. Clients are lazily constructed (and cached per key)
 * so importing this module never throws when keys are absent; a missing key
 * only fails an actual {@link generateJson} invocation (as an `AiProviderError`).
 *
 * Named exports only. Explicit return types. No `any` — generics and `unknown`.
 */
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';
import type { ZodType } from 'zod';

import { AiProviderError } from '../utils/errors.js';

/**
 * Environment variables that may each hold a single Gemini API key, tried in
 * this order after any comma-separated `GEMINI_API_KEYS` entries.
 */
const API_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_FALLBACK',
  'GEMINI_API_KEY_2',
] as const;

/** Optional comma-separated list of keys, resolved before the single-key vars. */
const API_KEYS_ENV_VAR = 'GEMINI_API_KEYS';

/** Environment variable that overrides the default model. */
const MODEL_ENV_VAR = 'GEMINI_MODEL';

/**
 * Default Gemini model. `gemini-flash-latest` is a current, supported flash
 * alias (the old `gemini-1.5-flash` was retired and now 404s on v1beta).
 */
const DEFAULT_MODEL_NAME = 'gemini-flash-latest';

/** Default request timeout in milliseconds before the call is aborted. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** HTTP statuses that warrant retrying the SAME request with the NEXT key. */
const KEY_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  401, // invalid/expired key
  403, // permission denied / key disabled
  429, // rate limit / quota exhausted
  500, // upstream server error
  503, // service unavailable / overloaded
]);

/** Parameters accepted by {@link generateJson}. */
export interface IGenerateJsonParams<T> {
  /** The user/content prompt sent to the model. */
  prompt: string;
  /** Zod schema the parsed JSON response must satisfy. */
  schema: ZodType<T>;
  /** Optional system instruction steering the model's behavior. */
  systemInstruction?: string;
  /** Optional per-call timeout override in milliseconds. */
  timeoutMs?: number;
}

/**
 * Per-key lazily-constructed SDK clients, cached so repeated calls reuse a
 * single client per key. Keyed by the API key string.
 */
const clientCache: Map<string, GoogleGenerativeAI> = new Map();

/**
 * Resolve the ordered, de-duplicated list of Gemini API keys from the
 * environment. Throws an {@link AiProviderError} when none are configured.
 */
function resolveApiKeys(): string[] {
  const keys: string[] = [];

  const multi: string | undefined = process.env[API_KEYS_ENV_VAR];
  if (typeof multi === 'string') {
    for (const part of multi.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        keys.push(trimmed);
      }
    }
  }

  for (const name of API_KEY_ENV_VARS) {
    const value: string | undefined = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      keys.push(value.trim());
    }
  }

  // De-duplicate while preserving order.
  const unique: string[] = [...new Set(keys)];

  if (unique.length === 0) {
    throw new AiProviderError(
      'The AI provider is not configured. Set the GEMINI_API_KEY environment variable.'
    );
  }
  return unique;
}

/** Resolve the model name, honoring the `GEMINI_MODEL` override. */
function resolveModelName(): string {
  const override: string | undefined = process.env[MODEL_ENV_VAR];
  return typeof override === 'string' && override.trim().length > 0
    ? override.trim()
    : DEFAULT_MODEL_NAME;
}

/** Lazily build (and cache) the SDK client for a specific API key. */
function getClient(apiKey: string): GoogleGenerativeAI {
  let client: GoogleGenerativeAI | undefined = clientCache.get(apiKey);
  if (client === undefined) {
    client = new GoogleGenerativeAI(apiKey);
    clientCache.set(apiKey, client);
  }
  return client;
}

/**
 * Build a model (for a given key) configured to return JSON. `responseMimeType`
 * instructs Gemini to emit a JSON document rather than free-form prose.
 */
function getModel(apiKey: string, systemInstruction?: string): GenerativeModel {
  return getClient(apiKey).getGenerativeModel({
    model: resolveModelName(),
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
}

/**
 * Extract an HTTP status code from an SDK error, if present. The
 * `@google/generative-ai` fetch error exposes a numeric `status`; as a fallback
 * the leading `[NNN ...]` code embedded in the message is parsed.
 */
function extractStatus(cause: unknown): number | null {
  if (typeof cause === 'object' && cause !== null && 'status' in cause) {
    const status = (cause as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = /\[(\d{3})\s/.exec(message);
  return match !== null ? Number.parseInt(match[1] as string, 10) : null;
}

/**
 * Decide whether a failed call should be retried with the NEXT API key. Only
 * key-specific / transient errors (rate limit, quota, auth, server) rotate keys;
 * deterministic errors (bad model 404, malformed output) would fail identically
 * on every key, so they are not retried.
 */
function isKeyRetryable(cause: unknown): boolean {
  const status = extractStatus(cause);
  if (status !== null && KEY_RETRYABLE_STATUSES.has(status)) {
    return true;
  }
  const message = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
  return (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

/**
 * Send a structured prompt to Gemini, request JSON output, parse it, and
 * validate it against `schema`.
 *
 * Each configured API key is tried in order: a key-specific / transient failure
 * (rate limit, quota, auth, server error) rotates to the next key, providing
 * fallback to avoid rate limits. On success the parsed, schema-validated value
 * of type `T` is returned. On ANY terminal failure (no keys left, network,
 * timeout, empty/non-text response, invalid JSON, or schema mismatch) an
 * {@link AiProviderError} is thrown with the original cause attached in
 * `details`.
 */
export async function generateJson<T>(params: IGenerateJsonParams<T>): Promise<T> {
  const { prompt, schema, systemInstruction } = params;
  const timeoutMs: number =
    params.timeoutMs !== undefined ? params.timeoutMs : DEFAULT_TIMEOUT_MS;

  const apiKeys: string[] = resolveApiKeys();

  let lastError: unknown;
  for (let i = 0; i < apiKeys.length; i += 1) {
    const apiKey = apiKeys[i] as string;
    const isLastKey = i === apiKeys.length - 1;
    try {
      const model: GenerativeModel = getModel(apiKey, systemInstruction);
      const rawText: string = await requestText(model, prompt, timeoutMs);
      const parsed: unknown = parseJson(rawText);
      return validate(schema, parsed);
    } catch (cause: unknown) {
      lastError = cause;
      // Rotate to the next key only for key-specific / transient failures and
      // only when another key remains; otherwise stop and surface the error.
      if (!isLastKey && isKeyRetryable(cause)) {
        continue;
      }
      throw toAiProviderError(cause, timeoutMs);
    }
  }

  // Unreachable in practice (the loop always returns or throws), but keeps the
  // function total for the type checker.
  throw toAiProviderError(lastError, timeoutMs);
}

/**
 * Normalize any thrown cause into a typed {@link AiProviderError}. An
 * already-typed `AiProviderError` (e.g. the empty-response / invalid-JSON /
 * schema cases) is preserved; an abort surfaces as a timeout message.
 */
function toAiProviderError(cause: unknown, timeoutMs: number): AiProviderError {
  if (cause instanceof AiProviderError) {
    return cause;
  }
  const message =
    cause instanceof Error && cause.name === 'AbortError'
      ? `The AI provider request timed out after ${timeoutMs}ms.`
      : 'The AI provider request failed.';
  return new AiProviderError(message, cause);
}

/**
 * Issue the generation request with an {@link AbortController}-based timeout and
 * extract the response text. Raw SDK/network errors are thrown unwrapped so the
 * caller can decide whether to rotate keys; the empty-response case throws a
 * typed {@link AiProviderError}.
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
    // Normalize an abort into a named AbortError so the caller maps it to a
    // timeout message; otherwise surface the raw cause for key-rotation logic.
    if (controller.signal.aborted) {
      const abortError = new Error(
        `The AI provider request timed out after ${timeoutMs}ms.`
      );
      abortError.name = 'AbortError';
      throw abortError;
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse model output as JSON. A malformed document is treated as a provider
 * failure (Requirements 6.4 / 7.4).
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
