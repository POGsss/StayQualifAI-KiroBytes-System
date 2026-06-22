import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX } from 'react';

import { MatchPanel } from '../../components/MatchPanel';
import { useResumeStore } from '../../stores/resume.store';
import type {
  IResumeSection,
  IResumeTemplate,
  IStructuredResume,
  ResumeSectionType,
} from '../../types/resume.types';

/**
 * ResumeBuilderPage — build an ATS-parseable resume from a template, edit its
 * sections, save it as a Resume_Version, run a semantic job-match analysis, and
 * generate X-Y-Z achievement bullets.
 *
 * Data flows exclusively through the resume Zustand store; this page never
 * calls the API/service or Supabase directly. A single `useEffect` loads the
 * available templates on mount (Req 5.1). Selecting a template scaffolds an
 * empty `IStructuredResume` locally from the template's section types
 * (Req 5.2); the user edits the section fields (controlled inputs) and saves
 * via `createVersion` (Req 5.3). The Job Description field drives `matchJob`
 * and renders `MatchPanel` (Req 6.2); the experience field drives
 * `generateBullets` (Req 7.1).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 6.2, 7.1
 */

/** Section types that carry repeating, line-oriented entries. */
type ListSectionKey = 'experience' | 'education' | 'additional';

/** Human-readable heading for each resume section type. */
function headingForSection(type: ResumeSectionType): string {
  switch (type) {
    case 'contact':
      return 'Contact';
    case 'summary':
      return 'Summary';
    case 'experience':
      return 'Experience';
    case 'education':
      return 'Education';
    case 'skills':
      return 'Skills';
    case 'additional':
      return 'Additional';
    default:
      return type;
  }
}

/** Build a single empty list-style section for the given type. */
function emptyListSection(type: ListSectionKey): IResumeSection {
  return { type, heading: headingForSection(type), items: [''] };
}

/**
 * Scaffold an empty `IStructuredResume` from a template's declared section
 * types. List-style sections (experience/education/additional) are seeded with
 * a single empty section only when the template includes that type, so the
 * editing form mirrors the chosen template's structure (Req 5.2).
 */
function scaffoldResume(template: IResumeTemplate): IStructuredResume {
  return {
    contact: { name: '', email: '', phone: '', location: '', links: [] },
    summary: '',
    experience: template.sections.includes('experience')
      ? [emptyListSection('experience')]
      : [],
    education: template.sections.includes('education')
      ? [emptyListSection('education')]
      : [],
    skills: [],
    additional: template.sections.includes('additional')
      ? [emptyListSection('additional')]
      : [],
  };
}

/** Split newline-separated textarea content into trimmed-aware item lines. */
function linesToItems(value: string): string[] {
  return value.split('\n');
}

/** Join section item lines back into textarea content. */
function itemsToLines(section: IResumeSection | undefined): string {
  return section ? section.items.join('\n') : '';
}

export function ResumeBuilderPage(): JSX.Element {
  const templates = useResumeStore((state) => state.templates);
  const resumeContent = useResumeStore((state) => state.resumeContent);
  const matchResult = useResumeStore((state) => state.matchResult);
  const bullets = useResumeStore((state) => state.bullets);
  const status = useResumeStore((state) => state.status);
  const error = useResumeStore((state) => state.error);

  const loadTemplates = useResumeStore((state) => state.loadTemplates);
  const setResumeContent = useResumeStore((state) => state.setResumeContent);
  const createVersion = useResumeStore((state) => state.createVersion);
  const matchJob = useResumeStore((state) => state.matchJob);
  const generateBullets = useResumeStore((state) => state.generateBullets);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('');
  const [jobDescription, setJobDescription] = useState<string>('');
  const [experienceText, setExperienceText] = useState<string>('');

  // Single effect: load the ATS-parseable templates on mount (Req 5.1).
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selectedTemplate = useMemo<IResumeTemplate | undefined>(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const isBusy = status === 'loading';

  const handleTemplateChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextId = event.target.value;
    setSelectedTemplateId(nextId);
    const template = templates.find((candidate) => candidate.id === nextId);
    // Scaffold a fresh structured resume from the chosen template (Req 5.2).
    setResumeContent(template ? scaffoldResume(template) : null);
  };

  const updateContactField = (
    field: 'name' | 'email' | 'phone' | 'location',
    value: string,
  ): void => {
    if (!resumeContent) {
      return;
    }
    setResumeContent({
      ...resumeContent,
      contact: { ...resumeContent.contact, [field]: value },
    });
  };

  const updateLinks = (value: string): void => {
    if (!resumeContent) {
      return;
    }
    setResumeContent({
      ...resumeContent,
      contact: { ...resumeContent.contact, links: linesToItems(value) },
    });
  };

  const updateSummary = (value: string): void => {
    if (!resumeContent) {
      return;
    }
    setResumeContent({ ...resumeContent, summary: value });
  };

  const updateSkills = (value: string): void => {
    if (!resumeContent) {
      return;
    }
    const skills = value
      .split(',')
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);
    setResumeContent({ ...resumeContent, skills });
  };

  const updateListSection = (key: ListSectionKey, value: string): void => {
    if (!resumeContent) {
      return;
    }
    const existing = resumeContent[key][0];
    const section: IResumeSection = {
      type: key,
      heading: existing?.heading ?? headingForSection(key),
      items: linesToItems(value),
    };
    setResumeContent({ ...resumeContent, [key]: [section] });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!resumeContent || versionName.trim().length === 0) {
      return;
    }
    // Persist the built resume as a Resume_Version (Req 5.3). Section-level
    // validation (Req 5.4) is enforced server-side and surfaced via `error`.
    await createVersion(versionName.trim(), resumeContent);
  };

  const handleAnalyzeMatch = async (): Promise<void> => {
    if (!resumeContent || jobDescription.trim().length === 0) {
      return;
    }
    // Semantic job-match analysis rendered through MatchPanel (Req 6.2).
    await matchJob(resumeContent, jobDescription.trim());
  };

  const handleGenerateBullets = async (): Promise<void> => {
    if (experienceText.trim().length === 0) {
      return;
    }
    // X-Y-Z achievement bullet generation (Req 7.1).
    await generateBullets(experienceText.trim());
  };

  const sectionTypes: ResumeSectionType[] = selectedTemplate?.sections ?? [];
  const canSave =
    resumeContent !== null && versionName.trim().length > 0 && !isBusy;

  return (
    <section aria-labelledby="builder-heading" className="mx-auto flex max-w-3xl flex-col gap-8 rounded-2xl bg-surface p-6 shadow-panel">
      <header className="flex flex-col gap-1">
        <h1 id="builder-heading" className="text-2xl font-semibold text-primary">
          Resume Builder
        </h1>
        <p className="text-gray-600">
          Pick an ATS-parseable template, fill in each section, then save your resume
          version.
        </p>
      </header>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-md border border-accent-pink bg-accent-pink/30 px-4 py-3 text-sm text-gray-800"
        >
          {error.message}
        </p>
      ) : null}

      {/* Template selection (Req 5.1 / 5.2) */}
      <section aria-labelledby="template-heading" className="flex flex-col gap-3">
        <h2 id="template-heading" className="text-lg font-semibold text-gray-900">
          Template
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="template-select" className="text-sm font-medium text-gray-800">
            Choose a template
          </label>
          <select
            id="template-select"
            value={selectedTemplateId}
            onChange={handleTemplateChange}
            disabled={isBusy && templates.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="">Select a template…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Section editing + save (Req 5.3) */}
      {resumeContent !== null ? (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {sectionTypes.includes('contact') ? (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-gray-900">Contact</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-name" className="text-sm font-medium text-gray-800">
                    Full name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={resumeContent.contact.name}
                    onChange={(event): void => updateContactField('name', event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-email" className="text-sm font-medium text-gray-800">
                    Email
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={resumeContent.contact.email}
                    onChange={(event): void => updateContactField('email', event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-phone" className="text-sm font-medium text-gray-800">
                    Phone
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    value={resumeContent.contact.phone ?? ''}
                    onChange={(event): void => updateContactField('phone', event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-location" className="text-sm font-medium text-gray-800">
                    Location
                  </label>
                  <input
                    id="contact-location"
                    type="text"
                    value={resumeContent.contact.location ?? ''}
                    onChange={(event): void =>
                      updateContactField('location', event.target.value)
                    }
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contact-links" className="text-sm font-medium text-gray-800">
                  Links (one per line)
                </label>
                <textarea
                  id="contact-links"
                  rows={2}
                  value={resumeContent.contact.links.join('\n')}
                  onChange={(event): void => updateLinks(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </fieldset>
          ) : null}

          {sectionTypes.includes('summary') ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="summary" className="text-sm font-medium text-gray-800">
                Professional summary
              </label>
              <textarea
                id="summary"
                rows={3}
                value={resumeContent.summary}
                onChange={(event): void => updateSummary(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : null}

          {sectionTypes.includes('experience') ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="experience-section" className="text-sm font-medium text-gray-800">
                Experience (one bullet per line)
              </label>
              <textarea
                id="experience-section"
                rows={5}
                value={itemsToLines(resumeContent.experience[0])}
                onChange={(event): void => updateListSection('experience', event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : null}

          {sectionTypes.includes('education') ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="education-section" className="text-sm font-medium text-gray-800">
                Education (one entry per line)
              </label>
              <textarea
                id="education-section"
                rows={3}
                value={itemsToLines(resumeContent.education[0])}
                onChange={(event): void => updateListSection('education', event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : null}

          {sectionTypes.includes('skills') ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="skills" className="text-sm font-medium text-gray-800">
                Skills (comma separated)
              </label>
              <input
                id="skills"
                type="text"
                value={resumeContent.skills.join(', ')}
                onChange={(event): void => updateSkills(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : null}

          {sectionTypes.includes('additional') ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="additional-section" className="text-sm font-medium text-gray-800">
                Additional (one entry per line)
              </label>
              <textarea
                id="additional-section"
                rows={3}
                value={itemsToLines(resumeContent.additional[0])}
                onChange={(event): void => updateListSection('additional', event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="version-name" className="text-sm font-medium text-gray-800">
              Version name
            </label>
            <input
              id="version-name"
              type="text"
              value={versionName}
              onChange={(event): void => setVersionName(event.target.value)}
              placeholder="e.g. Frontend Engineer — Acme"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <button
            type="submit"
            disabled={!canSave}
            className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? 'Saving…' : 'Save resume version'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-gray-500">
          Select a template above to start building your resume.
        </p>
      )}

      {/* Semantic job-match analysis (Req 6.2) */}
      <section aria-labelledby="match-section-heading" className="flex flex-col gap-3">
        <h2 id="match-section-heading" className="text-lg font-semibold text-gray-900">
          Job match
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="job-description" className="text-sm font-medium text-gray-800">
            Job description
          </label>
          <textarea
            id="job-description"
            rows={4}
            value={jobDescription}
            onChange={(event): void => setJobDescription(event.target.value)}
            placeholder="Paste the job description to analyze how well your resume matches."
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <button
          type="button"
          onClick={(): void => {
            void handleAnalyzeMatch();
          }}
          disabled={
            resumeContent === null || jobDescription.trim().length === 0 || isBusy
          }
          className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Analyze match
        </button>
        {matchResult !== null ? <MatchPanel result={matchResult} /> : null}
      </section>

      {/* X-Y-Z achievement bullet generation (Req 7.1) */}
      <section aria-labelledby="bullets-section-heading" className="flex flex-col gap-3">
        <h2 id="bullets-section-heading" className="text-lg font-semibold text-gray-900">
          Achievement bullets
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="experience-input" className="text-sm font-medium text-gray-800">
            Describe an experience
          </label>
          <textarea
            id="experience-input"
            rows={3}
            value={experienceText}
            onChange={(event): void => setExperienceText(event.target.value)}
            placeholder="Describe what you did, and we'll rewrite it as X-Y-Z achievement bullets."
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <button
          type="button"
          onClick={(): void => {
            void handleGenerateBullets();
          }}
          disabled={experienceText.trim().length === 0 || isBusy}
          className="self-start rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate bullets
        </button>
        {bullets.length > 0 ? (
          <ul aria-label="Generated achievement bullets" className="flex flex-col gap-2">
            {bullets.map((bullet, index) => (
              <li
                key={`${index}-${bullet}`}
                className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800"
              >
                {bullet}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
