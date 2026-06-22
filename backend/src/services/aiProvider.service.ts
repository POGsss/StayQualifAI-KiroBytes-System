/**
 * AI_Provider wrapper (Module 1: Resume; also reused by the Job Search AI
 * writer) — Requirements 6.4, 7.4.
 *
 * The single point of contact with the AI providers for this module. It
 * delegates to the shared, provider-aware failover utility in
 * `utils/aiFailover.ts` (platform infrastructure) so credential discovery,
 * provider routing (Gemini + Groq), error classification, per-attempt timeout,
 * and typed `AiProviderError` normalization live in exactly one place.
 *
 * The public surface (`generateJson`, `IGenerateJsonParams`) is unchanged, so
 * the Job_Matcher, Bullet_Generator, and Job Search AI-writer callers need no
 * modification.
 *
 * Named exports only. Explicit return types. No `any`.
 */
export { generateJson } from '../utils/aiFailover.js';
export type { IGenerateJsonParams } from '../utils/aiFailover.js';
