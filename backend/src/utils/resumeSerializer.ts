/**
 * Resume_Serializer (Requirements 2.1, 2.2, 2.4).
 *
 * Converts an `IStructuredResume` between its in-memory object representation
 * and the stored `jsonb` representation persisted in `resume_versions.content`.
 *
 * The serializer guarantees a lossless round-trip:
 *   deserializeResume(serializeResume(x)) ≡ x   (Property 1, tested in 5.2)
 *
 * On deserialize, a Zod schema validates the stored representation; any
 * malformed input throws a `DeserializationError` (Requirement 2.4).
 *
 * Named exports only. Explicit return types. No `any`.
 */
import { z } from 'zod';

import type { IStructuredResume, ResumeSectionType } from '../types/resume.types.js';
import { DeserializationError } from './errors.js';

/**
 * Schema version embedded in every stored representation so future shape
 * changes can be migrated without ambiguity.
 */
export const STORED_RESUME_SCHEMA_VERSION = 1 as const;

/** Allowed resume section type discriminators. */
const SECTION_TYPES: readonly ResumeSectionType[] = [
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'additional',
];

const sectionTypeSchema = z.enum(
  SECTION_TYPES as [ResumeSectionType, ...ResumeSectionType[]]
);

const resumeSectionSchema = z
  .object({
    type: sectionTypeSchema,
    heading: z.string(),
    items: z.array(z.string()),
  })
  .strict();

const contactSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    location: z.string().optional(),
    links: z.array(z.string()),
  })
  .strict();

const storedResumeSchema = z
  .object({
    schemaVersion: z.literal(STORED_RESUME_SCHEMA_VERSION),
    contact: contactSchema,
    summary: z.string(),
    experience: z.array(resumeSectionSchema),
    education: z.array(resumeSectionSchema),
    skills: z.array(z.string()),
    additional: z.array(resumeSectionSchema),
  })
  .strict();

/**
 * The stored `jsonb` representation of an `IStructuredResume`. This shape is
 * JSON-serializable and is what gets persisted to `resume_versions.content`.
 */
export type StoredResume = z.infer<typeof storedResumeSchema>;

/**
 * Serialize an `IStructuredResume` into its stored `jsonb` representation
 * (Requirement 2.1).
 *
 * Optional contact fields (`phone`, `location`) are only included when present,
 * keeping the stored shape minimal and the round-trip exact.
 */
export function serializeResume(resume: IStructuredResume): StoredResume {
  const { contact } = resume;

  const storedContact: StoredResume['contact'] = {
    name: contact.name,
    email: contact.email,
    links: [...contact.links],
    ...(contact.phone !== undefined ? { phone: contact.phone } : {}),
    ...(contact.location !== undefined ? { location: contact.location } : {}),
  };

  return {
    schemaVersion: STORED_RESUME_SCHEMA_VERSION,
    contact: storedContact,
    summary: resume.summary,
    experience: resume.experience.map(cloneSection),
    education: resume.education.map(cloneSection),
    skills: [...resume.skills],
    additional: resume.additional.map(cloneSection),
  };
}

/**
 * Deserialize a stored representation back into an `IStructuredResume`
 * (Requirement 2.2). Throws `DeserializationError` when the input is malformed
 * (Requirement 2.4).
 */
export function deserializeResume(stored: unknown): IStructuredResume {
  const result = storedResumeSchema.safeParse(stored);

  if (!result.success) {
    throw new DeserializationError(
      'Stored resume content could not be deserialized: malformed or incompatible shape.',
      result.error.format()
    );
  }

  const data = result.data;

  const contact: IStructuredResume['contact'] = {
    name: data.contact.name,
    email: data.contact.email,
    links: [...data.contact.links],
    ...(data.contact.phone !== undefined ? { phone: data.contact.phone } : {}),
    ...(data.contact.location !== undefined ? { location: data.contact.location } : {}),
  };

  return {
    contact,
    summary: data.summary,
    experience: data.experience.map(cloneSection),
    education: data.education.map(cloneSection),
    skills: [...data.skills],
    additional: data.additional.map(cloneSection),
  };
}

/** Deep-copy a single resume section so callers never share array references. */
function cloneSection(section: {
  type: ResumeSectionType;
  heading: string;
  items: string[];
}): { type: ResumeSectionType; heading: string; items: string[] } {
  return {
    type: section.type,
    heading: section.heading,
    items: [...section.items],
  };
}
