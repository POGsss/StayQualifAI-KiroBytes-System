import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX } from 'react';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Panel } from '../../components/Panel';
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

const TEXTAREA_CLASS =
  'w-full rounded-[10px] border border-gray-200 bg-canvas px-4 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-bauhaus-blue/40 disabled:cursor-not-allowed disabled:opacity-50';

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

  const templateOptions = useMemo(() => {
    return [
      { value: '', label: 'Select a template…' },
      ...templates.map((template) => ({
        value: template.id,
        label: template.name,
      })),
    ];
  }, [templates]);

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
    <div className="flex flex-col gap-6">
      {error !== null ? (
        <p
          role="alert"
          className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink"
        >
          {error.message}
        </p>
      ) : null}

      {/* Template selection (Req 5.1 / 5.2) */}
      <Panel aria-label="Template selection" title="Template Selection">
        <div className="flex flex-col gap-1.5 max-w-md">
          <label htmlFor="template-select" className="text-sm font-medium text-muted">
            Choose a template
          </label>
          <Select
            id="template-select"
            value={selectedTemplateId}
            onChange={handleTemplateChange}
            disabled={isBusy && templates.length === 0}
            options={templateOptions}
          />
        </div>
      </Panel>

      {/* Section editing + save (Req 5.3) */}
      {resumeContent !== null ? (
        <Panel aria-label="Resume builder form" title="Edit Resume Content">
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            {sectionTypes.includes('contact') ? (
              <fieldset className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-canvas p-5">
                <legend className="px-2 text-sm font-bold text-ink">Contact Info</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="contact-name" className="text-sm font-medium text-muted">
                      Full name
                    </label>
                    <Input
                      id="contact-name"
                      type="text"
                      value={resumeContent.contact.name}
                      onChange={(event): void => updateContactField('name', event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="contact-email" className="text-sm font-medium text-muted">
                      Email
                    </label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={resumeContent.contact.email}
                      onChange={(event): void => updateContactField('email', event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="contact-phone" className="text-sm font-medium text-muted">
                      Phone
                    </label>
                    <Input
                      id="contact-phone"
                      type="tel"
                      value={resumeContent.contact.phone ?? ''}
                      onChange={(event): void => updateContactField('phone', event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="contact-location" className="text-sm font-medium text-muted">
                      Location
                    </label>
                    <Input
                      id="contact-location"
                      type="text"
                      value={resumeContent.contact.location ?? ''}
                      onChange={(event): void =>
                        updateContactField('location', event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-links" className="text-sm font-medium text-muted">
                    Links (one per line)
                  </label>
                  <textarea
                    id="contact-links"
                    rows={2}
                    value={resumeContent.contact.links.join('\n')}
                    onChange={(event): void => updateLinks(event.target.value)}
                    className={TEXTAREA_CLASS}
                  />
                </div>
              </fieldset>
            ) : null}

            {sectionTypes.includes('summary') ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="summary" className="text-sm font-medium text-muted">
                  Professional summary
                </label>
                <textarea
                  id="summary"
                  rows={3}
                  value={resumeContent.summary}
                  onChange={(event): void => updateSummary(event.target.value)}
                  className={TEXTAREA_CLASS}
                />
              </div>
            ) : null}

            {sectionTypes.includes('experience') ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="experience-section" className="text-sm font-medium text-muted">
                  Experience (one bullet per line)
                </label>
                <textarea
                  id="experience-section"
                  rows={5}
                  value={itemsToLines(resumeContent.experience[0])}
                  onChange={(event): void => updateListSection('experience', event.target.value)}
                  className={TEXTAREA_CLASS}
                />
              </div>
            ) : null}

            {sectionTypes.includes('education') ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="education-section" className="text-sm font-medium text-muted">
                  Education (one entry per line)
                </label>
                <textarea
                  id="education-section"
                  rows={3}
                  value={itemsToLines(resumeContent.education[0])}
                  onChange={(event): void => updateListSection('education', event.target.value)}
                  className={TEXTAREA_CLASS}
                />
              </div>
            ) : null}

            {sectionTypes.includes('skills') ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skills" className="text-sm font-medium text-muted">
                  Skills (comma separated)
                </label>
                <Input
                  id="skills"
                  type="text"
                  value={resumeContent.skills.join(', ')}
                  onChange={(event): void => updateSkills(event.target.value)}
                />
              </div>
            ) : null}

            {sectionTypes.includes('additional') ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="additional-section" className="text-sm font-medium text-muted">
                  Additional (one entry per line)
                </label>
                <textarea
                  id="additional-section"
                  rows={3}
                  value={itemsToLines(resumeContent.additional[0])}
                  onChange={(event): void => updateListSection('additional', event.target.value)}
                  className={TEXTAREA_CLASS}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5 max-w-md">
              <label htmlFor="version-name" className="text-sm font-medium text-muted">
                Version name
              </label>
              <Input
                id="version-name"
                type="text"
                value={versionName}
                onChange={(event): void => setVersionName(event.target.value)}
                placeholder="e.g. Frontend Engineer — Acme"
              />
            </div>

            <Button
              type="submit"
              disabled={!canSave}
              className="self-start"
            >
              {isBusy ? 'Saving…' : 'Save resume version'}
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel aria-label="No template selected">
          <p className="text-sm text-muted">
            Select a template above to start building your resume.
          </p>
        </Panel>
      )}

      {/* Semantic job-match analysis (Req 6.2) */}
      <Panel aria-label="Job match" title="Job Match">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="job-description" className="text-sm font-medium text-muted">
              Job description
            </label>
            <textarea
              id="job-description"
              rows={4}
              value={jobDescription}
              onChange={(event): void => setJobDescription(event.target.value)}
              placeholder="Paste the job description to analyze how well your resume matches."
              className={TEXTAREA_CLASS}
            />
          </div>
          <Button
            type="button"
            onClick={(): void => {
              void handleAnalyzeMatch();
            }}
            disabled={
              resumeContent === null || jobDescription.trim().length === 0 || isBusy
            }
            className="self-start"
          >
            Analyze match
          </Button>
          {matchResult !== null ? <MatchPanel result={matchResult} /> : null}
        </div>
      </Panel>

      {/* X-Y-Z achievement bullet generation (Req 7.1) */}
      <Panel aria-label="Achievement bullets" title="Achievement Bullets">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="experience-input" className="text-sm font-medium text-muted">
              Describe an experience
            </label>
            <textarea
              id="experience-input"
              rows={3}
              value={experienceText}
              onChange={(event): void => setExperienceText(event.target.value)}
              placeholder="Describe what you did, and we'll rewrite it as X-Y-Z achievement bullets."
              className={TEXTAREA_CLASS}
            />
          </div>
          <Button
            type="button"
            onClick={(): void => {
              void handleGenerateBullets();
            }}
            disabled={experienceText.trim().length === 0 || isBusy}
            className="self-start"
          >
            Generate bullets
          </Button>
          {bullets.length > 0 ? (
            <ul aria-label="Generated achievement bullets" className="flex flex-col gap-3 mt-2">
              {bullets.map((bullet, index) => (
                <li
                  key={`${index}-${bullet}`}
                  className="rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm text-ink"
                >
                  {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
