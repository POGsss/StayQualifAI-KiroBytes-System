/**
 * Shared provider-aware AI failover utility (platform infrastructure).
 *
 * This is the single place that knows how to talk to the supported AI
 * providers and how to fail over across many API credentials. Every module's
 * AI wrapper (`aiProvider.service.ts`, `interview.aiProvider.service.ts`,
 * `upskilling.aiProvider.service.ts`, …) delegates to {@link generateJson} here
 * so that credential discovery, provider routing, error classification,
 * per-attempt timeout, and typed-error normalization live in exactly one place.
 * It lives in `utils/` (platform infra) so module wrappers reuse it WITHOUT
 * importing one another (design "Module Isolation").
 *
 * Providers
 * ---------
 *  - **Gemini** — Google Generative AI SDK (`@google/generative-ai`), JSON mode.
 *  - **Groq**   — OpenAI-compatible REST API (`/openai/v1/chat/completions`),
 *                 JSON mode via `response_format: { type: 'json_object' }`.
 *
 * Credential discovery (provider-bound — a Gemini key is NEVER sent to Groq and
 * vice-versa):
 *  - Gemini: `GEMINI_API_KEYS` (comma list) → `GEMINI_API_KEY`,
 *    `GEMINI_API_KEY1`, `GEMINI_API_KEY2`, `GEMINI_API_KEY_FALLBACK`,
 *    `GEMINI_API_KEY_2`.
 *  - Groq:   `GROQ_API_KEYS` (comma list) → `GROQ_API_KEY`, `GROQ_API_KEY1`,
 *    `GROQ_API_KEY2`, `GROQ_API_KEY3`, `GROQ_API_KEY4`.
 *
 * Provider order defaults to Gemini-before-Groq and can be overridden with
 * `AI_PROVIDER_ORDER` (comma list, e.g. `groq,gemini`). Models default to
 * `gemini-flash-latest` / `llama-3.3-70b-versatile`, overridable via
 * `GEMINI_MODEL` / `GROQ_MODEL`.
 *
 * Failover: each credential is attempted in order. A retryable failure
 * (HTTP 401/403/429/500/502/503, quota/rate-limit messages, network errors,
 * timeouts) rotates to the next credential. A non-retryable failure (HTTP 404,
 * invalid JSON, or schema mismatch) stops immediately — a different key would
 * not help. When every credential is exhausted a typed {@link AiProviderError}
 * is thrown. Secret key values never appear in logs or errors.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';
import type { ZodType } from 'zod';

import { AiProviderError } from './errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types & configuration
// ─────────────────────────────────────────────────────────────────────────────

/** A supported AI provider. */
type Provider = 'gemini' | 'groq';

/** A single discovered credential, bound to exactly one provider. */
interface Credential {
  provider: Provider;
  /** Secret API key value (never logged). */
  key: string;
  /** Non-secret label for logs, e.g. `groq:GROQ_API_KEY2`. */
  source: string;
}

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

/** Gemini single-key env vars, in discovery order (after the comma list). */
const GEMINI_KEY_VARS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY1',
  'GEMINI_API_KEY2',
  'GEMINI_API_KEY_FALLBACK',
  'GEMINI_API_KEY_2',
] as const;

/** Groq single-key env vars, in discovery order (after the comma list). */
const GROQ_KEY_VARS = [
  'GROQ_API_KEY',
  'GROQ_API_KEY1',
  'GROQ_API_KEY2',
  'GROQ_API_KEY3',
  'GROQ_API_KEY4',
] as const;

const GEMINI_LIST_VAR = 'GEMINI_API_KEYS';
const GROQ_LIST_VAR = 'GROQ_API_KEYS';

const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Default request timeout in milliseconds before an attempt is aborted. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** HTTP statuses that warrant retrying the request with the NEXT credential. */
const KEY_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  401, 403, 429, 500, 502, 503,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Credential discovery
// ─────────────────────────────────────────────────────────────────────────────

/** Push trimmed, non-empty entries of a comma-separated env var as credentials. */
function pushListVar(
  out: Credential[],
  provider: Provider,
  varName: string,
): void {
  const raw = process.env[varName];
  if (typeof raw !== 'string') return;
  const parts = raw.split(',');
  for (let i = 0; i < parts.length; i += 1) {
    const trimmed = (parts[i] ?? '').trim();
    if (trimmed.length > 0) {
      out.push({ provider, key: trimmed, source: `${varName}[${i}]` });
    }
  }
}

/** Push a single-key env var as a credential when present and non-empty. */
function pushKeyVar(
  out: Credential[],
  provider: Provider,
  varName: string,
): void {
  const value = process.env[varName];
  if (typeof value === 'string' && value.trim().length > 0) {
    out.push({ provider, key: value.trim(), source: varName });
  }
}

/** Discover the de-duplicated credential list for a single provider. */
function discoverForProvider(provider: Provider): Credential[] {
  const found: Credential[] = [];
  if (provider === 'gemini') {
    pushListVar(found, 'gemini', GEMINI_LIST_VAR);
    for (const name of GEMINI_KEY_VARS) pushKeyVar(found, 'gemini', name);
  } else {
    pushListVar(found, 'groq', GROQ_LIST_VAR);
    for (const name of GROQ_KEY_VARS) pushKeyVar(found, 'groq', name);
  }

  // De-duplicate by key value, preserving first-seen order.
  const seen = new Set<string>();
  const unique: Credential[] = [];
  for (const cred of found) {
    if (!seen.has(cred.key)) {
      seen.add(cred.key);
      unique.push(cred);
    }
  }
  return unique;
}

/** Resolve provider order from `AI_PROVIDER_ORDER`, defaulting to gemini→groq. */
function resolveProviderOrder(): Provider[] {
  const known: Provider[] = ['gemini', 'groq'];
  const raw = process.env.AI_PROVIDER_ORDER;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return known;
  }
  const requested = raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is Provider => p === 'gemini' || p === 'groq');
  // Append any known provider omitted from the env value, preserving default order.
  const ordered = [...new Set(requested)];
  for (const p of known) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  return ordered;
}

/**
 * Build the full, ordered credential list across all providers. Throws an
 * {@link AiProviderError} when no credentials are configured for any provider.
 */
function discoverCredentials(): Credential[] {
  const credentials: Credential[] = [];
  for (const provider of resolveProviderOrder()) {
    credentials.push(...discoverForProvider(provider));
  }
  if (credentials.length === 0) {
    throw new AiProviderError(
      'The AI provider is not configured. Set GEMINI_API_KEY or GROQ_API_KEY.',
    );
  }
  return credentials;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveModel(provider: Provider): string {
  const envVar = provider === 'gemini' ? 'GEMINI_MODEL' : 'GROQ_MODEL';
  const fallback = provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_GROQ_MODEL;
  const override = process.env[envVar];
  return typeof override === 'string' && override.trim().length > 0
    ? override.trim()
    : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider calls
// ─────────────────────────────────────────────────────────────────────────────

/** Per-key Gemini SDK clients, cached so repeated calls reuse one client. */
const geminiClientCache: Map<string, GoogleGenerativeAI> = new Map();

function getGeminiModel(
  apiKey: string,
  systemInstruction?: string,
): GenerativeModel {
  let client = geminiClientCache.get(apiKey);
  if (client === undefined) {
    client = new GoogleGenerativeAI(apiKey);
    geminiClientCache.set(apiKey, client);
  }
  return client.getGenerativeModel({
    model: resolveModel('gemini'),
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    generationConfig: { responseMimeType: 'application/json' },
  });
}

/** Wrap an abort into a named AbortError so the classifier treats it as a timeout. */
function makeTimeoutError(timeoutMs: number): Error {
  const err = new Error(`The AI provider request timed out after ${timeoutMs}ms.`);
  err.name = 'AbortError';
  return err;
}

/** Issue a Gemini generation, returning the raw response text. */
async function callGemini(
  cred: Credential,
  prompt: string,
  systemInstruction: string | undefined,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const model = getGeminiModel(cred.key, systemInstruction);
    const result = await model.generateContent(
      { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      { signal: controller.signal },
    );
    const text = result.response.text();
    if (text.trim().length === 0) {
      throw new Error('The AI provider returned an empty response.');
    }
    return text;
  } catch (cause: unknown) {
    if (controller.signal.aborted) throw makeTimeoutError(timeoutMs);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** Issue a Groq (OpenAI-compatible) generation, returning the raw response text. */
async function callGroq(
  cred: Credential,
  prompt: string,
  systemInstruction: string | undefined,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (systemInstruction !== undefined) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cred.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModel('groq'),
        messages,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = new Error(`Groq request failed with status ${response.status}.`);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? '';
    if (content.trim().length === 0) {
      throw new Error('The AI provider returned an empty response.');
    }
    return content;
  } catch (cause: unknown) {
    if (controller.signal.aborted) throw makeTimeoutError(timeoutMs);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────

/** Extract an HTTP status from an SDK/fetch error, if present. */
function extractStatus(cause: unknown): number | null {
  if (typeof cause === 'object' && cause !== null && 'status' in cause) {
    const status = (cause as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = /\[(\d{3})\s/.exec(message) ?? /status (\d{3})/.exec(message);
  return match !== null ? Number.parseInt(match[1] as string, 10) : null;
}

/** A failure that may succeed on a different credential/provider. */
function isRetryable(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === 'AbortError') return true;
  const status = extractStatus(cause);
  if (status !== null) {
    if (status === 404) return false; // bad model — deterministic
    if (KEY_RETRYABLE_STATUSES.has(status)) return true;
  }
  const message = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
  return (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('rate-limit') ||
    message.includes('too many requests') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('econn') ||
    message.includes('empty response')
  );
}

/** Normalize any thrown cause into a typed {@link AiProviderError}. */
function toAiProviderError(cause: unknown, timeoutMs: number): AiProviderError {
  if (cause instanceof AiProviderError) return cause;
  const message =
    cause instanceof Error && cause.name === 'AbortError'
      ? `The AI provider request timed out after ${timeoutMs}ms.`
      : 'The AI provider request failed.';
  return new AiProviderError(message, cause);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse + validate
// ─────────────────────────────────────────────────────────────────────────────

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause: unknown) {
    throw new AiProviderError(
      'The AI provider returned a response that was not valid JSON.',
      cause,
    );
  }
}

function validate<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      'The AI provider returned a response in an unexpected shape.',
      result.error.format(),
    );
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a structured prompt to the configured AI providers, request JSON output,
 * parse it, and validate it against `schema`, failing over across every
 * configured credential (Gemini then Groq by default).
 *
 * A retryable failure rotates to the next credential; a non-retryable failure
 * (bad model, invalid JSON, schema mismatch) stops immediately. When all
 * credentials are exhausted an {@link AiProviderError} is thrown with the last
 * underlying cause in `details`. Secret key values never appear in logs/errors.
 */
export async function generateJson<T>(params: IGenerateJsonParams<T>): Promise<T> {
  const { prompt, schema, systemInstruction } = params;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const credentials = discoverCredentials();

  let lastError: unknown;
  for (let i = 0; i < credentials.length; i += 1) {
    const cred = credentials[i] as Credential;
    const isLast = i === credentials.length - 1;
    try {
      const rawText =
        cred.provider === 'gemini'
          ? await callGemini(cred, prompt, systemInstruction, timeoutMs)
          : await callGroq(cred, prompt, systemInstruction, timeoutMs);
      const parsed = parseJson(rawText); // non-retryable on failure
      return validate(schema, parsed); // non-retryable on failure
    } catch (cause: unknown) {
      lastError = cause;

      // Parse/schema failures are deterministic — a different key won't help.
      if (cause instanceof AiProviderError) {
        throw cause;
      }

      if (!isLast && isRetryable(cause)) {
        const status = extractStatus(cause);
        // Non-secret diagnostics only: provider + env var name + reason.
        console.warn(
          `[ai-failover] ${cred.source} failed (${status ?? 'no-status'}); rotating to next credential.`,
        );
        continue;
      }
      throw toAiProviderError(cause, timeoutMs);
    }
  }

  // Unreachable in practice (the loop always returns or throws).
  throw toAiProviderError(lastError, timeoutMs);
}
