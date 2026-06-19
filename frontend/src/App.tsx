import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { JSX, ReactNode } from 'react';

import { ResumeBuilderPage } from './pages/Resume/ResumeBuilderPage';
import { ResumeUploadPage } from './pages/Resume/ResumeUploadPage';
import { ResumeVersionsPage } from './pages/Resume/ResumeVersionsPage';

/**
 * Root application shell for the Resume module.
 *
 * Wires React Router routes for the three Resume pages (task 17) under a
 * shared top navigation and app shell.
 */

interface PlaceholderPageProps {
  title: string;
  description: string;
}

function PlaceholderPage({ title, description }: PlaceholderPageProps): JSX.Element {
  return (
    <section aria-labelledby="page-heading" className="mx-auto max-w-3xl">
      <h1 id="page-heading" className="text-2xl font-semibold text-primary">
        {title}
      </h1>
      <p className="mt-2 text-gray-600">{description}</p>
    </section>
  );
}

const NAV_LINKS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/resume/scan', label: 'Scanner' },
  { to: '/resume/builder', label: 'Builder' },
  { to: '/resume/versions', label: 'Versions' },
];

function TopNav(): JSX.Element {
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-6 border-b border-gray-200 bg-white px-6 py-4"
    >
      <span className="text-lg font-bold text-primary">StayQualifAI</span>
      <ul className="flex items-center gap-4">
        {NAV_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }: { isActive: boolean }): string =>
                isActive
                  ? 'rounded-md bg-primary px-3 py-1.5 font-medium text-white'
                  : 'rounded-md px-3 py-1.5 font-medium text-gray-700 hover:bg-primary-50 hover:text-primary'
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <TopNav />
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/resume/scan" replace />} />
        <Route path="/resume" element={<Navigate to="/resume/scan" replace />} />
        <Route path="/resume/scan" element={<ResumeUploadPage />} />
        <Route path="/resume/upload" element={<Navigate to="/resume/scan" replace />} />
        <Route path="/resume/builder" element={<ResumeBuilderPage />} />
        <Route path="/resume/versions" element={<ResumeVersionsPage />} />
        <Route
          path="*"
          element={
            <PlaceholderPage title="Not Found" description="This page does not exist." />
          }
        />
      </Routes>
    </AppShell>
  );
}
