import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import { ComingSoonPage } from './pages/ComingSoonPage';
import { JobSearchPage } from './pages/JobSearch/JobSearchPage';
import { UpskillingPage } from './pages/Upskilling/UpskillingPage';
import { ResumePage } from './pages/Resume/ResumePage';
import { ResumeBuilderPage } from './pages/Resume/ResumeBuilderPage';
import { ResumeUploadPage } from './pages/Resume/ResumeUploadPage';
import { ResumeVersionsPage } from './pages/Resume/ResumeVersionsPage';
import { InterviewPage } from './pages/Interview/InterviewPage';
import { InterviewChatPage } from './pages/Interview/InterviewChatPage';
import { InterviewSessionsPage } from './pages/Interview/InterviewSessionsPage';
import { StarOrganizerPage } from './pages/Interview/StarOrganizerPage';
import { LandingPage } from './pages/Landing/LandingPage';
import { AuthCallbackPage } from './pages/Auth/AuthCallbackPage';
import { RouteGuard } from './components/RouteGuard/RouteGuard';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { useApiAuthFailure } from './hooks/useApiAuthFailure';
import { useAuthStore } from './stores/auth.store';
import { useJobSearchStore } from './stores/jobsearch.store';
import type { JobSearchTab } from './stores/jobsearch.store';
import { useUpskillingStore } from './stores/upskilling.store';
import type { UpskillingTab } from './stores/upskilling.store';
// Side-effect import: populates the token-propagation registry (resume +
// interview `setAuthToken`) exactly once at startup, before `bootstrap()` runs.
import './services/registerAuthTokenServices';

/**
 * Root application shell.
 *
 * Provides the fixed dark Bauhaus sidebar (see docs/GLOBAL_REDESIGN.md) with a
 * user profile card at the top, one entry per product module (Resume,
 * Interview, Job Search, Upskilling) in the middle, and a logout button pinned
 * to the bottom. The active module renders with a white pill background and
 * black text; inactive modules render in white text on the dark sidebar. A
 * white top bar reflects the active module title. Each module owns its own
 * in-page navigation.
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
  /** Asset filename under /assets/sidebar/ used when present. */
  iconFile: string;
  /** Inline SVG fallback rendered when the asset file is absent. */
  fallbackIcon: JSX.Element;
}

const MODULE_LINKS: ReadonlyArray<ModuleLink> = [
  {
    to: '/resume',
    label: 'Resume',
    iconFile: 'resume.svg',
    fallbackIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    to: '/interview',
    label: 'Interview',
    iconFile: 'interview.svg',
    fallbackIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      </svg>
    ),
  },
  {
    to: '/jobsearch',
    label: 'Job Search',
    iconFile: 'jobsearch.svg',
    fallbackIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    to: '/upskilling',
    label: 'Upskilling',
    iconFile: 'upskilling.svg',
    fallbackIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 10 12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
      </svg>
    ),
  },
];

/** Inline SVG fallback for the logout card icon (solar:login-3 style). */
const LOGOUT_FALLBACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

/** Derive a short display initial for the sidebar profile card. */
function deriveInitial(name: string | null, email: string | null): string {
  const source = (name ?? email ?? '').trim();
  return source.length > 0 ? source.charAt(0).toUpperCase() : 'S';
}

/**
 * Renders an icon from `/assets/sidebar/<file>`.
 *
 * The SVG is painted via a CSS mask over a `currentColor` background instead of
 * a plain `<img>`, so the icon inherits the surrounding text color exactly —
 * white on inactive links, black (ink) on the active link — with no inversion
 * hacks. If the asset file is missing, an `Image()` probe flips to the inline
 * SVG fallback (which also uses `currentColor`), so nothing ever shows broken.
 */
function SidebarIcon({
  file,
  fallback,
  className,
}: {
  file: string;
  fallback: JSX.Element;
  className?: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = `/assets/sidebar/${file}`;

  useEffect(() => {
    setFailed(false);
    const probe = new Image();
    probe.onerror = (): void => setFailed(true);
    probe.src = src;
    return (): void => {
      probe.onerror = null;
    };
  }, [src]);

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex [&>svg]:h-full [&>svg]:w-full ${className ?? ''}`}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: 'currentColor',
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

/** Resolve the active module's display title from the current pathname. */
function useModuleTitle(): string {
  const { pathname } = useLocation();
  const match = MODULE_LINKS.find((link) => pathname.startsWith(link.to));
  return match?.label ?? 'StayQualifAI';
}

/** Route-driven feature tabs (Resume + Interview own real sub-routes). */
const RESUME_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/resume/scan', label: 'Scanner' },
  { to: '/resume/builder', label: 'Builder' },
  { to: '/resume/versions', label: 'Versions' },
];

const INTERVIEW_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/interview/simulator', label: 'Simulator' },
  { to: '/interview/sessions', label: 'Sessions' },
  { to: '/interview/stories', label: 'STAR' },
];

/** Store-driven feature tabs (Job Search + Upskilling switch via Zustand). */
const JOBSEARCH_TABS: ReadonlyArray<{ id: JobSearchTab; label: string }> = [
  { id: 'listings', label: 'Listings' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'ai-writer', label: 'AI Writer' },
];

const UPSKILLING_TABS: ReadonlyArray<{ id: UpskillingTab; label: string }> = [
  { id: 'Projects', label: 'Projects' },
  { id: 'Roadmap', label: 'Roadmap' },
  { id: 'Courses', label: 'Courses' },
];

/** Shared pill classes for top-bar feature tabs. */
function tabPillClass(isActive: boolean): string {
  return [
    'rounded-full px-4 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    isActive
      ? 'bg-primary text-white'
      : 'text-muted hover:bg-canvas hover:text-ink',
  ].join(' ');
}

/** Top-bar feature tabs for route-based modules (Resume, Interview). */
function RouteTabs({
  tabs,
  ariaLabel,
}: {
  tabs: ReadonlyArray<{ to: string; label: string }>;
  ariaLabel: string;
}): JSX.Element {
  return (
    <nav aria-label={ariaLabel}>
      <ul className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              className={({ isActive }: { isActive: boolean }): string =>
                tabPillClass(isActive)
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Top-bar feature tabs for store-based modules (Job Search, Upskilling).
 * Generic over the module's tab-id union; reads/writes the active tab through
 * the supplied store callbacks. Implements the WAI-ARIA Tabs keyboard pattern
 * (Left/Right/Home/End) with roving focus.
 */
function StoreTabs<T extends string>({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  idPrefix,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  idPrefix: string;
}): JSX.Element {
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: T): void {
    const ids = tabs.map((t) => t.id);
    const currentIndex = ids.indexOf(current);
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % ids.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + ids.length) % ids.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = ids.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextTab = ids[nextIndex];
    if (nextTab === undefined) {
      return;
    }
    onSelect(nextTab);
    document.getElementById(`${idPrefix}-tab-${nextTab}`)?.focus();
  }

  return (
    <nav aria-label={ariaLabel}>
      <div role="tablist" className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const isActive = activeId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={(): void => onSelect(tab.id)}
              onKeyDown={(e): void => handleKeyDown(e, tab.id)}
              className={tabPillClass(isActive)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function JobSearchTabs(): JSX.Element {
  const activeTab = useJobSearchStore((s) => s.activeTab);
  const setActiveTab = useJobSearchStore((s) => s.setActiveTab);
  return (
    <StoreTabs
      tabs={JOBSEARCH_TABS}
      activeId={activeTab}
      onSelect={setActiveTab}
      ariaLabel="Job Search sections"
      idPrefix="jobsearch"
    />
  );
}

function UpskillingTabs(): JSX.Element {
  const activeTab = useUpskillingStore((s) => s.activeTab);
  const setActiveTab = useUpskillingStore((s) => s.setActiveTab);
  return (
    <StoreTabs
      tabs={UPSKILLING_TABS}
      activeId={activeTab}
      onSelect={setActiveTab}
      ariaLabel="Upskilling sections"
      idPrefix="upskilling"
    />
  );
}

/** Renders the active module's feature tabs in the top bar, or nothing. */
function ModuleTabs(): JSX.Element | null {
  const { pathname } = useLocation();
  if (pathname.startsWith('/resume')) {
    return <RouteTabs tabs={RESUME_TABS} ariaLabel="Resume sections" />;
  }
  if (pathname.startsWith('/interview')) {
    return <RouteTabs tabs={INTERVIEW_TABS} ariaLabel="Interview sections" />;
  }
  if (pathname.startsWith('/jobsearch')) {
    return <JobSearchTabs />;
  }
  if (pathname.startsWith('/upskilling')) {
    return <UpskillingTabs />;
  }
  return null;
}

/**
 * Renders the user avatar as a true image (full color preserved — unlike
 * {@link SidebarIcon}, which masks to a single color). Falls back to the
 * provided node (a derived initial) if the file is missing.
 */
function AvatarImage({
  file,
  fallback,
}: {
  file: string;
  fallback: JSX.Element;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return fallback;
  }
  return (
    <img
      src={`/assets/sidebar/${file}`}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={(): void => setFailed(true)}
    />
  );
}

function Sidebar(): JSX.Element {
  const signOut = useAuthStore((state) => state.signOut);
  const isSigningOut = useAuthStore((state) => state.isSigningOut);
  const identity = useAuthStore((state) => state.identity);

  const name = identity?.name ?? null;
  const email = identity?.email ?? null;
  const avatarUrl = identity?.avatarUrl ?? null;
  const displayName = name ?? email ?? 'StayQualifAI';
  const subtitle = email !== null && email.length > 0 ? email : 'Signed in';

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 flex w-[300px] flex-col justify-between bg-sidebar p-5 text-white"
    >
      {/* Top: user profile card + module links (no brand logo, per Figma) */}
      <div className="flex flex-col gap-5">
        {/* User profile card */}
        <div className="flex items-center gap-2.5 rounded-[10px] bg-[#2d2d2d] p-2.5">
          <span className="flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-blue text-base font-semibold text-white">
            {avatarUrl !== null ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <AvatarImage
                file="avatar.svg"
                fallback={
                  <span aria-hidden="true">{deriveInitial(name, email)}</span>
                }
              />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-[5px]">
            <span className="truncate text-sm font-bold text-white">
              {displayName}
            </span>
            <span className="truncate text-xs text-white/50">{subtitle}</span>
          </span>
        </div>

        {/* Module navigation */}
        <ul className="flex flex-col">
          {MODULE_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }: { isActive: boolean }): string =>
                  [
                    'flex h-[50px] items-center gap-2.5 rounded-[10px] p-2.5 text-sm font-bold transition-colors',
                    isActive
                      ? 'bg-white text-ink'
                      : 'text-white hover:bg-white/10',
                  ].join(' ')
                }
              >
                <SidebarIcon
                  file={link.iconFile}
                  fallback={link.fallbackIcon}
                  className="size-[30px] shrink-0"
                />
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom: logout card (exact copy of Figma "Logout Account" button) */}
      <button
        type="button"
        onClick={(): void => {
          void signOut();
        }}
        disabled={isSigningOut}
        className="flex w-full items-center justify-between rounded-[10px] bg-[#2d2d2d] p-2.5 text-left transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex flex-col gap-[5px]">
          <span className="text-sm font-bold text-white">
            {isSigningOut ? 'Logging out…' : 'Logout Account'}
          </span>
          <span className="text-xs text-white/50">Save and exit to home</span>
        </span>
        <SidebarIcon
          file="logout.svg"
          fallback={LOGOUT_FALLBACK_ICON}
          className="size-[30px] shrink-0"
        />
      </button>
    </nav>
  );
}

function TopBar(): JSX.Element {
  const title = useModuleTitle();

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-surface px-8 py-5">
      <h1 className="font-heading text-2xl font-bold text-ink">{title}</h1>
      <ModuleTabs />
    </header>
  );
}

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Sidebar />
      <div className="pl-[300px]">
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

        {/* Interview module — in-page Simulator / Sessions / STAR tabs.
            Scorecard is now merged into Sessions; redirect the old path. */}
        <Route path="/interview" element={<InterviewPage />}>
          <Route index element={<Navigate to="/interview/simulator" replace />} />
          <Route path="simulator" element={<InterviewChatPage />} />
          <Route path="scorecard" element={<Navigate to="/interview/sessions" replace />} />
          <Route path="sessions" element={<InterviewSessionsPage />} />
          <Route path="stories" element={<StarOrganizerPage />} />
        </Route>

        {/* Job Search module — in-page Listings / Tracker / AI Writer tabs */}
        <Route path="/jobsearch" element={<JobSearchPage />} />

        {/* Upskilling module — in-page Projects / Roadmap / Courses tabs */}
        <Route path="/upskilling" element={<UpskillingPage />} />

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
      {/* Public marketing surface — rendered OUTSIDE the AppShell / RouteGuard.
          The Bauhaus landing page hosts the sign-in dialog; `/login` opens that
          same dialog automatically (e.g. when the RouteGuard redirects here). */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LandingPage autoOpenLogin />} />
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
