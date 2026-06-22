import { NavLink, Outlet } from 'react-router-dom';
import type { JSX } from 'react';

/**
 * InterviewPage — layout shell for the Interview module.
 *
 * Renders the in-page tab navigation (Simulator / Sessions / STAR)
 * and hosts the active sub-page through React Router's `<Outlet>`. The sidebar
 * links to the module root (`/interview`); these tabs switch between the
 * module's features.
 */

const INTERVIEW_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/interview/simulator', label: 'Simulator' },
  { to: '/interview/sessions', label: 'Sessions' },
  { to: '/interview/stories', label: 'STAR' },
];

export function InterviewPage(): JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <nav aria-label="Interview sections">
        <ul className="flex flex-wrap items-center gap-2 border-b border-gray-200">
          {INTERVIEW_TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }: { isActive: boolean }): string =>
                  [
                    '-mb-px inline-flex items-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
                  ].join(' ')
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="rounded-2xl bg-surface p-6 shadow-panel">
        <Outlet />
      </div>
    </section>
  );
}
