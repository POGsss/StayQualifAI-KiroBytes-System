/**
 * AI_Writer_Service — Requirements 6.1–6.7, 7.1–7.4, 8.1–8.6.
 *
 * Generates cover letters, LinkedIn outreach messages, and follow-up emails
 * for job applications using Google Gemini via the shared AI provider.
 *
 * Each generation function:
 *   1. Fetches required data (application, listing, resume) from Supabase
 *   2. Validates preconditions (resume exists, description present, valid stage)
 *   3. Builds a targeted prompt
 *   4. Calls the AI provider with a 15-second timeout
 *   5. Returns the generated text
 *
 * Error mapping:
 *   - Missing application/listing → NotFoundError
 *   - No resume uploaded → ValidationError
 *   - Empty listing description → ValidationError
 *   - Invalid stage for follow-up → ValidationError
 *   - Gemini failure/timeout → AiProviderError (propagated from aiProvider)
 *
 * Named exports only. Explicit return types. No `any`. async/await throughout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { IStructuredResume } from '../types/resume.types.js';
import type { Stage } from '../types/jobsearch.types.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { generateJson } from './aiProvider.service.js';

/** Timeout for all AI generation calls (Requirements 6.3, 7.1, 8.1). */
const AI_TIMEOUT_MS = 15_000;

/** Zod schema for extracting plain text from Gemini's JSON response. */
const textResponseSchema = z.object({ text: z.string() });

// ---------------------------------------------------------------------------
// Internal data-fetching helpers
// ---------------------------------------------------------------------------

interface ApplicationRow {
  id: string;
  user_id: string;
  listing_id: string;
  stage: Stage;
}

interface ListingRow {
  id: string;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  description: string | null;
}

interface ResumeVersionRow {
  id: string;
  content: unknown;
}

/**
 * Fetch an application by id, scoped to the authenticated user via RLS.
 * Throws NotFoundError if the application does not exist or is not owned.
 */
async function fetchApplication(
  supabase: SupabaseClient,
  applicationId: string
): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from('jobsearch_applications')
    .select('id, user_id, listing_id, stage')
    .eq('id', applicationId)
    .maybeSingle<ApplicationRow>();

  if (error !== null) {
    throw new NotFoundError(`Application "${applicationId}" was not found.`);
  }
  if (data === null) {
    throw new NotFoundError(`Application "${applicationId}" was not found.`);
  }
  return data;
}

/**
 * Fetch a listing by id.
 * Throws NotFoundError if the listing does not exist.
 */
async function fetchListing(
  supabase: SupabaseClient,
  listingId: string
): Promise<ListingRow> {
  const { data, error } = await supabase
    .from('jobsearch_listings')
    .select('id, title, company, location, work_mode, description')
    .eq('id', listingId)
    .maybeSingle<ListingRow>();

  if (error !== null) {
    throw new NotFoundError(`Listing was not found.`);
  }
  if (data === null) {
    throw new NotFoundError(`Listing was not found.`);
  }
  return data;
}

/**
 * Fetch the user's most recent resume version (ordered by created_at DESC).
 * Returns null if the user has no resume versions.
 */
async function fetchLatestResume(
  supabase: SupabaseClient,
  userId: string
): Promise<IStructuredResume | null> {
  const { data, error } = await supabase
    .from('resume_versions')
    .select('id, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<ResumeVersionRow>();

  if (error !== null || data === null) {
    return null;
  }

  // The content is stored as jsonb — cast to IStructuredResume.
  return data.content as IStructuredResume;
}

/**
 * Summarize a structured resume into a compact text representation for prompts.
 */
function summarizeResume(resume: IStructuredResume): string {
  const parts: string[] = [];

  parts.push(`Name: ${resume.contact.name}`);
  if (resume.summary) {
    parts.push(`Summary: ${resume.summary}`);
  }

  if (resume.experience.length > 0) {
    parts.push('Experience:');
    for (const section of resume.experience) {
      parts.push(`  ${section.heading}`);
      for (const item of section.items) {
        parts.push(`    - ${item}`);
      }
    }
  }

  if (resume.education.length > 0) {
    parts.push('Education:');
    for (const section of resume.education) {
      parts.push(`  ${section.heading}`);
      for (const item of section.items) {
        parts.push(`    - ${item}`);
      }
    }
  }

  if (resume.skills.length > 0) {
    parts.push(`Skills: ${resume.skills.join(', ')}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a cover letter for a job application (Requirements 6.1–6.7).
 *
 * - Fetches the application and associated listing
 * - Validates the listing has a non-empty description
 * - Fetches the user's latest resume version
 * - Validates the user has at least one resume
 * - Calls Gemini with a structured prompt requesting 250–500 words
 *   referencing ≥2 listing requirements mapped to resume qualifications
 * - Returns the generated cover letter text
 */
export async function generateCoverLetter(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string
): Promise<string> {
  const application = await fetchApplication(supabase, applicationId);
  const listing = await fetchListing(supabase, application.listing_id);

  // Requirement 6.7: validate listing description is present
  if (!listing.description || listing.description.trim().length === 0) {
    throw new ValidationError(
      'A listing description is required for cover letter generation.'
    );
  }

  // Requirement 6.6: validate user has a resume
  const resume = await fetchLatestResume(supabase, userId);
  if (resume === null) {
    throw new ValidationError(
      'A resume must be uploaded before generating a cover letter.'
    );
  }

  const resumeText = summarizeResume(resume);

  const prompt = `You are a professional cover letter writer. Generate a cover letter for the following job application.

JOB LISTING:
Title: ${listing.title}
Company: ${listing.company}
Location: ${listing.location}
Work Mode: ${listing.work_mode}
Description: ${listing.description}

CANDIDATE RESUME:
${resumeText}

INSTRUCTIONS:
- Write a professional cover letter between 250 and 500 words
- Reference at least 2 specific requirements from the job listing description
- Map each referenced requirement to a specific qualification, skill, or experience from the candidate's resume
- Use a professional yet personable tone
- Address it to the hiring team at ${listing.company}
- Include an opening paragraph, body paragraphs connecting qualifications to requirements, and a closing paragraph

Respond with a JSON object containing a single "text" field with the full cover letter text.`;

  const result = await generateJson({
    prompt,
    schema: textResponseSchema,
    systemInstruction:
      'You are a cover letter writing assistant. Always respond with valid JSON containing a "text" field.',
    timeoutMs: AI_TIMEOUT_MS,
  });

  return result.text;
}

/**
 * Generate a LinkedIn outreach message for a job application (Requirements 7.1–7.4).
 *
 * - Fetches the application and associated listing
 * - Builds a prompt constrained to ≤300 characters
 * - If recipientName/recipientRole provided, includes them in the prompt
 * - Returns the generated LinkedIn message text
 */
export async function generateLinkedInOutreach(
  supabase: SupabaseClient,
  _userId: string,
  applicationId: string,
  recipientName?: string,
  recipientRole?: string
): Promise<string> {
  const application = await fetchApplication(supabase, applicationId);
  const listing = await fetchListing(supabase, application.listing_id);

  let recipientContext = '';
  if (recipientName) {
    recipientContext += `\nRecipient Name: ${recipientName}`;
  }
  if (recipientRole) {
    recipientContext += `\nRecipient Role: ${recipientRole}`;
  }

  const prompt = `You are a professional networking assistant. Generate a LinkedIn connection request message for the following context.

JOB LISTING:
Title: ${listing.title}
Company: ${listing.company}${recipientContext}

INSTRUCTIONS:
- Generate a LinkedIn connection request message
- The message MUST be 300 characters or fewer (this is a hard limit — LinkedIn enforces it)
- Reference the target role (${listing.title}) and company (${listing.company})
${recipientName ? `- Address the message to ${recipientName} by name in the greeting` : '- Use a general professional greeting'}
${recipientRole ? `- Reference the recipient's role as ${recipientRole}` : ''}
- Keep it concise, professional, and personable
- Express genuine interest in connecting
- Do NOT include a subject line — this is a connection request note only

Respond with a JSON object containing a single "text" field with the connection request message. The "text" value MUST be 300 characters or fewer.`;

  const result = await generateJson({
    prompt,
    schema: textResponseSchema,
    systemInstruction:
      'You are a LinkedIn networking assistant. Always respond with valid JSON containing a "text" field. The text value must be 300 characters or fewer.',
    timeoutMs: AI_TIMEOUT_MS,
  });

  return result.text;
}

/**
 * Generate a follow-up email for a job application (Requirements 8.1–8.6).
 *
 * - Fetches the application and validates stage is Applied or Interviewing
 * - Fetches the associated listing
 * - Generates a stage-appropriate follow-up email
 * - Returns the generated email text
 */
export async function generateFollowUpEmail(
  supabase: SupabaseClient,
  _userId: string,
  applicationId: string
): Promise<string> {
  const application = await fetchApplication(supabase, applicationId);

  // Requirement 8.5: validate stage is Applied or Interviewing
  if (application.stage !== 'Applied' && application.stage !== 'Interviewing') {
    throw new ValidationError(
      'Follow-up emails are only available for Applied and Interviewing stages.'
    );
  }

  const listing = await fetchListing(supabase, application.listing_id);

  const stageContext =
    application.stage === 'Applied'
      ? 'The candidate has recently submitted their application and wants to follow up to express continued interest.'
      : 'The candidate has recently completed an interview and wants to send a thank-you/follow-up email.';

  const stageInstructions =
    application.stage === 'Applied'
      ? `- Write a post-application follow-up email
- Express continued interest in the role
- Briefly reiterate enthusiasm for the position
- Be polite and professional without being pushy
- Keep it concise (3-5 short paragraphs)`
      : `- Write a post-interview thank-you email
- Express gratitude for the interview opportunity
- Reference the company and position title
- Reiterate interest in the role
- Be warm, professional, and concise (3-5 short paragraphs)`;

  const prompt = `You are a professional email writing assistant. Generate a follow-up email for the following job application.

JOB LISTING:
Title: ${listing.title}
Company: ${listing.company}
Location: ${listing.location}

CONTEXT:
${stageContext}

INSTRUCTIONS:
${stageInstructions}
- Reference the company name (${listing.company}) and job title (${listing.title})
- Include a subject line, greeting, body, and sign-off
- Use a professional yet personable tone

Respond with a JSON object containing a single "text" field with the full email text (including subject line).`;

  const result = await generateJson({
    prompt,
    schema: textResponseSchema,
    systemInstruction:
      'You are an email writing assistant. Always respond with valid JSON containing a "text" field.',
    timeoutMs: AI_TIMEOUT_MS,
  });

  return result.text;
}
