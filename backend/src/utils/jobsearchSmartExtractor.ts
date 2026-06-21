/**
 * Smart keyword extraction using Gemini AI.
 *
 * Instead of naive heuristic extraction that produces redundant/overlapping
 * queries (e.g., "Data Analysis", "Data Cleaning", "Data Visualization"),
 * this module uses Gemini to intelligently generate 3 diverse, non-redundant
 * job search queries from the resume that maximize result variety.
 *
 * Falls back to the heuristic extractor if Gemini is unavailable.
 *
 * Named exports only. No `any`. Explicit return types.
 */

import { z } from 'zod';

import type { IStructuredResume } from '../types/resume.types.js';
import { generateJson } from '../services/aiProvider.service.js';
import { extractSearchQueries, type ISearchQuery } from './jobsearchKeywordExtractor.js';

/** Schema for Gemini's response — array of search query strings. */
const searchQueriesSchema = z.object({
  queries: z.array(z.string().min(2).max(80)).min(1).max(5),
});

type SearchQueriesResponse = z.infer<typeof searchQueriesSchema>;

/**
 * Uses Gemini to generate smart, diverse job search queries from a resume.
 * Each query targets a different job title / role angle the candidate is
 * qualified for, maximizing the variety of search results.
 *
 * Falls back to heuristic extraction on any Gemini failure.
 */
export async function extractSmartQueries(
  resume: IStructuredResume
): Promise<ISearchQuery[]> {
  try {
    const resumeSummary = buildResumeSummary(resume);

    const result: SearchQueriesResponse = await generateJson({
      prompt: `Analyze this resume and do two things:

1. DETERMINE the experience level based on total years of work, role seniority, and responsibilities:
   - Entry/Junior: 0-2 years, basic tasks, "assisted" language
   - Mid-level: 3-5 years, independent ownership, some leadership
   - Senior/Lead: 6+ years, strategy, mentoring, cross-functional impact

2. Generate exactly 3 job search queries targeting the CORRECT seniority level AND covering 3 DISTINCT career paths from this resume.

Rules:
- Include seniority in the query where natural (e.g., "Junior Data Analyst", "Senior ERP Consultant", "Mid-Level Automation Engineer")
- Each query MUST target a completely DIFFERENT field or role type
- NEVER generate queries that would return overlapping results
- Use specific job TITLES
- Keep queries 3-6 words max

Resume:
${resumeSummary}

Return a JSON object with a "queries" array of exactly 3 strings.`,
      schema: searchQueriesSchema,
      systemInstruction:
        'You are a career matching expert. First assess the candidate\'s seniority from their resume, then generate job search queries at that exact level. A junior candidate should NEVER get senior-level queries. Maximize role diversity across the 3 queries.',
      timeoutMs: 10_000,
    });

    // Convert to ISearchQuery format
    return result.queries.slice(0, 5).map((text, index) => ({
      text,
      source: 'title' as const,
      score: 400 - index * 10,
    }));
  } catch {
    // Fallback to heuristic extraction if Gemini fails
    console.log('[SmartExtractor] Gemini unavailable, falling back to heuristic extraction');
    return extractSearchQueries(resume);
  }
}

/**
 * Builds a concise resume summary string for the Gemini prompt.
 */
function buildResumeSummary(resume: IStructuredResume): string {
  const parts: string[] = [];

  if (resume.summary) {
    parts.push(`Summary: ${resume.summary}`);
  }

  if (resume.experience.length > 0) {
    const titles = resume.experience
      .map((s) => s.heading)
      .filter((h) => h.trim().length > 0)
      .slice(0, 5);
    if (titles.length > 0) {
      parts.push(`Job titles: ${titles.join(', ')}`);
    }

    const items = resume.experience
      .flatMap((s) => s.items)
      .slice(0, 10);
    if (items.length > 0) {
      parts.push(`Experience highlights: ${items.join('; ')}`);
    }
  }

  if (resume.skills.length > 0) {
    parts.push(`Skills: ${resume.skills.slice(0, 15).join(', ')}`);
  }

  return parts.join('\n');
}
