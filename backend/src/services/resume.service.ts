/**
 * Resume service facade (Requirements 1.x–10.x).
 *
 * A thin orchestration layer that the controller calls. It exposes a single,
 * cohesive surface for the Resume module and delegates every operation to the
 * focused component services / utilities that own the business logic:
 *
 *   - Resume_Parser        → {@link parseUpload}, {@link parseUploadFromStorage}
 *   - ATS_Scanner          → {@link scanResume}, {@link suggestKeywords}
 *   - Resume_Builder       → {@link listTemplates}, {@link buildFromTemplate}
 *   - Version_Manager      → {@link saveVersion}, {@link cloneVersion},
 *                            {@link renameVersion}, {@link listVersions},
 *                            {@link setActiveVersion}
 *   - Job_Matcher          → {@link matchJob}
 *   - Bullet_Generator     → {@link generateBullets}
 *
 * This module contains NO business logic of its own — it only re-orders and
 * forwards arguments. Typed errors thrown by the component services
 * (`ParseError`, `ValidationError`, `NotFoundError`, `AiProviderError`,
 * `DeserializationError`, `InternalError`) propagate unchanged to the
 * centralized error middleware.
 *
 * Authentication and tenancy: every operation that touches the database or
 * storage threads the per-request, RLS-scoped Supabase client (`req.supabase`)
 * and, where ownership matters, the authenticated `userId`. The representative
 * signatures in design.md are adapted accordingly so Row Level Security stays
 * the source of truth for tenancy.
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  IAtsScanResult,
  IKeywordSuggestion,
  IMatchResult,
  IResumeTemplate,
  IResumeVersion,
  IStructuredResume,
  XyzBullet,
} from '../types/resume.types.js';

import { scanResume as scanResumeImpl, suggestKeywords as suggestKeywordsImpl } from './atsScanner.service.js';
import type { IKeywordInput, IScanInput } from './atsScanner.service.js';
import { generateBullets as generateBulletsImpl } from './bulletGenerator.service.js';
import type { IBulletInput } from './bulletGenerator.service.js';
import { matchJob as matchJobImpl } from './jobMatcher.service.js';
import type { IMatchInput } from './jobMatcher.service.js';
import {
  buildFromTemplate as buildFromTemplateImpl,
  listTemplates as listTemplatesImpl,
} from './resumeBuilder.service.js';
import { parseResume, parseResumeFromStorage } from './resumeParser.service.js';
import type { ResumeFileInput } from './resumeParser.service.js';
import {
  cloneVersion as cloneVersionImpl,
  listVersions as listVersionsImpl,
  renameVersion as renameVersionImpl,
  saveVersion as saveVersionImpl,
  setActiveVersion as setActiveVersionImpl,
} from './versionManager.service.js';
import type { SaveVersionInput } from './versionManager.service.js';

// Re-export the component input/result types so controllers can depend on the
// facade as the single import point for the Resume module.
export type { IScanInput, IKeywordInput } from './atsScanner.service.js';
export type { IBulletInput } from './bulletGenerator.service.js';
export type { IMatchInput } from './jobMatcher.service.js';
export type { ResumeFileInput } from './resumeParser.service.js';
export type { SaveVersionInput } from './versionManager.service.js';

/**
 * Parse an uploaded `.pdf`/`.docx` file (buffer + filename) into a structured
 * resume (Requirements 1.1, 1.4). Pure parse — no DB/storage access — so it
 * needs neither the Supabase client nor a user id. Throws `ParseError` on an
 * unsupported or unreadable file.
 */
export async function parseUpload(file: ResumeFileInput): Promise<IStructuredResume> {
  return parseResume(file);
}

/**
 * Parse a resume file already persisted in the `resume-uploads` Supabase
 * Storage bucket (Requirements 1.1, 1.4). The RLS-scoped client keeps storage
 * access scoped to the authenticated caller. Throws `ParseError` when the
 * object cannot be fetched or parsed.
 */
export async function parseUploadFromStorage(
  supabase: SupabaseClient,
  objectPath: string,
  bucket?: string
): Promise<IStructuredResume> {
  return parseResumeFromStorage(supabase, objectPath, bucket);
}

/**
 * Compute an ATS `Compatibility_Score` (and factors / keyword suggestions) for
 * a resume, optionally relative to a job description (Requirements 3.1–3.5,
 * 4.1). Pure, in-process computation.
 */
export function scanResume(input: IScanInput): IAtsScanResult {
  return scanResumeImpl(input);
}

/**
 * Suggest keywords present in a job description but missing from the resume
 * (Requirements 4.1–4.3). Pure, in-process computation.
 */
export function suggestKeywords(input: IKeywordInput): IKeywordSuggestion[] {
  return suggestKeywordsImpl(input);
}

/**
 * List the active ATS-parseable templates (Requirement 5.1). RLS scopes the
 * read to active templates the caller may see.
 */
export async function listTemplates(supabase: SupabaseClient): Promise<IResumeTemplate[]> {
  return listTemplatesImpl(supabase);
}

/**
 * Build an `IStructuredResume` scaffold from a selected template (Requirement
 * 5.2). A missing/inactive template surfaces as `NotFoundError`.
 */
export async function buildFromTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<IStructuredResume> {
  return buildFromTemplateImpl(supabase, templateId);
}

/**
 * Persist a new `Resume_Version` for the caller (Requirements 5.3, 5.4).
 * Rejects an incomplete required section with `ValidationError`.
 */
export async function saveVersion(
  supabase: SupabaseClient,
  userId: string,
  version: SaveVersionInput
): Promise<IResumeVersion> {
  return saveVersionImpl(supabase, userId, version);
}

/**
 * Compute a semantic `Match_Score` plus matched/missing concepts for a resume
 * against a job description (Requirement 6). Provider failures surface as
 * `AiProviderError`.
 */
export async function matchJob(input: IMatchInput): Promise<IMatchResult> {
  return matchJobImpl(input);
}

/**
 * Rewrite an experience description into X-Y-Z achievement bullets
 * (Requirements 7.1, 7.2, 7.4). Provider failures surface as `AiProviderError`.
 */
export async function generateBullets(input: IBulletInput): Promise<XyzBullet[]> {
  return generateBulletsImpl(input);
}

/**
 * Clone an existing `Resume_Version` owned by the caller (Requirements 8.1–8.3).
 * A missing/unowned source surfaces as `NotFoundError`.
 */
export async function cloneVersion(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<IResumeVersion> {
  return cloneVersionImpl(supabase, userId, sourceId);
}

/**
 * Rename a `Resume_Version`, preserving its content (Requirements 9.1–9.3).
 * A missing/unowned version surfaces as `NotFoundError`; a blank name as
 * `ValidationError`.
 */
export async function renameVersion(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  name: string
): Promise<IResumeVersion> {
  return renameVersionImpl(supabase, userId, id, name);
}

/**
 * List all `Resume_Versions` owned by the caller (Requirement 10.1).
 */
export async function listVersions(
  supabase: SupabaseClient,
  userId: string
): Promise<IResumeVersion[]> {
  return listVersionsImpl(supabase, userId);
}

/**
 * Set a `Resume_Version` active for the caller, enforcing the single-active
 * invariant (Requirements 10.2–10.4). A missing/unowned version surfaces as
 * `NotFoundError`.
 */
export async function setActiveVersion(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<IResumeVersion> {
  return setActiveVersionImpl(supabase, userId, id);
}
