# Requirements Document

## Introduction

This feature makes the backend's AI provider calls resilient by automatically failing over across multiple configured API credentials, and across AI providers (Google Gemini and Groq), whenever a call fails due to a rate limit, quota exhaustion, authentication error, transient server error, network error, or timeout. Today the Interview module's AI wrapper (`backend/src/services/interview.aiProvider.service.ts`) implements partial key rotation, but it (a) does not discover the numbered env vars the team actually uses (`GEMINI_API_KEY1`, `GROQ_API_KEY1`..`GROQ_API_KEY4`), and (b) incorrectly feeds Groq keys to the Google Gemini SDK, which cannot authenticate them. Groq exposes an OpenAI-compatible API and requires a Groq-compatible client and endpoint.

This feature introduces a shared, provider-aware failover pattern that every module's AI wrapper reuses (without cross-module imports, per steering rules). It discovers credentials per provider from the named environment variables (including numbered suffixes and optional comma-separated lists), tries them in a defined order (all credentials within a provider, then the next provider), classifies failures as retryable or non-retryable, enforces a per-attempt timeout, optionally skips credentials recently rate-limited, and surfaces a single typed `AiProviderError` to callers only after every credential is exhausted. The change is backend-only and preserves the existing `AiProviderError` contract that callers rely on; it changes no public API surface.

## Glossary

- **AI_Failover_Wrapper**: The module-local AI provider wrapper that performs provider-aware credential discovery, ordered failover, error classification, per-attempt timeout, and typed error normalization. One instance of this pattern exists per module (interview, resume, upskilling, jobsearch) with no cross-module imports.
- **Provider**: An AI backend the system can call. Supported providers are `Gemini` (Google Generative AI SDK) and `Groq` (OpenAI-compatible API client/endpoint).
- **Gemini**: Google Generative AI provider, accessed via the `@google/generative-ai` SDK using JSON mode (`responseMimeType: application/json`).
- **Groq**: Groq AI provider, accessed via a Groq/OpenAI-compatible client pointed at the Groq endpoint.
- **Credential**: A single API key string associated with exactly one Provider, discovered from an environment variable.
- **Credential_List**: The ordered, de-duplicated sequence of all discovered Credentials across all Providers that a call attempts in turn.
- **Failover_Sequence**: The order in which Credentials are attempted: all of a Provider's Credentials in discovery order, then the next Provider's Credentials, until exhausted.
- **Retryable_Error**: A failure that may succeed on a different Credential or Provider — HTTP 401, 403, 429, 500, 502, 503, quota/rate-limit/"too many requests" messages, network/connection errors, and per-attempt timeouts.
- **Non_Retryable_Error**: A deterministic failure that would recur on every Credential — HTTP 404 (bad/unknown model), invalid-JSON response body, or Zod schema-validation mismatch.
- **Per_Attempt_Timeout**: The maximum duration of a single Credential attempt, enforced via `AbortController` (default 30000 ms), after which that attempt is aborted and treated as a Retryable_Error.
- **Cooldown**: An optional, in-memory period during which a Credential that recently returned a rate-limit/quota error (HTTP 429) is skipped when selecting the next Credential to attempt.
- **AiProviderError**: The shared typed error (`backend/src/utils/errors.ts`, `type: "AiProviderError"`, HTTP 502) thrown to callers when all Credentials are exhausted or a Non_Retryable_Error occurs. Its `message` stays provider-agnostic; the original cause is preserved in `details`.
- **Secret_Value**: The raw text of any Credential. Must never appear in logs, error messages, or error `details`.
- **Credential_Identifier**: A non-secret label for a Credential used in logs (e.g., provider name plus the source env var name, such as `Groq:GROQ_API_KEY2`).

## Requirements

### Requirement 1: Provider-Aware Credential Discovery

**User Story:** As a backend operator, I want the AI wrapper to discover all of my configured keys for each provider from environment variables, so that every key I provide is available for failover without code changes.

#### Acceptance Criteria

1. WHEN an AI generation call begins, THE AI_Failover_Wrapper SHALL discover Gemini Credentials from the environment variables `GEMINI_API_KEY` and `GEMINI_API_KEY1`, evaluating `GEMINI_API_KEY` before `GEMINI_API_KEY1`.
2. WHEN an AI generation call begins, THE AI_Failover_Wrapper SHALL discover Groq Credentials from the environment variables `GROQ_API_KEY`, `GROQ_API_KEY1`, `GROQ_API_KEY2`, `GROQ_API_KEY3`, and `GROQ_API_KEY4`, evaluating them in that listed order.
3. WHERE a comma-separated list environment variable (`GEMINI_API_KEYS` for Gemini, `GROQ_API_KEYS` for Groq) is present and contains at least one non-empty entry after trimming, THE AI_Failover_Wrapper SHALL discover each comma-separated entry as a Credential for the corresponding Provider, in left-to-right order, and SHALL place these Credentials in the Credential_List before the single-key variables for that Provider.
4. WHEN discovering Credentials from any environment variable, THE AI_Failover_Wrapper SHALL trim leading and trailing whitespace from each value and SHALL exclude any value that has zero length after trimming.
5. WHEN assembling the Credential_List for a Provider, THE AI_Failover_Wrapper SHALL remove Credentials whose trimmed value exactly matches an earlier-seen Credential value for that Provider, retaining only the first occurrence and preserving first-seen order.
6. THE AI_Failover_Wrapper SHALL associate each discovered Credential with exactly one Provider, such that a Gemini Credential is only ever sent to the Gemini client and a Groq Credential is only ever sent to the Groq client.
7. IF, after discovery and de-duplication, the Credential_List for a Provider contains zero Credentials, THEN THE AI_Failover_Wrapper SHALL treat that Provider as unavailable for the current call and SHALL NOT send any request to that Provider's client.

### Requirement 2: Ordered Failover Sequence

**User Story:** As a backend operator, I want calls to try my keys and providers in a predictable order, so that failover behavior is deterministic and debuggable.

#### Acceptance Criteria

1. WHEN a provider request is initiated, THE AI_Failover_Wrapper SHALL attempt each Provider in the resolved provider order, and within each Provider SHALL attempt that Provider's discovered Credentials in ascending discovered-index order, exhausting all Credentials of one Provider before advancing to the next Provider.
2. WHERE the `AI_PROVIDER_ORDER` environment variable is absent or resolves to an empty value after trimming, THE AI_Failover_Wrapper SHALL use the default provider order of Gemini before Groq.
3. WHERE the `AI_PROVIDER_ORDER` environment variable is present and non-empty, THE AI_Failover_Wrapper SHALL parse it as a comma-separated list of provider names, treating each name as case-insensitive and trimming leading and trailing whitespace from each name, and SHALL use the resulting recognized names as the provider order.
4. IF `AI_PROVIDER_ORDER` contains a provider name that does not match any known Provider, THEN THE AI_Failover_Wrapper SHALL skip that unrecognized name and continue resolving the order from the remaining names.
5. WHERE `AI_PROVIDER_ORDER` omits one or more known Providers, THE AI_Failover_Wrapper SHALL append each omitted known Provider after the listed Providers, in the default provider order.
6. WHEN a Credential attempt succeeds, THE AI_Failover_Wrapper SHALL return that result and SHALL NOT attempt any remaining Credentials or Providers in the sequence.
7. IF a Credential attempt fails with a Retryable_Error AND at least one un-attempted Credential remains in the Failover_Sequence, THEN THE AI_Failover_Wrapper SHALL continue to the next Credential in the resolved sequence.
8. IF a Credential attempt fails with a Non_Retryable_Error, THEN THE AI_Failover_Wrapper SHALL stop the Failover_Sequence and SHALL surface an error response indicating the non-retryable failure.

### Requirement 3: Error Classification

**User Story:** As a backend developer, I want failures classified as retryable or non-retryable, so that the system rotates credentials only when doing so could help and fails fast otherwise.

#### Acceptance Criteria

1. WHEN a Credential attempt fails with an HTTP response status of 401, 403, 429, 500, 502, or 503, THE AI_Failover_Wrapper SHALL classify the failure as a Retryable_Error.
2. WHEN a Credential attempt fails with an error message that contains "quota", "rate limit", "rate-limit", or "too many requests" anywhere in the message (case-insensitive), THE AI_Failover_Wrapper SHALL classify the failure as a Retryable_Error.
3. WHEN a Credential attempt fails with a network or connection error (including DNS resolution failure, connection refused, connection reset, or socket hang-up), THE AI_Failover_Wrapper SHALL classify the failure as a Retryable_Error.
4. WHEN a Credential attempt is aborted by the Per_Attempt_Timeout, THE AI_Failover_Wrapper SHALL classify the failure as a Retryable_Error.
5. IF a Credential attempt fails with an HTTP response status of 404 indicating the requested model is not found, THEN THE AI_Failover_Wrapper SHALL classify the failure as a Non_Retryable_Error.
6. IF a Credential attempt returns a response body that is not valid JSON, regardless of the HTTP response status, THEN THE AI_Failover_Wrapper SHALL classify the failure as a Non_Retryable_Error.
7. IF a Credential attempt returns JSON that does not satisfy the caller-supplied Zod schema, regardless of the HTTP response status, THEN THE AI_Failover_Wrapper SHALL classify the failure as a Non_Retryable_Error.
8. IF a Credential attempt fails in a way that matches none of the Retryable_Error criteria above, THEN THE AI_Failover_Wrapper SHALL classify the failure as a Non_Retryable_Error.
9. IF a Credential attempt fails with a Non_Retryable_Error, THEN THE AI_Failover_Wrapper SHALL stop the Failover_Sequence and surface the failure without attempting further Credentials.

### Requirement 4: Per-Attempt Timeout

**User Story:** As a backend operator, I want each credential attempt bounded by a timeout, so that one slow provider cannot stall a request indefinitely.

#### Acceptance Criteria

1. WHEN a Credential attempt is issued, THE AI_Failover_Wrapper SHALL start a Per_Attempt_Timeout measured from dispatch of that attempt's request, enforce it using an `AbortController`, and apply a default value of 30000 milliseconds when no caller override is provided.
2. WHERE a caller supplies a per-call timeout override that is an integer between 1 and 600000 milliseconds inclusive, THE AI_Failover_Wrapper SHALL apply the supplied value as the Per_Attempt_Timeout for every Credential attempt in that call.
3. IF a caller supplies a per-call timeout override that is not an integer or falls outside the range 1 to 600000 milliseconds inclusive, THEN THE AI_Failover_Wrapper SHALL reject the call before issuing any Credential attempt and surface an error indicating an invalid timeout value, without mutating the default Per_Attempt_Timeout.
4. WHEN a Credential attempt reaches its Per_Attempt_Timeout before the Provider returns a response, THE AI_Failover_Wrapper SHALL abort that attempt via the `AbortController` and classify the resulting abort as a Retryable_Error eligible for failover to the next Credential.
5. WHEN a Credential attempt is aborted due to the Per_Attempt_Timeout, THE AI_Failover_Wrapper SHALL reset and apply a fresh Per_Attempt_Timeout to each subsequent Credential attempt in the same call.

### Requirement 5: Exhaustion Behavior

**User Story:** As a caller of an AI wrapper, I want a single typed error when every credential has failed, so that I can handle AI failures uniformly without knowing provider internals.

#### Acceptance Criteria

1. WHEN every Credential in the Failover_Sequence (1 to N Credentials, N ≥ 1) has been attempted exactly once and each attempt has failed with a Retryable_Error, THE AI_Failover_Wrapper SHALL throw exactly one `AiProviderError` and SHALL NOT attempt any further Credential.
2. IF zero Credentials are discovered across all configured Providers, THEN THE AI_Failover_Wrapper SHALL throw an `AiProviderError` whose message indicates that the AI provider is not configured, without attempting any AI request.
3. WHEN throwing an `AiProviderError`, THE AI_Failover_Wrapper SHALL set a provider-agnostic message that contains no provider name, Credential value, Credential_Identifier, or other provider internal detail, and SHALL attach the last underlying failure cause in the error `details`.
4. IF no underlying failure cause is available when throwing an `AiProviderError` (for example, the not-configured case), THEN THE AI_Failover_Wrapper SHALL omit the cause from `details` rather than attaching a null or empty value.
5. WHEN exhaustion is caused by a Per_Attempt_Timeout on the final attempted Credential, THE AI_Failover_Wrapper SHALL set the `AiProviderError` message to indicate a timeout and SHALL include the configured timeout duration expressed in milliseconds.
6. WHEN any terminal failure is surfaced to a caller, THE AI_Failover_Wrapper SHALL ensure that failure is an `AiProviderError` whose serialized `type` field equals `"AiProviderError"` and whose mapped HTTP status equals 502, preserving the existing caller contract.

### Requirement 6: Credential Cooldown

**User Story:** As a backend operator, I want a key that just hit its rate limit to be skipped briefly, so that repeated calls do not waste attempts on a credential known to be throttled.

#### Acceptance Criteria

1. WHEN a Credential attempt fails with HTTP status 429 or a rate-limit/quota error response, THE AI_Failover_Wrapper SHALL record that Credential as in Cooldown with a Cooldown-expiry timestamp set to the time of recording plus the configured Cooldown duration.
2. WHILE a Credential's current time is earlier than its Cooldown-expiry timestamp, THE AI_Failover_Wrapper SHALL skip that Credential when selecting the next Credential to attempt, provided at least one Credential in the Failover_Sequence is not in Cooldown.
3. WHERE the environment variable `AI_KEY_COOLDOWN_MS` is present, non-empty, and parses to an integer greater than 0, THE AI_Failover_Wrapper SHALL use its integer value as the Cooldown duration in milliseconds.
4. IF the environment variable `AI_KEY_COOLDOWN_MS` is absent, empty, or does not parse to an integer greater than 0, THEN THE AI_Failover_Wrapper SHALL use a Cooldown duration of 60000 milliseconds.
5. IF every Credential in the Failover_Sequence is in Cooldown, THEN THE AI_Failover_Wrapper SHALL attempt the single Credential whose Cooldown-expiry timestamp is the earliest, rather than failing without an attempt, and SHALL select the earliest-listed Credential in the Failover_Sequence when two or more share the earliest expiry timestamp.
6. WHEN the current time reaches or passes a Credential's Cooldown-expiry timestamp, THE AI_Failover_Wrapper SHALL treat that Credential as eligible for selection again.

### Requirement 7: Observability Without Secret Leakage

**User Story:** As a backend operator, I want logs that show which provider and credential was used and why failover happened, without exposing my keys, so that I can diagnose issues safely.

#### Acceptance Criteria

1. WHEN a Credential attempt is made, THE AI_Failover_Wrapper SHALL emit a log entry containing the Credential_Identifier, the Provider name, and the attempt outcome (success or failure).
2. WHEN a Credential attempt fails and the Failover_Sequence rotates to the next Credential, THE AI_Failover_Wrapper SHALL emit a log entry recording the failing Credential_Identifier, the rotation reason, the failure classification, and the HTTP status or error category that caused rotation.
3. THE AI_Failover_Wrapper SHALL exclude every Secret_Value from all log entries, error messages, and error `details`, including any field nested within structured log payloads or error objects.
4. WHEN constructing a Credential_Identifier, THE AI_Failover_Wrapper SHALL derive it solely from the Provider name and the source environment variable name, and SHALL NOT include any portion or transformation of the Credential value.
5. WHERE a log field or error field would otherwise contain a Secret_Value, THE AI_Failover_Wrapper SHALL replace the value with a redaction marker that indicates a secret was removed without revealing any character of the original value.

### Requirement 8: Per-Provider Model Configurability

**User Story:** As a backend operator, I want to configure the model per provider, so that I can pick the right model for Gemini and Groq independently.

#### Acceptance Criteria

1. WHERE the environment variable `GEMINI_MODEL` is set to a value containing at least one non-whitespace character, THE AI_Failover_Wrapper SHALL use that value (with leading and trailing whitespace removed) as the Gemini model name on every Gemini request.
2. IF the environment variable `GEMINI_MODEL` is absent, empty, or contains only whitespace, THEN THE AI_Failover_Wrapper SHALL use `gemini-flash-latest` as the Gemini model name.
3. WHERE the environment variable `GROQ_MODEL` is set to a value containing at least one non-whitespace character, THE AI_Failover_Wrapper SHALL use that value (with leading and trailing whitespace removed) as the Groq model name on every Groq request.
4. IF the environment variable `GROQ_MODEL` is absent, empty, or contains only whitespace, THEN THE AI_Failover_Wrapper SHALL use the single fixed default Groq model name documented in the project configuration.
5. WHEN issuing a request to the Gemini Provider, THE AI_Failover_Wrapper SHALL set the request's `responseMimeType` to `application/json` so the Provider returns a JSON document.
6. WHEN issuing a request to the Groq Provider, THE AI_Failover_Wrapper SHALL set the request's `response_format` to JSON mode so the Provider returns a JSON document.

### Requirement 9: Consistent Shared Pattern Across Modules

**User Story:** As a backend developer, I want the same failover behavior in every module's AI wrapper, so that resilience is uniform and no module imports another module's code.

#### Acceptance Criteria

1. THE AI_Failover_Wrapper pattern SHALL be applied so that each module routes its AI calls exclusively through its own named wrapper file: the interview module through `interview.aiProvider.service.ts`, the resume module through `aiProvider.service.ts`, the upskilling module through `upskilling.aiProvider.service.ts`, and the jobsearch AI writing path through `jobsearchAiWriter.service.ts`.
2. THE AI_Failover_Wrapper in each module wrapper SHALL implement provider-aware discovery, ordered failover, error classification, a Per_Attempt_Timeout that defaults to 30000 ms when not otherwise configured, a Cooldown that skips a Credential after a Provider response classified as rate-limited (HTTP 429), and typed-error normalization.
3. WHEN any module wrapper is invoked with an identical Credential_List, identical input, and an identical ordered sequence of Provider responses, THE AI_Failover_Wrapper SHALL produce an identical ordered sequence of Credential attempts, an identical per-attempt error classification, and an identical terminal outcome (success result or terminal `AiProviderError`) across all module wrappers.
4. THE AI_Failover_Wrapper in any module wrapper SHALL contain no import statement that references another module's wrapper or service file, such that the absence of cross-module wrapper imports is statically verifiable.
5. THE AI_Failover_Wrapper SHALL consume its shared failover logic from `backend/src/utils/`, reuse the shared `AiProviderError` from `backend/src/utils/errors.ts`, and define no module-specific provider error type.

### Requirement 10: Safe Initialization and Lazy Clients

**User Story:** As a backend developer, I want importing an AI wrapper to never throw when keys are absent, so that the application boots even with incomplete configuration and only fails on an actual call.

#### Acceptance Criteria

1. WHEN an AI wrapper module is imported, THE AI_Failover_Wrapper SHALL complete the import without reading any Credential value and without constructing any Provider client, so that import never throws regardless of whether Credentials are present, absent, or malformed.
2. WHEN a generation call is first made for a given Credential and no cached Provider client exists for that Credential, THE AI_Failover_Wrapper SHALL construct the Provider client for that Credential and store it in an in-memory cache keyed by that Credential.
3. WHEN a generation call is made for a given Credential and a cached Provider client already exists for that Credential, THE AI_Failover_Wrapper SHALL reuse the cached Provider client and SHALL NOT construct a new Provider client for that Credential.
4. IF a generation call is invoked while zero Credentials are configured, THEN THE AI_Failover_Wrapper SHALL terminate that invocation by throwing an `AiProviderError` whose message indicates that no Credentials are configured, SHALL NOT construct any Provider client, and SHALL leave the import-time state unchanged so that the failure occurs only at call time and not at import time.

### Requirement 11: Bounded Total Latency

**User Story:** As a backend operator, I want total request time across all failover attempts to stay bounded, so that a request does not hang far beyond an acceptable limit when many credentials fail.

#### Acceptance Criteria

1. WHILE attempting Credentials in the Failover_Sequence, THE AI_Failover_Wrapper SHALL apply the Per_Attempt_Timeout to each individual attempt and SHALL abort any attempt whose elapsed duration (measured in milliseconds from the start of that attempt) reaches the Per_Attempt_Timeout, treating the aborted attempt as a failed attempt that triggers continuation to the next Credential.
2. WHERE the environment variable `AI_FAILOVER_BUDGET_MS` is present and non-empty, THE AI_Failover_Wrapper SHALL, before initiating each new Credential attempt, compare the cumulative elapsed time across all attempts (measured in milliseconds from the start of the first attempt) against the parsed budget value, and SHALL NOT initiate a new Credential attempt once the cumulative elapsed time is greater than or equal to the budget value.
3. WHERE the environment variable `AI_FAILOVER_BUDGET_MS` is present and non-empty, IF the cumulative elapsed time reaches the budget value before any Credential succeeds, THEN THE AI_Failover_Wrapper SHALL throw an `AiProviderError` indicating failover-budget exhaustion whose `details` preserve the last underlying failure cause, without initiating further attempts.
4. WHERE the environment variable `AI_FAILOVER_BUDGET_MS` is absent or empty, THE AI_Failover_Wrapper SHALL enforce no cumulative budget limit and SHALL bound latency solely by applying the Per_Attempt_Timeout to each attempt across the full Failover_Sequence.
5. IF the environment variable `AI_FAILOVER_BUDGET_MS` is present and non-empty but does not parse to a positive integer (greater than 0) number of milliseconds, THEN THE AI_Failover_Wrapper SHALL reject the configuration by throwing an `AiProviderError` indicating invalid failover-budget configuration before initiating any Credential attempt.
