/**
 * Route_Guard component.
 *
 * Wraps the protected application subtree (AppShell + module routes) and decides
 * — purely from the auth store's `status` plus the requested-route kind — whether
 * to render a full-screen loading state, redirect to the Login_Screen, or render
 * the protected modules. The decision itself is delegated to the pure
 * `selectGuardView` helper so it stays exhaustively testable; this component only
 * binds that decision to the store and to react-router navigation.
 *
 * Component API (documented for the App.tsx wiring task 9.2):
 *
 *   `<RouteGuard>{<AppShell>…module routes…</AppShell>}</RouteGuard>`
 *
 * A children-wrapper was chosen over a layout route (`<Outlet/>`) because the
 * existing `App.tsx` composes `AppShell` around a single `<Routes>` block; the
 * guard simply wraps that subtree. `/login` and `/auth/callback` are rendered as
 * sibling routes OUTSIDE the guard, so the guard primarily sees module routes —
 * but `isLoginRoute` is still computed defensively from the current pathname.
 *
 * View handling (Requirements 5.1–5.5, 7.3):
 *   - `loading`     → full-screen accessible loading state; never renders the
 *                     Login_Screen or a module alongside it (Req 7.3 mutual
 *                     exclusion: exactly one of loading / login / module).
 *   - `login`       → on an unauthenticated module route, retain the requested
 *                     route via `setRedirectTo` (once), then redirect to
 *                     `/login` (Req 5.1). No Login flash on a module route while
 *                     authenticated (Req 5.2) — that path renders `module`.
 *   - `unavailable` → redirect to `/login`; the LoginPage owns the
 *                     authentication-unavailable UI (keeps that copy in one
 *                     place — Requirement 10.5).
 *   - `module`      → render the protected `children` (Req 5.2).
 *
 * Post-login navigation (Requirement 5.5): when the store transitions to
 * `authenticated` while a `redirectTo` is retained, navigate to that route (or
 * the default module if it were ever empty) and clear it, via an effect.
 *
 * Named export. Explicit return type. Tailwind utility classes only.
 */

import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../stores/auth.store';
import { selectGuardView } from './viewSelection';

/** The Login_Screen route (rendered as a sibling OUTSIDE this guard). */
const LOGIN_ROUTE = '/login';

/** The default application module view (App.tsx redirects `/` → `/resume`). */
const DEFAULT_MODULE_ROUTE = '/resume';

/** Props for {@link RouteGuard}. */
export interface IRouteGuardProps {
  /** The protected subtree (AppShell + module routes) rendered when authenticated. */
  children: ReactNode;
}

/** Full-screen, accessible loading state shown while the view is `loading`. */
function GuardLoading(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-ink"
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary"
      />
      <span className="text-sm font-medium text-gray-500">Loading…</span>
    </div>
  );
}

/**
 * Route protection + view selection. Derives the render from the auth store via
 * the pure `selectGuardView` and renders exactly one outcome.
 */
export function RouteGuard({ children }: IRouteGuardProps): JSX.Element {
  const status = useAuthStore((state) => state.status);
  const redirectTo = useAuthStore((state) => state.redirectTo);
  const setRedirectTo = useAuthStore((state) => state.setRedirectTo);

  const location = useLocation();
  const navigate = useNavigate();

  const isLoginRoute = location.pathname === LOGIN_ROUTE;
  const view = selectGuardView({ status, isLoginRoute });

  // Post-login navigation (Req 5.5): once authenticated with a retained route,
  // navigate there (or the default module) and clear the retained route so the
  // navigation runs exactly once.
  useEffect(() => {
    if (status === 'authenticated' && redirectTo !== null) {
      const destination = redirectTo.length > 0 ? redirectTo : DEFAULT_MODULE_ROUTE;
      setRedirectTo(null);
      navigate(destination, { replace: true });
    }
  }, [status, redirectTo, navigate, setRedirectTo]);

  // Retain the originally requested module route before redirecting to login
  // (Req 5.1) — only when not already on /login and nothing is retained yet.
  useEffect(() => {
    if (view === 'login' && !isLoginRoute && redirectTo === null) {
      setRedirectTo(`${location.pathname}${location.search}`);
    }
  }, [
    view,
    isLoginRoute,
    redirectTo,
    setRedirectTo,
    location.pathname,
    location.search,
  ]);

  switch (view) {
    case 'loading':
      // Undetermined / token-fan-out / transient post-login: show only loading.
      return <GuardLoading />;

    case 'login':
    case 'unavailable':
      // Redirect to the Login_Screen; LoginPage renders the unavailable state.
      return <Navigate to={LOGIN_ROUTE} replace />;

    case 'module':
      // Authenticated on a module route: render the protected subtree (no flash).
      return <>{children}</>;

    default:
      // Exhaustive over GuardView; safe loading fallback should a view be added.
      return <GuardLoading />;
  }
}
