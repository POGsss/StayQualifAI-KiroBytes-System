import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { JSX, ReactNode } from 'react';

import { ComingSoonPage } from './pages/ComingSoonPage';
import { JobSearchPage } from './pages/JobSearch/JobSearchPage';
import { ResumePage } from './pages/Resume/ResumePage';
import { ResumeBuilderPage } from './pages/Resume/ResumeBuilderPage';
import { ResumeUploadPage } from './pages/Resume/ResumeUploadPage';
import { ResumeVersionsPage } from './pages/Resume/ResumeVersionsPage';
import { InterviewPage } from './pages/Interview/InterviewPage';
import { InterviewChatPage } from './pages/Interview/InterviewChatPage';
import { InterviewScorecardPage } from './pages/Interview/InterviewScorecardPage';
import { InterviewSessionsPage } from './pages/Interview/InterviewSessionsPage';
import { StarOrganizerPage } from './pages/Interview/StarOrganizerPage';
import { LoginPage } from './pages/Auth/LoginPage';
import { AuthCallbackPage } from './pages/Auth/AuthCallbackPage';
import { RouteGuard } from './components/RouteGuard/RouteGuard';
import { ProfileControl } from './components/ProfileControl/ProfileControl';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { useApiAuthFailure } from './hooks/useApiAuthFailure';
import { useAuthStore } from './stores/auth.store';
// Side-effect import: populates the token-propagation registry (resume +
// interview `setAuthToken`) exactly once at startup, before `bootstrap()` runs.
import './services/registerAuthTokenServices';

/**
 * Root application shell.
 *
 * Provides the fixed purple sidebar with one entry per product module (Resume,
 * Interview, Job Search, Upskilling) and a white top bar whose title reflects
 * the active module. Modules ship one at a time: Resume is implemented; the
 * others render a "coming soon" placeholder. Each module owns its own in-page
 * navigation — the Resume module exposes Scanner / Builder / Versions tabs.
 *
 * Authentication: the shell renders only for authenticated users. The
 * `/login` and `/auth/callback` routes live OUTSIDE the shell; every other
 * route is wrapped in {@link RouteGuard}, which renders the shell only once a
 * Supabase session is established. `useAuthBootstrap()` and
 * `useApiAuthFailure()` run for the app lifetime at the root.
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
  const signOut = useAuthStore((state) => state.signOut);
  const isSigningOut = useAuthStore((state) => state.isSigningOut);

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
        onClick={(): void => {
          void signOut();
        }}
        disabled={isSigningOut}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
  const identity = useAuthStore((state) => state.identity);

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
        <ProfileControl identity={identity} />
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

/**
 * The authenticated application subtree: the existing AppShell (Sidebar +
 * TopBar) wrapping the verbatim module `Routes`. Rendered only when the
 * RouteGuard resolves to an authenticated session.
 */
function AppModules(): JSX.Element {
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

        {/* Interview module — in-page Simulator / Scorecard / Sessions / STAR tabs */}
        <Route path="/interview" element={<InterviewPage />}>
          <Route index element={<Navigate to="/interview/simulator" replace />} />
          <Route path="simulator" element={<InterviewChatPage />} />
          <Route path="scorecard" element={<InterviewScorecardPage />} />
          <Route path="sessions" element={<InterviewSessionsPage />} />
          <Route path="stories" element={<StarOrganizerPage />} />
        </Route>

        {/* Job Search module — in-page Listings / Tracker / AI Writer tabs */}
        <Route path="/jobsearch" element={<JobSearchPage />} />
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

export function App(): JSX.Element {
  // App-lifetime auth wiring: trigger the one-time session bootstrap and bridge
  // any module-store 401 to the auth store's forced sign-out.
  useAuthBootstrap();
  useApiAuthFailure();

  return (
    <Routes>
      {/* Unauthenticated routes — rendered OUTSIDE the AppShell / RouteGuard. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Everything else is guarded: AppShell + module routes render only when
          authenticated. The splat keeps nested module routing intact. */}
      <Route
        path="/*"
        element={
          <RouteGuard>
            <AppModules />
          </RouteGuard>
        }
      />
    </Routes>
  );
}
