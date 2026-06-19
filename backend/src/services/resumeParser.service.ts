/**
 * Resume_Parser (Requirements 1.1, 1.4).
 *
 * Extracts an {@link IStructuredResume} from an uploaded `.pdf` or `.docx`
 * file. Text is first extracted from the binary (via `pdf-parse` for PDFs and
 * `mammoth` for Word documents), then segmented heuristically into the
 * structured sections of an `IStructuredResume`:
 *
 *   - contact: name / email / phone / location / links
 *   - summary
 *   - experience / education / additional sections
 *   - skills
 *
 * The heuristics are intentionally conservative: regular expressions detect
 * the machine-recognizable fields (email, phone, links), and section-header
 * detection groups the remaining lines. Whatever cannot be confidently
 * detected is left empty rather than guessed, so the result always conforms to
 * `IStructuredResume`.
 *
 * Any failure to extract text from a `.pdf`/`.docx` (corrupt or unreadable
 * file) is surfaced as a typed {@link ParseError} (Requirement 1.4).
 *
 * The file content may be supplied directly as a Buffer (from the upload
 * middleware's `req.file.buffer`) via {@link parseResume}, or fetched from the
 * `resume-uploads` Supabase Storage bucket via {@link parseResumeFromStorage}.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { Buffer } from 'node:buffer';
import { extname } from 'node:path';

import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { IResumeSection, IStructuredResume, ResumeSectionType } from '../types/resume.types.js';
import { ParseError } from '../utils/errors.js';

/** The Supabase Storage bucket uploaded resume files are read from. */
export const RESUME_UPLOADS_BUCKET = 'resume-uploads';

/** A resume file's raw bytes paired with the original filename. */
export interface ResumeFileInput {
  /** Raw file bytes (e.g. the upload middleware's `req.file.buffer`). */
  buffer: Buffer;
  /** Original filename, used to determine the `.pdf`/`.docx` extension. */
  filename: string;
}

/** Supported upload extensions (lowercase, dot-prefixed). */
const SUPPORTED_EXTENSIONS: readonly string[] = ['.pdf', '.docx'];

/** Matches an email address anywhere in the resume text. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Matches a phone number with an optional country/area code. Requires the
 * canonical 3-3-4 grouping (with flexible separators) so arbitrary digit runs
 * are not mistaken for phone numbers.
 */
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

/** Matches explicit URLs and common profile hosts (bare or `www.`-prefixed). */
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+|(?:linkedin\.com|github\.com|gitlab\.com)\/\S+/gi;

/** Leading list markers stripped from content lines. */
const BULLET_PREFIX = /^[\s]*[•·*\-–—▪◦‣]+\s*/;

/**
 * Maps a recognized section heading to a {@link ResumeSectionType}. Each entry
 * lists the lowercase keywords that, when a short heading line starts with
 * one, classify the section.
 */
const SECTION_KEYWORDS: ReadonlyArray<{ type: ResumeSectionType; keywords: readonly string[] }> = [
  { type: 'summary', keywords: ['summary', 'objective', 'profile', 'about me', 'about'] },
  {
    type: 'experience',
    keywords: [
      'experience',
      'work experience',
      'professional experience',
      'employment',
      'employment history',
      'work history',
    ],
  },
  { type: 'education', keywords: ['education', 'academic background', 'academics'] },
  {
    type: 'skills',
    keywords: ['skills', 'technical skills', 'core competencies', 'competencies', 'technologies'],
  },
  {
    type: 'additional',
    keywords: [
      'projects',
      'certifications',
      'certificates',
      'awards',
      'honors',
      'publications',
      'interests',
      'languages',
      'volunteer',
      'volunteering',
      'activities',
      'references',
      'additional',
      'additional information',
    ],
  },
];

/**
 * Parse a resume file (provided as a Buffer + filename) into a structured
 * resume (Requirement 1.1). Throws {@link ParseError} when the file cannot be
 * parsed (Requirement 1.4).
 */
export async function parseResume(file: ResumeFileInput): Promise<IStructuredResume> {
  const extension: string = extname(file.filename).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new ParseError(
      `Cannot parse file "${file.filename}": only .pdf and .docx files are supported.`,
      { extension, supported: SUPPORTED_EXTENSIONS }
    );
  }

  const rawText: string =
    extension === '.pdf'
      ? await extractPdfText(file.buffer, file.filename)
      : await extractDocxText(file.buffer, file.filename);

  return segmentResume(rawText);
}

/**
 * Download a resume file from the `resume-uploads` Supabase Storage bucket and
 * parse it into a structured resume. The provided client should be the
 * caller's RLS-scoped client so storage access stays scoped to the user.
 *
 * Throws {@link ParseError} when the object cannot be fetched or parsed.
 */
export async function parseResumeFromStorage(
  supabase: SupabaseClient,
  objectPath: string,
  bucket: string = RESUME_UPLOADS_BUCKET
): Promise<IStructuredResume> {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);

  if (error !== null || data === null) {
    throw new ParseError(`Could not read "${objectPath}" from storage bucket "${bucket}".`, {
      bucket,
      objectPath,
      reason: error?.message,
    });
  }

  const buffer: Buffer = Buffer.from(await data.arrayBuffer());
  return parseResume({ buffer, filename: objectPath });
}

/** Extract raw text from a PDF buffer, mapping any failure to {@link ParseError}. */
async function extractPdfText(buffer: Buffer, filename: string): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text;
  } catch (err: unknown) {
    throw new ParseError(`Failed to parse PDF file "${filename}": the file may be corrupt or unreadable.`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Extract raw text from a DOCX buffer, mapping any failure to {@link ParseError}. */
async function extractDocxText(buffer: Buffer, filename: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err: unknown) {
    throw new ParseError(
      `Failed to parse Word document "${filename}": the file may be corrupt or unreadable.`,
      { reason: err instanceof Error ? err.message : String(err) }
    );
  }
}

/**
 * Segment raw resume text into an {@link IStructuredResume} using heuristics.
 */
function segmentResume(rawText: string): IStructuredResume {
  const lines: string[] = splitLines(rawText);

  const contact = extractContact(rawText, lines);
  const sections: IResumeSection[] = extractSections(lines);

  const summary: string = sections
    .filter((section) => section.type === 'summary')
    .flatMap((section) => section.items)
    .join('\n');

  const experience: IResumeSection[] = sections.filter((section) => section.type === 'experience');
  const education: IResumeSection[] = sections.filter((section) => section.type === 'education');
  const additional: IResumeSection[] = sections.filter((section) => section.type === 'additional');

  const skills: string[] = sections
    .filter((section) => section.type === 'skills')
    .flatMap((section) => section.items)
    .flatMap(splitSkillLine)
    .filter((skill) => skill.length > 0);

  return {
    contact,
    summary,
    experience,
    education,
    skills,
    additional,
  };
}

/** Split text into trimmed, non-empty lines. */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Extract the contact block from the whole text plus the top lines. */
function extractContact(rawText: string, lines: string[]): IStructuredResume['contact'] {
  const emailMatch: RegExpMatchArray | null = rawText.match(EMAIL_PATTERN);
  const email: string = emailMatch?.[0] ?? '';

  const phoneMatch: RegExpMatchArray | null = rawText.match(PHONE_PATTERN);
  const phone: string | undefined = phoneMatch?.[0]?.trim();

  const links: string[] = extractLinks(rawText);
  const name: string = detectName(lines);
  const location: string | undefined = detectLocation(lines);

  return {
    name,
    email,
    links,
    ...(phone !== undefined && phone.length > 0 ? { phone } : {}),
    ...(location !== undefined && location.length > 0 ? { location } : {}),
  };
}

/** Collect unique links in order of first appearance. */
function extractLinks(rawText: string): string[] {
  const matches: RegExpMatchArray | null = rawText.match(LINK_PATTERN);
  if (matches === null) {
    return [];
  }
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of matches) {
    const link: string = raw.replace(/[.,;]+$/, '');
    if (!seen.has(link)) {
      seen.add(link);
      links.push(link);
    }
  }
  return links;
}

/**
 * Heuristically detect the candidate's name: the first top-of-document line
 * that is not an email, link, phone number, or recognized section header.
 */
function detectName(lines: string[]): string {
  const HEAD_SCAN_LIMIT = 5;
  const limit: number = Math.min(HEAD_SCAN_LIMIT, lines.length);
  for (let i = 0; i < limit; i += 1) {
    const line: string = lines[i] ?? '';
    if (line.length === 0) {
      continue;
    }
    if (EMAIL_PATTERN.test(line)) {
      continue;
    }
    if (PHONE_PATTERN.test(line)) {
      continue;
    }
    if (/(?:https?:\/\/|www\.)|linkedin\.com|github\.com/i.test(line)) {
      continue;
    }
    if (classifyHeading(line) !== null) {
      continue;
    }
    return line;
  }
  return '';
}

/**
 * Heuristically detect a "City, ST" / "City, Country" location line from the
 * top of the document. Returns undefined when none is confidently found.
 */
function detectLocation(lines: string[]): string | undefined {
  const HEAD_SCAN_LIMIT = 6;
  const limit: number = Math.min(HEAD_SCAN_LIMIT, lines.length);
  const locationPattern = /^[A-Za-z.\s]+,\s*[A-Za-z][A-Za-z.\s]*$/;
  for (let i = 0; i < limit; i += 1) {
    const line: string = lines[i] ?? '';
    if (line.length === 0 || line.length > 60) {
      continue;
    }
    if (EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line)) {
      continue;
    }
    if (classifyHeading(line) !== null) {
      continue;
    }
    if (locationPattern.test(line)) {
      return line;
    }
  }
  return undefined;
}

/**
 * Walk the lines, grouping content under detected section headings into
 * {@link IResumeSection} entries. Lines before the first recognized heading
 * (the contact block) are ignored here — they are handled by
 * {@link extractContact}.
 */
function extractSections(lines: string[]): IResumeSection[] {
  const sections: IResumeSection[] = [];
  let current: IResumeSection | null = null;

  for (const line of lines) {
    const headingType: ResumeSectionType | null = classifyHeading(line);
    if (headingType !== null) {
      current = { type: headingType, heading: line, items: [] };
      sections.push(current);
      continue;
    }
    if (current !== null) {
      const item: string = line.replace(BULLET_PREFIX, '').trim();
      if (item.length > 0) {
        current.items.push(item);
      }
    }
  }

  return sections;
}

/**
 * Classify a line as a section heading, returning its
 * {@link ResumeSectionType} or null when it is not a heading. A heading is a
 * short line (few words) whose normalized text starts with a known keyword.
 */
function classifyHeading(line: string): ResumeSectionType | null {
  const normalized: string = line
    .toLowerCase()
    .replace(BULLET_PREFIX, '')
    .replace(/[:.]+$/, '')
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  // Headings are short — reject long sentences outright.
  const wordCount: number = normalized.split(/\s+/).length;
  if (wordCount > 4) {
    return null;
  }

  for (const { type, keywords } of SECTION_KEYWORDS) {
    for (const keyword of keywords) {
      if (normalized === keyword || normalized.startsWith(`${keyword} `)) {
        return type;
      }
    }
  }
  return null;
}

/** Split a skills line on common delimiters into individual skill tokens. */
function splitSkillLine(line: string): string[] {
  return line
    .split(/[,;|•·]+/)
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}
