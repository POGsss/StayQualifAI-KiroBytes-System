/**
 * Interview module-local AI_Provider wrapper — Requirements 2.4, 4.5, 5.12.
 *
 * The Interview module's single point of contact with the AI providers. It
 * delegates to the shared, provider-aware failover utility in
 * `utils/aiFailover.ts` (platform infrastructure) so credential discovery,
 * provider routing (Gemini + Groq), error classification, per-attempt timeout,
 * and typed `AiProviderError` normalization live in exactly one place — reused
 * across modules WITHOUT importing another module's AI wrapper (design "Module
 * Isolation").
 *
 * The public surface (`generateJson`, `IGenerateJsonParams`) is unchanged, so
 * the Question_Generator, Answer_Evaluator, and Scorecard_Engine callers need
 * no modification.
 *
 * Named exports only. Explicit return types. No `any`.
 */
export { generateJson } from '../utils/aiFailover.js';
export type { IGenerateJsonParams } from '../utils/aiFailover.js';
