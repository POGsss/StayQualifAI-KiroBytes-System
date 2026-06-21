/**
 * OAuth_Callback page.
 *
 * Rendered as a sibling route OUTSIDE the Route_Guard (at `/auth/callback`), so
 * it must perform its own post-authentication navigation. The browser lands
 * here after the Google authorization step carrying the parameters Supabase
 * Auth needs to establish a `Supabase_Session`.
 *
 * Responsibilities (Requirements 2.2–2.5, 3.3):
 *   - On mount, call the store's `completeOAuth()` exactly once (guarded with a
 *     ref so React StrictMode's double-invoke in development does not fire it
 *     twice).
 *   - While processing, render ONLY a full-screen loading state — never the
 *     Login_Screen and never an application module (Req 2.3, 3.3). The loading
 *     visuals mirror the Route_Guard's loading state for a seamless transition.
 *   - React to the resulting terminal `status`:
 *       • `authenticated` → navigate to the retained `redirectTo` (or the
 *         default module `/resume`), clearing `redirectTo` (Req 2.4, 5.5).
 *       • `unauthenticated` → return to `/login`; the LoginPage renders the
 *         error already set on the store (`oauth_failed` / `no_access_token`)
 *         (Req 2.5, 3.5).
 *       • `unavailable` → return to `/login`; the LoginPage owns the
 *         authentication-unavailable UI (Req 10.5).
 *     Navigation is guarded so it runs exactly once.
 *
 * Keying the navigation effect on `status` is deliberate: `completeOAuth()`
 * first sets `initializing` (→ keep loading), then settles on a terminal state
 * (`authenticated` → go home; `unauthenticated` / `unavailable` → go to login),
 * so navigation only happens after the attempt resolves.
 *
 * Named export. Explicit return type. Tailwind utility classes only. No `any`.
 */

import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../stores/auth.store';

/** The Login_Screen route (failure / unavailable destination). */
const LOGIN_ROUTE = '/login';

/** The default application module view when no route was retained. */
const DEFAULT_MODULE_ROUTE = '/resume';

/**
 * OAuth_Callback handler. Renders a loading-only state while establishing the
 * session, then navigates based on the terminal auth status.
 */
export function AuthCallbackPage(): JSX.Element {
  const status = useAuthStore((state) => state.status);
  const redirectTo = useAuthStore((state) => state.redirectTo);
  const completeOAuth = useAuthStore((state) => state.completeOAuth);
  const setRedirectTo = useAuthStore((state) => state.setRedirectTo);

  const navigate = useNavigate();

  // Guard `completeOAuth()` to a single invocation across StrictMode re-mounts.
  const hasStarted = useRef(false);
  // Guard navigation so it fires exactly once on reaching a terminal status.
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;
    void completeOAuth();
  }, [completeOAuth]);

  useEffect(() => {
    if (hasNavigated.current) {
      return;
    }

    if (status === 'authenticated') {
      hasNavigated.current = true;
      const destination =
        redirectTo !== null && redirectTo.length > 0
          ? redirectTo
          : DEFAULT_MODULE_ROUTE;
      setRedirectTo(null);
      navigate(destination, { replace: true });
      return;
    }

    if (status === 'unauthenticated' || status === 'unavailable') {
      // Failure / missing params / timeout / config-missing: the LoginPage
      // renders the error already set on the store.
      hasNavigated.current = true;
      navigate(LOGIN_ROUTE, { replace: true });
    }
    // `initializing` (and the transient `propagating`) keep the loading view.
  }, [status, redirectTo, navigate, setRedirectTo]);

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
      <span className="text-sm font-medium text-gray-500">
        Completing sign-in…
      </span>
    </div>
  );
}
