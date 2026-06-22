import { useId, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

/**
 * ModuleShowcase — the interactive second section of the landing page.
 *
 * Layout (per redesign): a dark band that is responsive at the `lg` breakpoint
 * (the same point where the hero's decorative shapes appear). From lg up it is a
 * fixed-height row with four full-height colour bars on the LEFT (gapped,
 * vertical bottom-left labels) and the selected module's details on the RIGHT.
 * Below lg it stacks into a column with the details on TOP and the bars below as
 * full-width horizontal strips with normal horizontal labels. The bars never
 * resize; selecting one swaps the details copy and inverts that bar's colours —
 * its solid fill becomes white and its label takes the bar's original colour;
 * the other bars stay solid with white text.
 *
 * Implemented as an accessible vertical tab pattern (`tablist` / `tab` /
 * `tabpanel`) with full keyboard support (Arrow keys, Home/End) and roving
 * tabindex, satisfying the project's accessibility steering.
 */

interface IShowcaseModule {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Solid background token shown when the bar is not selected. */
  readonly solidClass: string;
  /** Text-colour token applied to the label when the bar IS selected. */
  readonly textClass: string;
}

const MODULES: readonly [IShowcaseModule, ...IShowcaseModule[]] = [
  {
    id: 'resume',
    label: 'Resume',
    solidClass: 'bg-bauhaus-blue',
    textClass: 'text-bauhaus-blue',
    description:
      'Scan any resume against a job description for a 0–100% ATS compatibility score, build ATS-parseable resumes with an AI job matcher and X-Y-Z bullet writing, then clone and switch between targeted versions.',
  },
  {
    id: 'interview',
    label: 'Interview',
    solidClass: 'bg-bauhaus-yellow',
    textClass: 'text-bauhaus-yellow',
    description:
      'Run custom mock interviews driven by your resume and the target role across Entry to Lead difficulty tiers, review a performance scorecard for grades, grammar and pressure handling, and organise your stories with the STAR framework.',
  },
  {
    id: 'jobsearch',
    label: 'Job Search',
    solidClass: 'bg-bauhaus-red',
    textClass: 'text-bauhaus-red',
    description:
      'Discover a deduplicated job feed with smart remote / hybrid / onsite filters and direct apply, track every application on a visual Kanban board, and draft cover letters, outreach and follow-ups with the AI writer.',
  },
  {
    id: 'upskilling',
    label: 'Upskilling',
    solidClass: 'bg-bauhaus-blue',
    textClass: 'text-bauhaus-blue',
    description:
      'Accelerate your growth with personalized, role-based project blueprints, like building popular app clones, paired with step-by-step career roadmaps and certified course suggestions.',
  },
];

export function ModuleShowcase(): JSX.Element {
  const [selected, setSelected] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const lastIndex = MODULES.length - 1;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = selected === lastIndex ? 0 : selected + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = selected === 0 ? lastIndex : selected - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  const active = MODULES[selected] ?? MODULES[0];

  return (
    <section className="flex w-full flex-col overflow-hidden bg-bauhaus-ink py-10 lg:h-[480px] lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:px-[100px] lg:py-0">
      {/* Bars — full-width strips stacked vertically below lg (after the
          details); full-height vertical bars on the left from lg up (gapped). */}
      <div
        role="tablist"
        aria-label="Product modules"
        aria-orientation="vertical"
        className="order-2 flex w-full flex-col gap-2 lg:order-none lg:h-full lg:w-auto lg:flex-row lg:gap-3"
      >
        {MODULES.map((module, index) => {
          const isActive = index === selected;
          return (
            <button
              key={module.id}
              ref={(el): void => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${module.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={(): void => setSelected(index)}
              onKeyDown={handleKeyDown}
              className={[
                'flex h-20 w-full items-center justify-start px-6 transition-colors duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/70 lg:h-full lg:w-[140px] lg:flex-col lg:items-center lg:justify-end lg:px-5 lg:py-5',
                isActive
                  ? `bg-white ${module.textClass}`
                  : `${module.solidClass} text-white`,
              ].join(' ')}
            >
              <span className="whitespace-nowrap text-2xl font-bold lg:rotate-180 lg:text-6xl lg:[writing-mode:vertical-rl]">
                {module.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Details — above the bars on mobile, to the right from lg up. */}
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active.id}`}
        className="order-1 flex flex-col justify-center gap-3 px-6 py-8 text-white lg:order-none lg:px-0 lg:py-0"
      >
        <h2 className="text-xl font-bold lg:text-2xl">{active.label}</h2>
        <p className="max-w-xl text-sm leading-relaxed text-white/85 lg:text-base">
          {active.description}
        </p>
      </div>
    </section>
  );
}
