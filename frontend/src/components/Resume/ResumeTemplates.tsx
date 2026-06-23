/**
 * ResumeTemplates — four distinct, print-ready resume document layouts.
 *
 * The Resume Builder lets the user pick one of four templates (Entry/Graduate,
 * Professional, Skill Focused, Custom). Each maps to a visually different
 * document style rendered on an 8.5×11 sheet. {@link ResumeTemplatePreview}
 * selects the right layout from the `kind` prop so the live preview reflects
 * the chosen template instead of a single fixed design.
 *
 * Presentational only — receives the structured resume and the ordered section
 * list from the page. Named exports only. No `any`.
 */

import type { JSX } from 'react';

import type { IResumeSection, IStructuredResume, ResumeSectionType } from '../../types/resume.types';

/** The four selectable template families. */
export type ResumeTemplateKind = 'entry' | 'professional' | 'skills' | 'custom';

export interface IResumeTemplatePreviewProps {
  kind: ResumeTemplateKind;
  content: IStructuredResume;
  /** Section render order (excludes `contact`), derived from the template. */
  orderedSections: ResumeSectionType[];
}

/** Non-empty item lines from the first section of a list-style group. */
function listItems(sections: IResumeSection[] | undefined): string[] {
  const section = sections?.[0];
  if (!section) {
    return [];
  }
  return section.items.filter((item) => item.trim().length > 0);
}

/** Inline class config that drives one of the single-column templates. */
interface ISingleColumnStyle {
  heading: string;
  body: string;
  bulletList: string;
  skillsAsTags: boolean;
  skillTag: string;
}

/** Heading label per section type. */
function sectionLabel(type: ResumeSectionType): string {
  switch (type) {
    case 'summary':
      return 'Professional Summary';
    case 'experience':
      return 'Experience';
    case 'education':
      return 'Education';
    case 'skills':
      return 'Skills';
    case 'additional':
      return 'Additional Information';
    default:
      return type;
  }
}

/**
 * Render a single resume section using the supplied style config. Returns
 * `null` when the section has no content so empty headings never appear.
 */
function renderSection(
  type: ResumeSectionType,
  content: IStructuredResume,
  style: ISingleColumnStyle,
): JSX.Element | null {
  if (type === 'summary') {
    const summary = content.summary.trim();
    if (summary.length === 0) {
      return null;
    }
    return (
      <section key="summary" className="flex flex-col gap-1.5">
        <h2 className={style.heading}>{sectionLabel('summary')}</h2>
        <p className={style.body}>{summary}</p>
      </section>
    );
  }

  if (type === 'skills') {
    const skills = content.skills.filter((skill) => skill.trim().length > 0);
    if (skills.length === 0) {
      return null;
    }
    return (
      <section key="skills" className="flex flex-col gap-1.5">
        <h2 className={style.heading}>{sectionLabel('skills')}</h2>
        {style.skillsAsTags ? (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {skills.map((skill, idx) => (
              <span key={idx} className={style.skillTag}>
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className={style.body}>{skills.join('  •  ')}</p>
        )}
      </section>
    );
  }

  const items =
    type === 'experience'
      ? listItems(content.experience)
      : type === 'education'
        ? listItems(content.education)
        : type === 'additional'
          ? listItems(content.additional)
          : [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section key={type} className="flex flex-col gap-1.5">
      <h2 className={style.heading}>{sectionLabel(type)}</h2>
      <ul className={style.bulletList}>
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shared contact pieces derived from the resume content. */
function deriveContact(content: IStructuredResume): {
  name: string;
  details: string[];
  links: string[];
} {
  return {
    name: content.contact.name.trim() || 'YOUR NAME',
    details: [content.contact.email, content.contact.phone ?? '', content.contact.location ?? '']
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    links: content.contact.links.filter((link) => link.trim().length > 0),
  };
}

/** Professional — classic serif, centered header, traditional rules. */
function ProfessionalTemplate({ content, orderedSections }: IResumeTemplatePreviewProps): JSX.Element {
  const { name, details, links } = deriveContact(content);
  const style: ISingleColumnStyle = {
    heading:
      'text-[11px] font-bold text-gray-900 tracking-widest uppercase border-b border-gray-400 pb-0.5 font-sans',
    body: 'text-[11px] text-gray-700 leading-relaxed',
    bulletList: 'list-disc list-outside pl-4 text-[11px] text-gray-700 space-y-1',
    skillsAsTags: false,
    skillTag: '',
  };

  return (
    <div className="print-resume-page bg-white shadow-sm border border-gray-300 w-full p-10 font-serif text-gray-800 aspect-[8.5/11] flex flex-col overflow-hidden">
      <header className="text-center border-b-2 border-gray-800 pb-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 tracking-wide uppercase font-sans">{name}</h1>
        <div className="text-[11px] text-gray-600 flex flex-wrap justify-center gap-x-2 gap-y-1 mt-1.5 font-sans">
          {details.map((detail, idx) => (
            <span key={idx}>{idx > 0 ? `• ${detail}` : detail}</span>
          ))}
        </div>
        {links.length > 0 ? (
          <div className="text-[10px] text-gray-500 mt-1 flex flex-wrap justify-center gap-x-2 font-sans">
            {links.map((link, idx) => (
              <span key={idx}>{link}</span>
            ))}
          </div>
        ) : null}
      </header>
      <div className="flex-1 flex flex-col gap-4 text-left">
        {orderedSections.map((type) => renderSection(type, content, style))}
      </div>
    </div>
  );
}

/** Entry / Graduate — friendly sans, left header, colored accents. */
function EntryTemplate({ content, orderedSections }: IResumeTemplatePreviewProps): JSX.Element {
  const { name, details, links } = deriveContact(content);
  const style: ISingleColumnStyle = {
    heading:
      "text-[12px] font-bold text-bauhaus-blue uppercase tracking-wide flex items-center gap-2 before:content-[''] before:inline-block before:w-2.5 before:h-2.5 before:bg-accent-yellow before:rounded-sm",
    body: 'text-[11px] text-gray-700 leading-relaxed',
    bulletList: 'list-disc list-outside pl-4 text-[11px] text-gray-700 space-y-1',
    skillsAsTags: true,
    skillTag:
      'bg-bauhaus-blue/10 border border-bauhaus-blue/30 text-bauhaus-blue text-[10px] px-2 py-0.5 rounded-full',
  };

  return (
    <div className="print-resume-page bg-white shadow-sm border border-gray-300 w-full p-10 font-sans text-gray-800 aspect-[8.5/11] flex flex-col overflow-hidden">
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold text-bauhaus-blue leading-tight">{name}</h1>
        <div className="text-[11px] text-gray-600 flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {details.map((detail, idx) => (
            <span key={idx}>{detail}</span>
          ))}
          {links.map((link, idx) => (
            <span key={`link-${idx}`} className="text-bauhaus-blue">
              {link}
            </span>
          ))}
        </div>
      </header>
      <div className="flex-1 flex flex-col gap-4 text-left">
        {orderedSections.map((type) => renderSection(type, content, style))}
      </div>
    </div>
  );
}

/** Custom — minimalist, neutral, ultra-thin typographic rules. */
function CustomTemplate({ content, orderedSections }: IResumeTemplatePreviewProps): JSX.Element {
  const { name, details, links } = deriveContact(content);
  const style: ISingleColumnStyle = {
    heading: 'text-[10px] font-semibold text-gray-400 uppercase tracking-[0.25em]',
    body: 'text-[11px] text-gray-700 leading-relaxed',
    bulletList: 'list-disc list-outside pl-4 text-[11px] text-gray-700 space-y-1',
    skillsAsTags: false,
    skillTag: '',
  };

  return (
    <div className="print-resume-page bg-white shadow-sm border border-gray-300 w-full p-10 font-sans text-gray-800 aspect-[8.5/11] flex flex-col gap-5 overflow-hidden">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{name}</h1>
        <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {[...details, ...links].map((value, idx) => (
            <span key={idx}>{value}</span>
          ))}
        </div>
      </header>
      <div className="flex-1 flex flex-col gap-5 text-left">
        {orderedSections.map((type) => renderSection(type, content, style))}
      </div>
    </div>
  );
}

/** Skill Focused — two-column layout with a dark sidebar for skills/contact. */
function SkillsTemplate({ content, orderedSections }: IResumeTemplatePreviewProps): JSX.Element {
  const { name, details, links } = deriveContact(content);
  const skills = content.skills.filter((skill) => skill.trim().length > 0);
  const education = listItems(content.education);
  const summary = content.summary.trim();
  const experience = listItems(content.experience);
  const additional = listItems(content.additional);

  const show = (type: ResumeSectionType): boolean => orderedSections.includes(type);
  const mainHeading =
    'text-[12px] font-bold text-gray-900 uppercase tracking-widest border-b-2 border-gray-900 pb-0.5';
  const sideHeading = 'text-[11px] font-bold text-white/90 uppercase tracking-widest';

  return (
    <div className="print-resume-page bg-white shadow-sm border border-gray-300 w-full font-sans text-gray-800 aspect-[8.5/11] flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[34%] bg-gray-900 text-white p-6 flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold leading-tight">{name}</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className={sideHeading}>Contact</h2>
          <div className="flex flex-col gap-0.5 text-[10px] text-white/80 break-words">
            {details.map((detail, idx) => (
              <span key={idx}>{detail}</span>
            ))}
            {links.map((link, idx) => (
              <span key={`link-${idx}`} className="text-accent-yellow">
                {link}
              </span>
            ))}
          </div>
        </div>
        {show('skills') && skills.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h2 className={sideHeading}>Skills</h2>
            <ul className="flex flex-col gap-1 text-[10px] text-white/85">
              {skills.map((skill, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow" />
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {show('education') && education.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h2 className={sideHeading}>Education</h2>
            <ul className="flex flex-col gap-1 text-[10px] text-white/80">
              {education.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      {/* Main column */}
      <main className="flex-1 p-6 flex flex-col gap-4 text-gray-800">
        {show('summary') && summary.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className={mainHeading}>{sectionLabel('summary')}</h2>
            <p className="text-[11px] text-gray-700 leading-relaxed">{summary}</p>
          </section>
        ) : null}
        {show('experience') && experience.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className={mainHeading}>{sectionLabel('experience')}</h2>
            <ul className="list-disc list-outside pl-4 text-[11px] text-gray-700 space-y-1">
              {experience.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {show('additional') && additional.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h2 className={mainHeading}>{sectionLabel('additional')}</h2>
            <ul className="list-disc list-outside pl-4 text-[11px] text-gray-700 space-y-1">
              {additional.map((item, idx) => (
                <li key={idx} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

/**
 * Selects and renders the document layout that matches the chosen template.
 */
export function ResumeTemplatePreview(props: IResumeTemplatePreviewProps): JSX.Element {
  switch (props.kind) {
    case 'entry':
      return <EntryTemplate {...props} />;
    case 'skills':
      return <SkillsTemplate {...props} />;
    case 'custom':
      return <CustomTemplate {...props} />;
    case 'professional':
    default:
      return <ProfessionalTemplate {...props} />;
  }
}
