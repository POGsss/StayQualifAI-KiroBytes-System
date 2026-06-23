import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Panel } from '../../components/Panel';
import { MatchPanel } from '../../components/MatchPanel';
import {
  DocumentPageNav,
  ResumeDocumentFrame,
  ResumeTemplatePreview,
} from '../../components/Resume';
import type { ResumeTemplateKind } from '../../components/Resume';
import { useResumeStore } from '../../stores/resume.store';
import { useAuthStore } from '../../stores/auth.store';
import type {
  IResumeSection,
  IResumeTemplate,
  IStructuredResume,
  ResumeSectionType,
} from '../../types/resume.types';

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
 * types. List-style sections are seeded with a single empty item only when
 * the template includes that type. If existing resume content is provided,
 * we merge and preserve overlapping content fields to prevent data loss.
 */
function scaffoldResume(
  template: IResumeTemplate,
  existing?: IStructuredResume | null,
): IStructuredResume {
  return {
    contact: existing?.contact ?? { name: '', email: '', phone: '', location: '', links: [] },
    summary: existing?.summary ?? '',
    experience: template.sections.includes('experience')
      ? existing && existing.experience.length > 0
        ? existing.experience
        : [emptyListSection('experience')]
      : [],
    education: template.sections.includes('education')
      ? existing && existing.education.length > 0
        ? existing.education
        : [emptyListSection('education')]
      : [],
    skills: template.sections.includes('skills')
      ? existing && existing.skills.length > 0
        ? existing.skills
        : []
      : [],
    additional: template.sections.includes('additional')
      ? existing && existing.additional.length > 0
        ? existing.additional
        : [emptyListSection('additional')]
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

  const navigate = useNavigate();
  const identity = useAuthStore((state) => state.identity);

  // Builder form/selection state lives in the store so it persists across tab
  // switches and navigation to other modules within the SPA session.
  const selectedTemplateId = useResumeStore((state) => state.selectedTemplateId);
  const setSelectedTemplateId = useResumeStore(
    (state) => state.setSelectedTemplateId,
  );
  const versionName = useResumeStore((state) => state.builderVersionName);
  const setVersionName = useResumeStore((state) => state.setBuilderVersionName);
  const jobDescription = useResumeStore((state) => state.builderJobDescription);
  const setJobDescription = useResumeStore(
    (state) => state.setBuilderJobDescription,
  );
  const experienceText = useResumeStore((state) => state.builderExperienceText);
  const setExperienceText = useResumeStore(
    (state) => state.setBuilderExperienceText,
  );
  const activeTab = useResumeStore((state) => state.builderTab);
  const setActiveTab = useResumeStore((state) => state.setBuilderTab);

  // Copy to clipboard state feedback index (ephemeral — not persisted).
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Single effect: load the templates on mount (Req 5.1).
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selectedTemplate = useMemo<IResumeTemplate | undefined>(
    () => {
      if (selectedTemplateId === 'custom') {
        return {
          id: 'custom',
          name: 'Custom Template',
          sections: ['contact', 'summary', 'experience', 'education', 'skills', 'additional'],
        };
      }
      return templates.find((template) => template.id === selectedTemplateId);
    },
    [templates, selectedTemplateId],
  );

  const isBusy = status === 'loading';

  const handleSelectTemplate = (type: 'entry' | 'professional' | 'skills' | 'custom'): void => {
    const defaultContact = {
      name: identity?.name ?? '',
      email: identity?.email ?? '',
      phone: '',
      location: '',
      links: [],
    };

    if (type === 'custom') {
      setSelectedTemplateId('custom');
      setResumeContent({
        contact: resumeContent?.contact ?? defaultContact,
        summary: resumeContent?.summary ?? '',
        experience: resumeContent?.experience && resumeContent.experience.length > 0
          ? resumeContent.experience
          : [emptyListSection('experience')],
        education: resumeContent?.education && resumeContent.education.length > 0
          ? resumeContent.education
          : [emptyListSection('education')],
        skills: resumeContent?.skills && resumeContent.skills.length > 0 ? resumeContent.skills : [],
        additional: resumeContent?.additional && resumeContent.additional.length > 0
          ? resumeContent.additional
          : [emptyListSection('additional')],
      });
      return;
    }

    const template = templates.find((t) => {
      const name = t.name.toLowerCase();
      if (type === 'entry') {
        return name.includes('entry') || name.includes('graduate');
      }
      if (type === 'professional') {
        return name.includes('professional') || name.includes('chronological');
      }
      if (type === 'skills') {
        return name.includes('skill');
      }
      return false;
    });

    if (template) {
      setSelectedTemplateId(template.id);
      setResumeContent(scaffoldResume(template, resumeContent ?? {
        contact: defaultContact,
        summary: '',
        experience: [],
        education: [],
        skills: [],
        additional: [],
      }));
    }
  };

  const isTemplateActive = (type: 'entry' | 'professional' | 'skills' | 'custom'): boolean => {
    if (type === 'custom') {
      return selectedTemplateId === 'custom';
    }
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      return false;
    }
    const name = template.name.toLowerCase();
    if (type === 'entry') {
      return name.includes('entry') || name.includes('graduate');
    }
    if (type === 'professional') {
      return name.includes('professional') || name.includes('chronological');
    }
    if (type === 'skills') {
      return name.includes('skill');
    }
    return false;
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

  const handleSave = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    if (event) {
      event.preventDefault();
    }
    if (!resumeContent || versionName.trim().length === 0) {
      return;
    }

    // Client-side validation before sending request to backend
    if (resumeContent.contact.name.trim().length === 0) {
      useResumeStore.setState({
        status: 'error',
        error: {
          type: 'ValidationError',
          message: 'Required section "contact" is incomplete: a name is required.',
        },
      });
      return;
    }
    if (resumeContent.contact.email.trim().length === 0) {
      useResumeStore.setState({
        status: 'error',
        error: {
          type: 'ValidationError',
          message: 'Required section "contact" is incomplete: an email is required.',
        },
      });
      return;
    }
    const hasExperience = resumeContent.experience.some((section) =>
      section.items.some((item) => item.trim().length > 0)
    );
    if (!hasExperience) {
      useResumeStore.setState({
        status: 'error',
        error: {
          type: 'ValidationError',
          message: 'Required section "experience" must not be empty.',
        },
      });
      return;
    }

    const result = await createVersion(versionName.trim(), resumeContent);
    if (result !== null) {
      setVersionName('');
      navigate('/resume/versions');
    }
  };

  const handleAnalyzeMatch = async (): Promise<void> => {
    if (!resumeContent || jobDescription.trim().length === 0) {
      return;
    }
    await matchJob(resumeContent, jobDescription.trim());
  };

  const handleGenerateBullets = async (): Promise<void> => {
    if (experienceText.trim().length === 0) {
      return;
    }
    await generateBullets(experienceText.trim());
  };

  const handleCopyBullet = (text: string, index: number): void => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const sectionTypes: ResumeSectionType[] = selectedTemplate?.sections ?? [];
  const canSave = resumeContent !== null && versionName.trim().length > 0 && !isBusy;

  // Determine section layout order based on template
  const orderedSections = useMemo<ResumeSectionType[]>(() => {
    if (!selectedTemplate) {
      return [];
    }
    return selectedTemplate.sections.filter((s) => s !== 'contact');
  }, [selectedTemplate]);

  // Resolve which of the four document layouts the preview should render.
  const templateKind = useMemo<ResumeTemplateKind>(() => {
    if (selectedTemplateId === 'custom') {
      return 'custom';
    }
    const template = templates.find((t) => t.id === selectedTemplateId);
    const name = template?.name.toLowerCase() ?? '';
    if (name.includes('entry') || name.includes('graduate')) {
      return 'entry';
    }
    if (name.includes('skill')) {
      return 'skills';
    }
    if (name.includes('professional') || name.includes('chronological')) {
      return 'professional';
    }
    return 'custom';
  }, [templates, selectedTemplateId]);

  return (
    <div className="flex flex-col gap-6">
      {error !== null ? (
        <p
          role="alert"
          className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-ink no-print"
        >
          {error.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[4fr_6fr] gap-6 items-start">
        {/* Left Column: Config, Select Template, Achievement Bullets */}
        <div className="flex flex-col gap-6 no-print">
          {/* Card 1: Resume Description */}
          <Panel aria-label="Resume Description" title="Resume Description">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="version-name" className="text-sm font-medium text-muted">
                  Version Name
                </label>
                <Input
                  id="version-name"
                  type="text"
                  value={versionName}
                  onChange={(event): void => setVersionName(event.target.value)}
                  placeholder="e.g. Frontend Engineer — Acme"
                  disabled={isBusy}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="job-description" className="text-sm font-medium text-muted">
                  Job Description
                </label>
                <textarea
                  id="job-description"
                  rows={4}
                  value={jobDescription}
                  onChange={(event): void => setJobDescription(event.target.value)}
                  placeholder="Paste target job description to match analysis..."
                  className={TEXTAREA_CLASS}
                  disabled={isBusy}
                />
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <Button
                  type="button"
                  onClick={(): void => {
                    void handleAnalyzeMatch();
                  }}
                  disabled={
                    resumeContent === null || jobDescription.trim().length === 0 || isBusy
                  }
                  variant="outline"
                >
                  Analyze Match
                </Button>
                <Button
                  type="button"
                  onClick={(): void => {
                    void handleSave();
                  }}
                  disabled={!canSave}
                >
                  {isBusy ? 'Saving…' : 'Save Resume'}
                </Button>
              </div>

              {matchResult !== null ? (
                <div className="mt-4 border-t border-gray-150 pt-4">
                  <MatchPanel result={matchResult} />
                </div>
              ) : null}
            </div>
          </Panel>

          {/* Card 2: Select Template */}
          <Panel aria-label="Select Template" title="Select Template">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={(): void => handleSelectTemplate('entry')}
                className={`h-[60px] rounded-2xl font-bold text-sm text-white transition-all transform hover:scale-[1.02] flex items-center justify-center text-center p-2 bg-accent-blue ${
                  isTemplateActive('entry') ? 'ring-4 ring-black/40 shadow-md scale-[1.02]' : 'opacity-85 hover:opacity-100'
                }`}
              >
                Entry / Graduate
              </button>
              <button
                type="button"
                onClick={(): void => handleSelectTemplate('professional')}
                className={`h-[60px] rounded-2xl font-bold text-sm text-white transition-all transform hover:scale-[1.02] flex items-center justify-center text-center p-2 bg-accent-yellow ${
                  isTemplateActive('professional') ? 'ring-4 ring-black/40 shadow-md scale-[1.02]' : 'opacity-85 hover:opacity-100'
                }`}
              >
                Professional
              </button>
              <button
                type="button"
                onClick={(): void => handleSelectTemplate('skills')}
                className={`h-[60px] rounded-2xl font-bold text-sm text-white transition-all transform hover:scale-[1.02] flex items-center justify-center text-center p-2 bg-accent-red ${
                  isTemplateActive('skills') ? 'ring-4 ring-black/40 shadow-md scale-[1.02]' : 'opacity-85 hover:opacity-100'
                }`}
              >
                Skill Focused
              </button>
              <button
                type="button"
                onClick={(): void => handleSelectTemplate('custom')}
                className={`h-[60px] rounded-2xl font-bold text-sm text-white transition-all transform hover:scale-[1.02] flex items-center justify-center text-center p-2 bg-neutral-800 ${
                  isTemplateActive('custom') ? 'ring-4 ring-black/40 shadow-md scale-[1.02]' : 'opacity-85 hover:opacity-100'
                }`}
              >
                Custom
              </button>
            </div>
          </Panel>

          {/* Card 3: Achievement Bullets */}
          <Panel aria-label="Achievement Bullets" title="Achievement Bullets">
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
                  disabled={isBusy}
                />
              </div>
              <Button
                type="button"
                onClick={(): void => {
                  void handleGenerateBullets();
                }}
                disabled={experienceText.trim().length === 0 || isBusy}
                className="self-end"
              >
                Generate Bullets
              </Button>

              {bullets.length > 0 ? (
                <div className="flex flex-col gap-2 mt-2">
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">Generated Bullets</h4>
                  <ul aria-label="Generated achievement bullets" className="flex flex-col gap-2">
                    {bullets.map((bullet, index) => (
                      <li
                        key={`${index}-${bullet}`}
                        className="rounded-xl border border-gray-200 bg-canvas p-3 text-xs text-ink flex justify-between items-start gap-3"
                      >
                        <span className="flex-1 leading-relaxed">{bullet}</span>
                        <button
                          type="button"
                          onClick={(): void => handleCopyBullet(bullet, index)}
                          className="shrink-0 p-1 text-muted hover:text-ink hover:bg-gray-100 rounded transition-colors text-[10px] font-semibold"
                          title="Copy to clipboard"
                        >
                          {copiedIndex === index ? 'Copied!' : 'Copy'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        {/* Right Column: Work Space (Form / PDF preview) */}
        <div className="flex flex-col gap-4">
          <Panel
            aria-label="Resume Preview"
            title="Resume Workspace"
            className="flex flex-col relative print-resume-page"
          >
            {/* Top Workspace Content */}
            <div className="flex-1 flex flex-col mb-4">
              {resumeContent !== null ? (
                <>
                  {activeTab === 'edit' ? (
                    /* Edit Form Layout */
                    <form
                      id="resume-builder-form"
                      onSubmit={handleSave}
                      className="flex flex-col gap-6 pr-1 no-print"
                    >
                      {sectionTypes.includes('contact') ? (
                        <fieldset className="flex flex-col gap-6">
                          <div className="grid gap-3 sm:grid-cols-2">
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
                              onChange={(event): void => updateContactField('location', event.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label htmlFor="contact-links" className="text-sm font-medium text-muted">
                              Links (one per line)
                            </label>
                            <textarea
                              id="contact-links"
                              rows={4}
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
                            Professional Summary
                          </label>
                          <textarea
                            id="summary"
                            rows={4}
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
                            rows={4}
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
                            rows={4}
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
                            rows={4}
                            value={itemsToLines(resumeContent.additional[0])}
                            onChange={(event): void => updateListSection('additional', event.target.value)}
                            className={TEXTAREA_CLASS}
                          />
                        </div>
                      ) : null}
                    </form>
                  ) : (
                    /* PDF Document Preview layout */
                    <div className="flex flex-col gap-4 flex-1">
                      <ResumeDocumentFrame
                        toolbarLeft={<DocumentPageNav page={1} total={1} />}
                        toolbarRight={
                          <button
                            type="button"
                            onClick={(): void => window.print()}
                            className="inline-flex items-center gap-1.5 bg-ink text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-ink/90 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                            Print / Save as PDF
                          </button>
                        }
                      >
                        <ResumeTemplatePreview
                          kind={templateKind}
                          content={resumeContent}
                          orderedSections={orderedSections}
                        />
                      </ResumeDocumentFrame>
                    </div>
                  )}
                </>
              ) : (
                /* No template empty state */
                <div className="flex flex-col items-center justify-center min-h-[30rem] text-center p-8 bg-canvas rounded-2xl border border-dashed border-gray-300 flex-1 no-print">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="w-12 h-12 text-muted mb-3"
                  >
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5M16 13H8M16 17H8M10 9H8" />
                  </svg>
                  <p className="text-sm font-semibold text-ink">No Template Selected</p>
                  <p className="text-xs text-muted mt-1 max-w-[250px]">
                    Choose a resume template from the left column to begin customizing your resume.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Actions: Edit/Preview tabs switch — sits directly below the
                workspace content with no separating border (mirrors the Scanner's
                action row). Always visible; disabled until there is content. */}
            <div className="flex justify-end gap-2.5 no-print">
              <Button
                variant={activeTab === 'edit' ? 'primary' : 'outline'}
                aria-pressed={activeTab === 'edit'}
                disabled={resumeContent === null}
                onClick={(): void => setActiveTab('edit')}
              >
                Edit
              </Button>
              <Button
                variant={activeTab === 'preview' ? 'primary' : 'outline'}
                aria-pressed={activeTab === 'preview'}
                disabled={resumeContent === null}
                onClick={(): void => setActiveTab('preview')}
              >
                Preview
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
