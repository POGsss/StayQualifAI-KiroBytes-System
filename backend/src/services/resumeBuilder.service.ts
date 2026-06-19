/**
 * Resume_Builder (Requirements 5.1, 5.2).
 *
 * Lists the ATS-parseable templates stored in `resume_templates` and builds an
 * `IStructuredResume` scaffold from a selected template. Both functions accept
 * the per-request, RLS-scoped Supabase client (`req.supabase`) so all reads
 * remain scoped to the authenticated caller and to active templates only
 * (design.md "Authentication and Tenancy"; the `resume_templates` select policy
 * is `using (is_active = true)`).
 *
 * Property 4 ("Built resume matches its template's section structure") is
 * guaranteed by deriving the scaffold and its inverse extractor from a single
 * shared mapping: for any subset of section types `S`,
 *
 *   sectionTypeSet(getResumeSectionTypes(buildScaffold(S))) === sectionTypeSet(S)
 *
 * `buildScaffold` and `getResumeSectionTypes` are exported so the property test
 * (task 9.2) can assert exactly this.
 *
 * Named exports only. Explicit return types. No `any`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  IResumeSection,
  IResumeTemplate,
  IStructuredResume,
  ResumeSectionType,
} from '../types/resume.types.js';
import { InternalError, NotFoundError } from '../utils/errors.js';

/** Source table for ATS-parseable templates. */
const RESUME_TEMPLATES_TABLE = 'resume_templates';

/** Columns selected from `resume_templates`. */
const TEMPLATE_COLUMNS = 'id, name, sections, is_active';

/**
 * Canonical ordering of section types. Used to emit the extractor's result and
 * the template's section list deterministically.
 */
const SECTION_ORDER: readonly ResumeSectionType[] = [
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'additional',
];

/**
 * Default placeholder headings used when scaffolding a declared section. These
 * double as the presence marker for the non-array fields (`contact`, `summary`)
 * so {@link getResumeSectionTypes} can detect them unambiguously.
 */
const SECTION_HEADINGS: Record<ResumeSectionType, string> = {
  contact: 'Contact Information',
  summary: 'Professional Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  additional: 'Additional',
};

const sectionTypeSchema = z.enum([
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'additional',
]);

/** Shape of a row returned from `resume_templates`. */
const templateRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sections: z.array(sectionTypeSchema),
    is_active: z.boolean(),
  })
  .strict();

type TemplateRow = z.infer<typeof templateRowSchema>;

/**
 * List the active ATS-parseable templates (Requirement 5.1).
 *
 * RLS restricts the result to active templates; the explicit `is_active` filter
 * keeps the intent visible and the result deterministic.
 */
export async function listTemplates(supabase: SupabaseClient): Promise<IResumeTemplate[]> {
  const { data, error } = await supabase
    .from(RESUME_TEMPLATES_TABLE)
    .select(TEMPLATE_COLUMNS)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error !== null) {
    throw new InternalError('Failed to list resume templates.', error.message);
  }

  const parsed = z.array(templateRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new InternalError(
      'resume_templates returned a malformed row shape.',
      parsed.error.format()
    );
  }

  return parsed.data.map(toTemplate);
}

/**
 * Build an `IStructuredResume` scaffold from a selected template (Requirement
 * 5.2). The built resume contains exactly the section types the template
 * declares (Property 4).
 *
 * A missing or inactive template (no readable row) maps to {@link NotFoundError}
 * so the API never reveals the existence of templates the caller cannot read.
 */
export async function buildFromTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<IStructuredResume> {
  const { data, error } = await supabase
    .from(RESUME_TEMPLATES_TABLE)
    .select(TEMPLATE_COLUMNS)
    .eq('is_active', true)
    .eq('id', templateId)
    .maybeSingle();

  if (error !== null) {
    throw new InternalError('Failed to load resume template.', error.message);
  }

  if (data === null) {
    throw new NotFoundError(`Resume template not found: ${templateId}`);
  }

  const parsed = templateRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new InternalError(
      'resume_templates returned a malformed row shape.',
      parsed.error.format()
    );
  }

  return buildScaffold(parsed.data.sections);
}

/**
 * Build an empty `IStructuredResume` scaffold containing exactly the given
 * section types. Declared sections are populated with empty scaffolds (and a
 * default heading placeholder); undeclared sections are left empty so they are
 * not reported as present by {@link getResumeSectionTypes}.
 *
 * Exported so the Property 4 test can drive it directly with arbitrary section
 * subsets.
 */
export function buildScaffold(sections: readonly ResumeSectionType[]): IStructuredResume {
  const declared = new Set<ResumeSectionType>(sections);

  return {
    contact: declared.has('contact')
      ? { name: SECTION_HEADINGS.contact, email: '', links: [] }
      : { name: '', email: '', links: [] },
    summary: declared.has('summary') ? SECTION_HEADINGS.summary : '',
    experience: declared.has('experience') ? [emptySection('experience')] : [],
    education: declared.has('education') ? [emptySection('education')] : [],
    skills: declared.has('skills') ? [''] : [],
    additional: declared.has('additional') ? [emptySection('additional')] : [],
  };
}

/**
 * Determine which section types are present in an `IStructuredResume`. This is
 * the inverse of {@link buildScaffold}: presence of each section type is
 * detected exactly the way the scaffold populates it, so the two compose to the
 * identity on the set of section types (Property 4).
 *
 * Returned in canonical {@link SECTION_ORDER}.
 */
export function getResumeSectionTypes(resume: IStructuredResume): ResumeSectionType[] {
  const present = new Set<ResumeSectionType>();

  if (isContactPresent(resume.contact)) {
    present.add('contact');
  }
  if (resume.summary.trim().length > 0) {
    present.add('summary');
  }
  if (resume.experience.length > 0) {
    present.add('experience');
  }
  if (resume.education.length > 0) {
    present.add('education');
  }
  if (resume.skills.length > 0) {
    present.add('skills');
  }
  if (resume.additional.length > 0) {
    present.add('additional');
  }

  return SECTION_ORDER.filter((type) => present.has(type));
}

/** Map a validated DB row to the public `IResumeTemplate` shape. */
function toTemplate(row: TemplateRow): IResumeTemplate {
  return {
    id: row.id,
    name: row.name,
    sections: SECTION_ORDER.filter((type) => row.sections.includes(type)),
  };
}

/** A contact block counts as present when any field carries content. */
function isContactPresent(contact: IStructuredResume['contact']): boolean {
  return (
    contact.name.trim().length > 0 ||
    contact.email.trim().length > 0 ||
    contact.links.length > 0 ||
    contact.phone !== undefined ||
    contact.location !== undefined
  );
}

/** Build an empty scaffold section of the given type with its default heading. */
function emptySection(type: ResumeSectionType): IResumeSection {
  return { type, heading: SECTION_HEADINGS[type], items: [] };
}
