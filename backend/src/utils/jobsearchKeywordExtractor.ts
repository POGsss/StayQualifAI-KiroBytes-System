/**
 * Keyword extraction utility for the Job Scraper feature.
 *
 * Reads an IStructuredResume and produces a ranked, deduplicated list of
 * search queries (1–5) suitable for sending to SerpAPI Google Jobs.
 *
 * Priority order: title > skill > experience > summary.
 * Within priority, multi-word phrases and named technologies rank higher
 * than single generic terms.
 *
 * Named exports only. No `any`. Explicit return types.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 5.2
 */

import type { IStructuredResume } from '../types/resume.types.js';
import { ValidationError } from './errors.js';

/**
 * A single search query derived from the user's resume.
 */
export interface ISearchQuery {
  text: string; // 2-100 characters
  source: 'title' | 'skill' | 'experience' | 'summary';
  score: number; // relevance score for ranking
}

/** Base scores per source category (higher = more relevant). */
const SOURCE_BASE_SCORES: Record<ISearchQuery['source'], number> = {
  title: 400,
  skill: 300,
  experience: 200,
  summary: 100,
};

/** Minimum and maximum query length constraints. */
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

/** Maximum number of queries returned. */
const MAX_QUERIES = 5;

/**
 * Generic single-word terms that rank lower within their priority bucket.
 * These are common filler words that don't strongly signal a job role.
 */
const GENERIC_TERMS: ReadonlySet<string> = new Set([
  'team',
  'work',
  'management',
  'development',
  'experience',
  'skills',
  'professional',
  'projects',
  'working',
  'responsible',
  'various',
  'including',
  'strong',
  'excellent',
  'good',
  'ability',
  'knowledge',
  'understanding',
  'proficient',
  'familiar',
  'comfortable',
  'years',
  'company',
  'business',
  'role',
  'position',
  'job',
  'senior',
  'junior',
  'lead',
  'manager',
  'engineer',
  'developer',
  'analyst',
  'specialist',
  'coordinator',
]);

/**
 * Cleans text by trimming and collapsing internal whitespace.
 */
function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Determines if a term looks like a named technology or specific phrase
 * (multi-word, contains uppercase/mixed case patterns, known tech indicators).
 */
function isSpecificTerm(term: string): boolean {
  // Multi-word phrases are more specific
  if (term.includes(' ')) {
    return true;
  }
  // Terms with version numbers, dots, or hashes (e.g., "Node.js", "C#", "ES6")
  if (/[.#\d]/.test(term)) {
    return true;
  }
  // Terms with mixed case patterns (e.g., "TypeScript", "GraphQL", "PostgreSQL")
  if (/[a-z][A-Z]|[A-Z][a-z].*[A-Z]/.test(term)) {
    return true;
  }
  return false;
}

/**
 * Computes a specificity bonus for a candidate term.
 * Multi-word phrases and named technologies get a +50 bonus.
 * Single generic terms get a -50 penalty.
 */
function specificityBonus(term: string): number {
  if (isSpecificTerm(term)) {
    return 50;
  }
  const lower = term.toLowerCase();
  if (GENERIC_TERMS.has(lower)) {
    return -50;
  }
  // Single non-generic words get a mild bonus
  return 0;
}

/**
 * Generic resume section headings that should NOT be used as search queries.
 * These are structural labels, not job titles.
 */
const GENERIC_SECTION_HEADINGS: ReadonlySet<string> = new Set([
  'experience',
  'work experience',
  'professional experience',
  'employment history',
  'work history',
  'education',
  'skills',
  'technical skills',
  'certifications',
  'projects',
  'summary',
  'objective',
  'references',
  'awards',
  'publications',
  'activities',
  'volunteer',
  'interests',
  'languages',
  'additional',
  'contact',
  'profile',
]);

/**
 * Extracts candidate terms from experience section headings (source: 'title').
 * Skips generic section headings like "EXPERIENCE" or "Work History".
 */
function extractTitleTerms(resume: IStructuredResume): string[] {
  const terms: string[] = [];
  for (const section of resume.experience) {
    const heading = cleanText(section.heading);
    if (
      heading.length >= MIN_QUERY_LENGTH &&
      heading.length <= MAX_QUERY_LENGTH &&
      !GENERIC_SECTION_HEADINGS.has(heading.toLowerCase())
    ) {
      terms.push(heading);
    }
  }
  return terms;
}

/**
 * Extracts candidate terms from the skills array (source: 'skill').
 */
function extractSkillTerms(resume: IStructuredResume): string[] {
  const terms: string[] = [];
  for (const skill of resume.skills) {
    const cleaned = cleanText(skill);
    if (cleaned.length >= MIN_QUERY_LENGTH && cleaned.length <= MAX_QUERY_LENGTH) {
      terms.push(cleaned);
    }
  }
  return terms;
}

/**
 * Extracts candidate phrases from experience section items (source: 'experience').
 * Picks meaningful phrases from the item text rather than full sentences.
 */
function extractExperienceTerms(resume: IStructuredResume): string[] {
  const terms: string[] = [];
  for (const section of resume.experience) {
    for (const item of section.items) {
      const phrases = extractMeaningfulPhrases(item);
      for (const phrase of phrases) {
        if (phrase.length >= MIN_QUERY_LENGTH && phrase.length <= MAX_QUERY_LENGTH) {
          terms.push(phrase);
        }
      }
    }
  }
  return terms;
}

/**
 * Extracts meaningful phrases from a text line.
 * Looks for technology names, tools, and short noun phrases.
 */
function extractMeaningfulPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Match technology-like patterns: capitalized words, words with dots/hashes,
  // multi-word capitalized sequences
  const techPattern = /\b(?:[A-Z][a-zA-Z]*(?:\.[a-z]+)?(?:\s+[A-Z][a-zA-Z]*)*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = techPattern.exec(text)) !== null) {
    const candidate = cleanText(match[0]);
    if (
      candidate.length >= MIN_QUERY_LENGTH &&
      candidate.length <= MAX_QUERY_LENGTH &&
      !GENERIC_TERMS.has(candidate.toLowerCase())
    ) {
      phrases.push(candidate);
    }
  }

  // Also look for terms with special characters that indicate tech (e.g., C++, Node.js, C#)
  const specialTechPattern = /\b\w+(?:[.#+]\w*)+\b/g;
  while ((match = specialTechPattern.exec(text)) !== null) {
    const candidate = cleanText(match[0]);
    if (candidate.length >= MIN_QUERY_LENGTH && candidate.length <= MAX_QUERY_LENGTH) {
      phrases.push(candidate);
    }
  }

  return phrases;
}

/**
 * Extracts candidate terms from the summary field (source: 'summary').
 */
function extractSummaryTerms(resume: IStructuredResume): string[] {
  const terms: string[] = [];
  const summary = cleanText(resume.summary);
  if (summary.length < MIN_QUERY_LENGTH) {
    return terms;
  }

  // Extract technology-like phrases from summary
  const phrases = extractMeaningfulPhrases(summary);
  for (const phrase of phrases) {
    if (phrase.length >= MIN_QUERY_LENGTH && phrase.length <= MAX_QUERY_LENGTH) {
      terms.push(phrase);
    }
  }

  // If no tech phrases found but summary is meaningful, use the whole summary
  // truncated to max length as a last-resort term
  if (terms.length === 0 && summary.length >= MIN_QUERY_LENGTH) {
    const truncated = summary.slice(0, MAX_QUERY_LENGTH).trim();
    if (truncated.length >= MIN_QUERY_LENGTH) {
      terms.push(truncated);
    }
  }

  return terms;
}

/**
 * Deduplicates candidate queries:
 * - Removes case-insensitive duplicates (keeps first occurrence by score)
 * - Removes queries that are substrings of another query in the output
 */
function deduplicateQueries(candidates: ISearchQuery[]): ISearchQuery[] {
  // Sort by score descending so higher-scored items are kept on dedup
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  // Phase 1: Remove case-insensitive duplicates
  const seenLower = new Set<string>();
  const unique: ISearchQuery[] = [];
  for (const query of sorted) {
    const lower = query.text.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      unique.push(query);
    }
  }

  // Phase 2: Remove substring queries.
  // A shorter query is removed if it's a substring of a longer query already in the set.
  const result: ISearchQuery[] = [];
  for (const query of unique) {
    const queryLower = query.text.toLowerCase();
    const isSubstringOfAnother = unique.some(
      (other) =>
        other !== query &&
        other.text.toLowerCase().includes(queryLower) &&
        other.text.toLowerCase() !== queryLower
    );
    if (!isSubstringOfAnother) {
      result.push(query);
    }
  }

  return result;
}

/**
 * Extracts ranked, deduplicated search queries from a structured resume.
 *
 * Returns 1–5 queries. Throws ValidationError if resume lacks extractable
 * content (empty skills array AND no experience sections).
 *
 * @throws {ValidationError} If resume has no extractable content.
 */
export function extractSearchQueries(resume: IStructuredResume): ISearchQuery[] {
  // Validate: resume must have at least skills or experience content
  const hasSkills = resume.skills.length > 0;
  const hasExperience =
    resume.experience.length > 0 &&
    resume.experience.some((s) => s.heading.trim().length > 0 || s.items.length > 0);

  if (!hasSkills && !hasExperience) {
    throw new ValidationError(
      'Resume lacks sufficient content for job searching. Please add skills or experience.'
    );
  }

  // Gather candidates from each source
  const candidates: ISearchQuery[] = [];

  // Title terms (highest priority)
  for (const term of extractTitleTerms(resume)) {
    candidates.push({
      text: term,
      source: 'title',
      score: SOURCE_BASE_SCORES.title + specificityBonus(term),
    });
  }

  // Skill terms
  for (const term of extractSkillTerms(resume)) {
    candidates.push({
      text: term,
      source: 'skill',
      score: SOURCE_BASE_SCORES.skill + specificityBonus(term),
    });
  }

  // Experience item terms
  for (const term of extractExperienceTerms(resume)) {
    candidates.push({
      text: term,
      source: 'experience',
      score: SOURCE_BASE_SCORES.experience + specificityBonus(term),
    });
  }

  // Summary terms (lowest priority)
  for (const term of extractSummaryTerms(resume)) {
    candidates.push({
      text: term,
      source: 'summary',
      score: SOURCE_BASE_SCORES.summary + specificityBonus(term),
    });
  }

  // If no candidates at all (e.g., all skills were too short), throw
  if (candidates.length === 0) {
    throw new ValidationError(
      'Resume lacks sufficient content for job searching. Please add skills or experience.'
    );
  }

  // Deduplicate
  const deduplicated = deduplicateQueries(candidates);

  // Sort by score descending and take top MAX_QUERIES
  const ranked = deduplicated.sort((a, b) => b.score - a.score).slice(0, MAX_QUERIES);

  return ranked;
}
