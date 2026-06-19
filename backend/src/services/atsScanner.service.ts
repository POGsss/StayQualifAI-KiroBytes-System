/**
 * ATS_Scanner (Requirements 3.1, 3.2, 3.3, 3.5, 4.1).
 *
 * Computes a deterministic, network-free ATS `Compatibility_Score` for an
 * `IStructuredResume` together with the contributing factors and keyword
 * suggestions. No AI provider is involved — the high-frequency scan path is a
 * pure, in-process computation (see the design's "Cost / Quota Discipline").
 *
 * Scoring model
 * -------------
 * The score is assembled from concrete formatting / parseability heuristics
 * that an Applicant Tracking System relies on to read a resume:
 *   - a contact email it can route to,
 *   - a candidate name,
 *   - a parseable experience section,
 *   - a parseable education section,
 *   - a skills list,
 *   - a professional summary,
 *   - additional contact detail (phone or location).
 *
 * Each heuristic carries a fixed weight (the weights sum to 100). The fraction
 * of weight satisfied is the "formatting fraction".
 *
 *   - WITHOUT a `Job_Description` (Requirement 3.3): the score is the formatting
 *     fraction scaled to 0..100.
 *   - WITH a `Job_Description` (Requirement 3.2): the score is split evenly
 *     between the formatting fraction (50 points) and keyword coverage — the
 *     fraction of the job description's significant stems that already appear in
 *     the resume (50 points).
 *
 * The returned score is ALWAYS an integer clamped to [0, 100] (Property 2 /
 * Requirement 3.1). When the resume has no extractable text content the score
 * is 0 with a single explanatory factor (Property 9 / Requirement 3.5).
 *
 * Keyword suggestions are derived from `utils/keywords.ts` via the stemmed
 * JD-minus-resume difference and surfaced with a readable term (Requirement
 * 4.1).
 *
 * Named exports only. Explicit return types. No `any`.
 */
import type {
  IAtsScanResult,
  IKeywordSuggestion,
  IScoreFactor,
  IStructuredResume,
} from '../types/resume.types.js';
import {
  isStopword,
  keywordDifference,
  porterStem,
  stemSet,
  tokenize,
} from '../utils/keywords.js';

/** Input to {@link scanResume}: a resume plus an optional job description. */
export interface IScanInput {
  content: IStructuredResume;
  jobDescription?: string;
}

/** Input to {@link suggestKeywords}: a resume plus a required job description. */
export interface IKeywordInput {
  content: IStructuredResume;
  jobDescription: string;
}

/**
 * Fixed formatting / parseability weights. These sum to 100 so the satisfied
 * fraction maps directly onto a 0..100 formatting subscore.
 */
const FORMATTING_WEIGHTS = {
  email: 20,
  name: 10,
  experience: 25,
  education: 15,
  skills: 15,
  summary: 10,
  contactDetail: 5,
} as const;

/** Point budget for the formatting subscore when a job description is present. */
const FORMATTING_PORTION_WITH_JD = 50;

/** Point budget for keyword coverage when a job description is present. */
const KEYWORD_PORTION_WITH_JD = 50;

/**
 * Compute an ATS `Compatibility_Score`, contributing factors, and keyword
 * suggestions for a resume.
 *
 * - Relative to the `Job_Description` when one is provided (Requirement 3.2).
 * - Formatting / parseability only when none is provided (Requirement 3.3).
 * - Score 0 plus an explanatory factor when there is no extractable text
 *   content (Requirement 3.5).
 *
 * The score is always an integer in the inclusive range [0, 100]
 * (Requirement 3.1).
 */
export function scanResume(input: IScanInput): IAtsScanResult {
  const { content } = input;
  const jobDescription: string =
    input.jobDescription !== undefined ? input.jobDescription : '';
  const hasJobDescription: boolean = jobDescription.trim().length > 0;

  const resumeText: string = extractResumeText(content);

  // Requirement 3.5 / Property 9: empty or whitespace-only extractable content
  // scores 0 with a single explanatory factor.
  if (resumeText.trim().length === 0) {
    return {
      score: 0,
      factors: [
        {
          label: 'No extractable content',
          impact: 0,
          detail:
            'The resume contains no extractable text content, so it cannot be parsed by an ATS. Add contact details, a summary, experience, education, and skills.',
        },
      ],
      keywordSuggestions: [],
    };
  }

  const formatting = evaluateFormatting(content);
  const formattingScale: number = hasJobDescription
    ? FORMATTING_PORTION_WITH_JD / 100
    : 1;

  const factors: IScoreFactor[] = [];
  let rawScore = 0;

  for (const criterion of formatting) {
    const contribution: number = criterion.satisfied
      ? criterion.weight * formattingScale
      : 0;
    rawScore += contribution;
    factors.push({
      label: criterion.label,
      impact: Math.round(contribution),
      detail: criterion.satisfied ? criterion.satisfiedDetail : criterion.missingDetail,
    });
  }

  let keywordSuggestions: IKeywordSuggestion[] = [];

  if (hasJobDescription) {
    const coverage = evaluateKeywordCoverage(jobDescription, resumeText);
    const contribution: number = coverage.fraction * KEYWORD_PORTION_WITH_JD;
    rawScore += contribution;
    factors.push({
      label: 'Job description keyword coverage',
      impact: Math.round(contribution),
      detail: buildCoverageDetail(coverage),
    });
    keywordSuggestions = buildSuggestions(jobDescription, resumeText);
  }

  return {
    score: clampScore(rawScore),
    factors,
    keywordSuggestions,
  };
}

/**
 * Return the keyword suggestions for a resume relative to a job description:
 * the job description's significant terms whose stems are absent from the
 * resume (Requirements 4.1, 4.2). When the resume already covers every
 * significant term the list is empty (Requirement 4.3).
 */
export function suggestKeywords(input: IKeywordInput): IKeywordSuggestion[] {
  const resumeText: string = extractResumeText(input.content);
  return buildSuggestions(input.jobDescription, resumeText);
}

/** A single formatting / parseability heuristic and its evaluation. */
interface IFormattingCriterion {
  label: string;
  weight: number;
  satisfied: boolean;
  satisfiedDetail: string;
  missingDetail: string;
}

/** The result of comparing a resume's stems against a job description's. */
interface IKeywordCoverage {
  fraction: number;
  totalSignificant: number;
  matched: number;
  missing: number;
}

/**
 * Evaluate every formatting / parseability heuristic against the resume. The
 * ordering is fixed so output is deterministic.
 */
function evaluateFormatting(resume: IStructuredResume): IFormattingCriterion[] {
  const contact = resume.contact;

  return [
    {
      label: 'Contact email',
      weight: FORMATTING_WEIGHTS.email,
      satisfied: isLikelyEmail(contact.email),
      satisfiedDetail:
        'A contact email is present, giving the ATS a routable point of contact.',
      missingDetail:
        'No valid contact email was found. Add an email address so an ATS can route your application.',
    },
    {
      label: 'Candidate name',
      weight: FORMATTING_WEIGHTS.name,
      satisfied: hasText(contact.name),
      satisfiedDetail: 'A candidate name is present.',
      missingDetail: 'No candidate name was found. Add your full name to the contact section.',
    },
    {
      label: 'Experience section',
      weight: FORMATTING_WEIGHTS.experience,
      satisfied: hasSectionContent(resume.experience),
      satisfiedDetail: 'A parseable experience section with content is present.',
      missingDetail:
        'No experience content was found. Add work experience entries so an ATS can assess your background.',
    },
    {
      label: 'Education section',
      weight: FORMATTING_WEIGHTS.education,
      satisfied: hasSectionContent(resume.education),
      satisfiedDetail: 'A parseable education section with content is present.',
      missingDetail:
        'No education content was found. Add an education section with at least one entry.',
    },
    {
      label: 'Skills list',
      weight: FORMATTING_WEIGHTS.skills,
      satisfied: hasNonEmptyEntry(resume.skills),
      satisfiedDetail: 'A skills list is present for keyword matching.',
      missingDetail:
        'No skills were found. Add a skills list to improve keyword matching against job descriptions.',
    },
    {
      label: 'Professional summary',
      weight: FORMATTING_WEIGHTS.summary,
      satisfied: hasText(resume.summary),
      satisfiedDetail: 'A professional summary is present.',
      missingDetail:
        'No professional summary was found. Add a short summary describing your background and goals.',
    },
    {
      label: 'Additional contact detail',
      weight: FORMATTING_WEIGHTS.contactDetail,
      satisfied:
        hasText(contact.phone) ||
        hasText(contact.location) ||
        hasNonEmptyEntry(contact.links),
      satisfiedDetail: 'Additional contact detail (phone, location, or links) is present.',
      missingDetail:
        'No additional contact detail was found. Add a phone number, location, or professional link.',
    },
  ];
}

/**
 * Compute keyword coverage: the fraction of the job description's significant
 * stems that already appear in the resume. When the job description has no
 * significant stems coverage is treated as complete (fraction 1).
 */
function evaluateKeywordCoverage(
  jobDescription: string,
  resumeText: string
): IKeywordCoverage {
  const totalSignificant: number = stemSet(jobDescription).size;
  const missing: number = keywordDifference(jobDescription, resumeText).length;
  const matched: number = Math.max(0, totalSignificant - missing);
  const fraction: number = totalSignificant === 0 ? 1 : matched / totalSignificant;

  return { fraction, totalSignificant, matched, missing };
}

/** Build the human-readable detail string for the keyword-coverage factor. */
function buildCoverageDetail(coverage: IKeywordCoverage): string {
  if (coverage.totalSignificant === 0) {
    return 'The job description contained no significant keywords to match against.';
  }
  const percent: number = Math.round(coverage.fraction * 100);
  return `The resume covers ${coverage.matched} of ${coverage.totalSignificant} significant job-description keywords (${percent}%).`;
}

/**
 * Build keyword suggestions from the stemmed JD-minus-resume difference,
 * surfacing each missing stem with the readable term it first appeared as in
 * the job description.
 */
function buildSuggestions(jobDescription: string, resumeText: string): IKeywordSuggestion[] {
  const stemToTerm: Map<string, string> = buildStemToTermMap(jobDescription);

  return keywordDifference(jobDescription, resumeText).map((stem) => {
    const term: string = stemToTerm.get(stem) ?? stem;
    return {
      term,
      reason:
        'Appears in the job description but is missing from your resume. Consider adding it where it is truthful and relevant.',
    };
  });
}

/**
 * Map each significant job-description stem to the first original token it was
 * derived from, so suggestions can present a readable term instead of a stem.
 */
function buildStemToTermMap(jobDescription: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const token of tokenize(jobDescription)) {
    if (isStopword(token)) {
      continue;
    }
    const stem: string = porterStem(token);
    if (stem.length === 0 || map.has(stem)) {
      continue;
    }
    map.set(stem, token);
  }
  return map;
}

/**
 * Concatenate every extractable text fragment of a resume: contact fields,
 * summary, section headings and items, and skills.
 */
function extractResumeText(resume: IStructuredResume): string {
  const parts: string[] = [];
  const contact = resume.contact;

  pushText(parts, contact.name);
  pushText(parts, contact.email);
  pushText(parts, contact.phone);
  pushText(parts, contact.location);
  for (const link of contact.links) {
    pushText(parts, link);
  }

  pushText(parts, resume.summary);

  for (const section of [...resume.experience, ...resume.education, ...resume.additional]) {
    pushText(parts, section.heading);
    for (const item of section.items) {
      pushText(parts, item);
    }
  }

  for (const skill of resume.skills) {
    pushText(parts, skill);
  }

  return parts.join('\n');
}

/** Push a trimmed value onto the accumulator only when it carries text. */
function pushText(parts: string[], value: string | undefined): void {
  if (hasText(value)) {
    parts.push(value.trim());
  }
}

/** True when a string is defined and contains non-whitespace characters. */
function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/** True when an array contains at least one entry with non-whitespace text. */
function hasNonEmptyEntry(values: readonly string[]): boolean {
  return values.some((value) => hasText(value));
}

/** True when any section in the list has a non-empty item. */
function hasSectionContent(
  sections: readonly { items: string[] }[]
): boolean {
  return sections.some((section) => hasNonEmptyEntry(section.items));
}

/**
 * Heuristic email validity check: a single `@` with non-empty local and domain
 * parts and a dot in the domain. Deterministic and dependency-free.
 */
function isLikelyEmail(value: string | undefined): boolean {
  if (!hasText(value)) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Clamp a raw score to an integer in the inclusive range [0, 100]
 * (Requirement 3.1 / Property 2).
 */
function clampScore(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0;
  }
  const rounded: number = Math.round(raw);
  return Math.min(100, Math.max(0, rounded));
}
