import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { JSX, ReactNode } from 'react';

import { ComingSoonPage } from './pages/ComingSoonPage';
import { ResumePage } from './pages/Resume/ResumePage';
import { ResumeBuilderPage } from './pages/Resume/ResumeBuilderPage';
import { ResumeUploadPage } from './pages/Resume/ResumeUploadPage';
import { ResumeVersionsPage } from './pages/Resume/ResumeVersionsPage';

/**
 * Root application shell.
 *
 * Provides the fixed purple sidebar with one entry per product module (Resume,
 * Interview, Job Search, Upskilling) and a white top bar whose title reflects
 * the active module. Modules ship one at a time: Resume is implemented; the
 * others render a "coming soon" placeholder. Each module owns its own in-page
 * navigation — the Resume module exposes Scanner / Builder / Versions tabs.
 */

interface ModuleLink {
  to: string;
  label: string;
  icon: string;
}

const MODULE_LINKS: ReadonlyArray<ModuleLink> = [
  { to: '/resume', label: 'Resume', icon: '⊞' },
  { to: '/interview', label: 'Interview', icon: '◑' },
  { to: '/jobsearch', label: 'Job Search', icon: '⚲' },
  { to: '/upskilling', label: 'Upskilling', icon: '◔' },
];

/** Resolve the active module's display title from the current pathname. */
function useModuleTitle(): string {
  const { pathname } = useLocation();
  const match = MODULE_LINKS.find((link) => pathname.startsWith(link.to));
  return match?.label ?? 'StayQualifAI';
}

function Sidebar(): JSX.Element {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 flex w-60 flex-col bg-primary px-5 py-7 text-white"
    >
      <div className="flex items-center gap-3 px-2">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl font-bold"
        >
          S
        </span>
        <span className="text-xl font-bold tracking-tight">StayQualifAI</span>
      </div>

      <ul className="mt-10 flex flex-1 flex-col gap-1">
        {MODULE_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }: { isActive: boolean }): string =>
                [
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {link.icon}
              </span>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ⏻
        </span>
        Log out
      </button>
    </nav>
  );
}

function TopBar(): JSX.Element {
  const title = useModuleTitle();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-surface px-8 py-6">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <div className="flex items-center gap-4">
        <label className="relative block">
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder="Search resumes, versions, keywords"
            className="w-72 rounded-full border border-gray-200 bg-canvas px-5 py-2.5 text-sm text-ink placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <button
          type="button"
          aria-label="Profile menu"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-green text-ink"
        >
          <span aria-hidden="true">●</span>
        </button>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar />
      <div className="pl-60">
        <TopBar />
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/resume" replace />} />

        {/* Resume module — in-page Scanner / Builder / Versions tabs */}
        <Route path="/resume" element={<ResumePage />}>
          <Route index element={<Navigate to="/resume/scan" replace />} />
          <Route path="scan" element={<ResumeUploadPage />} />
          <Route path="upload" element={<Navigate to="/resume/scan" replace />} />
          <Route path="builder" element={<ResumeBuilderPage />} />
          <Route path="versions" element={<ResumeVersionsPage />} />
        </Route>

        {/* Modules shipped one at a time — placeholders for now */}
        <Route
          path="/interview"
          element={
            <ComingSoonPage
              title="Interview Prep & Coaching"
              description="Mock interviews, performance scorecards, and a STAR story organizer are on the way."
            />
          }
        />
        <Route
          path="/jobsearch"
          element={
            <ComingSoonPage
              title="Job Discovery & Tracking"
              description="Smart job listings, a visual application tracker, and an AI email writer are on the way."
            />
          }
        />
        <Route
          path="/upskilling"
          element={
            <ComingSoonPage
              title="Learning Paths & Skill Gaps"
              description="Role-based projects, career roadmaps, and course recommendations are on the way."
            />
          }
        />

        <Route
          path="*"
          element={
            <ComingSoonPage
              title="Page not found"
              description="This page does not exist yet. Use the sidebar to navigate to an available module."
            />
          }
        />
      </Routes>
    </AppShell>
  );
}
