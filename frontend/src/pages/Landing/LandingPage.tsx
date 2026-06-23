import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  BauhausBrand,
  BauhausShapeOne,
  BauhausShapeTwo,
  BauhausWordmark,
} from '../../components/Bauhaus/BauhausGraphics';
import { LoginDialog } from '../../components/LoginDialog/LoginDialog';
import { ModuleShowcase } from './ModuleShowcase';
import { useAuthStore } from '../../stores/auth.store';

/** Top-level module navigation labels (marketing header). */
const NAV_LINKS: ReadonlyArray<string> = [
  'Resume',
  'Interview',
  'Job Search',
  'Upskilling',
];

/** The authenticated landing destination (matches App.tsx default module). */
const DASHBOARD_ROUTE = '/resume';

export interface ILandingPageProps {
  /** When true, the sign-in dialog is opened on mount (used by `/login`). */
  autoOpenLogin?: boolean;
}

/**
 * LandingPage — the public, Bauhaus-styled marketing surface shown before
 * sign-in (Figma file MXGwmd1qDNyIOLbmQkyd36, node 20:2).
 *
 * Sections: header (brand + nav + Dashboard CTA), hero (headline, subcopy,
 * Learn More / Get Started, flanking Bauhaus shapes), the interactive
 * {@link ModuleShowcase}, and a footer.
 *
 * "Dashboard" and "Get Started" route authenticated visitors straight to the
 * dashboard; otherwise they open the {@link LoginDialog}.
 */
export function LandingPage({
  autoOpenLogin = false,
}: ILandingPageProps): JSX.Element {
  const [isLoginOpen, setLoginOpen] = useState(autoOpenLogin);
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === 'authenticated';

  useEffect(() => {
    if (autoOpenLogin) {
      setLoginOpen(true);
    }
  }, [autoOpenLogin]);

  const handlePrimaryAction = useCallback((): void => {
    if (isAuthenticated) {
      navigate(DASHBOARD_ROUTE);
    } else {
      setLoginOpen(true);
    }
  }, [isAuthenticated, navigate]);

  const closeLogin = useCallback((): void => {
    setLoginOpen(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bauhaus-bg text-bauhaus-ink">
      {/* Header */}
      <header className="flex items-center justify-between gap-6 bg-white px-6 py-5 lg:px-[100px]">
        <BauhausBrand wordmarkClassName="hidden sm:inline-block" />
        <nav
          aria-label="Modules"
          className="hidden items-center gap-10 text-sm md:flex"
        >
          {NAV_LINKS.map((label) => (
            <a
              key={label}
              href="#modules"
              className="text-bauhaus-ink transition-colors hover:text-bauhaus-blue"
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={handlePrimaryAction}
          className="rounded-[10px] bg-bauhaus-ink px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-bauhaus-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2"
        >
          Dashboard
        </button>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[calc(100vh-70px)] flex-1 items-center justify-center overflow-hidden px-6 py-32 md:py-44">
        <BauhausShapeOne className="pointer-events-none absolute left-0 top-0 w-[260px] sm:w-[360px] lg:block lg:w-[540px]" />
        <BauhausShapeTwo className="pointer-events-none absolute right-0 -bottom-2 w-[260px] sm:w-[360px] lg:block lg:w-[540px]" />

        <div className="relative z-10 flex max-w-2xl flex-col items-center gap-12 text-center">
          <div className="flex flex-col items-center gap-5">
            <h1 className="text-4xl font-extrabold leading-tight md:text-6xl">
              Train with AI.
              <br />
              Get Hired by Humans.
            </h1>
            <p className="max-w-[540px] text-base text-bauhaus-ink/80 md:text-lg">
              Your AI Resume Builder, Interview Coach, and Career Gateway. An
              all-in-one ecosystem designed to keep you highly employable.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="#modules"
              className="rounded-[10px] border-2 border-bauhaus-ink px-10 py-4 text-xs font-medium text-bauhaus-ink transition-colors hover:bg-bauhaus-ink hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2"
            >
              Learn More
            </a>
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="rounded-[10px] bg-bauhaus-ink px-10 py-4 text-xs font-medium text-white transition-colors hover:bg-bauhaus-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Interactive module showcase */}
      <div id="modules" className="scroll-mt-20">
        <ModuleShowcase />
      </div>

      {/* Footer — pure text, no logo */}
      <footer className="flex items-center justify-between gap-4 bg-white px-6 py-5 text-sm text-bauhaus-ink md:px-[100px]">
        <div className="flex items-center gap-6 md:gap-10">
          <span>@2026 StayQualifAI</span>
          <span>KiroBytes</span>
        </div>
        <BauhausWordmark className="hidden sm:inline-block" />
      </footer>

      <LoginDialog open={isLoginOpen} onClose={closeLogin} />
    </div>
  );
}
