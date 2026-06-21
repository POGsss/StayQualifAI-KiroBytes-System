import type { JSX } from 'react';

import { useAuthStore } from '../../stores/auth.store';

/**
 * LoginPage — the Login_Screen for the Auth feature.
 *
 * Presentational page that reads `status` and `error` from the auth store and
 * renders the single Google sign-in action. It is rendered full-screen, OUTSIDE
 * the authenticated AppShell (no sidebar / top bar).
 *
 * Behavior (mapped to requirements):
 * - Renders EXACTLY ONE sign-in control: a native `<button type="button">` whose
 *   visible text and accessible name are both "Continue with Google" — natively
 *   Tab-reachable and Enter/Space-operable (Requirements 1.2, 1.5). No email,
 *   password, magic-link, or alternative-provider control is rendered (Req 1.3).
 * - While `status === 'authenticating'` the button is disabled and a loading
 *   affordance is shown until the browser is redirected (Requirements 1.6, 1.7).
 * - When `status === 'unavailable'` (the Supabase client could not initialize)
 *   an authentication-unavailable notice is shown and the sign-in action is
 *   disabled so no sign-in can be attempted (Requirement 10.5).
 * - When `error` is present its message is rendered in an `role="alert"` region:
 *   authentication-failed for `oauth_failed`/`no_access_token` and session-expired
 *   for `session_expired`. The message persists until the user reactivates the
 *   button (clicking `signIn()` clears the error in the store). A cancelled
 *   authorization leaves `error` null, so no error is shown (Requirements 9.1,
 *   9.2, 9.4).
 *
 * Named export only. Explicit return type. No `any`. Tailwind utility classes
 * with the brand palette only — no inline styles.
 */
export function LoginPage(): JSX.Element {
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);

  const isAuthenticating = status === 'authenticating';
  const isUnavailable = status === 'unavailable';
  const isSignInDisabled = isAuthenticating || isUnavailable;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12 text-ink">
      <section className="flex w-full max-w-md flex-col items-center gap-8 rounded-2xl bg-surface p-10 shadow-panel">
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white"
          >
            S
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            StayQualifAI
          </h1>
          <p className="text-sm text-gray-500">
            Sign in to access your career copilot.
          </p>
        </div>

        {error !== null ? (
          <p
            role="alert"
            className="w-full rounded-xl bg-accent-pink/60 px-4 py-3 text-center text-sm font-medium text-ink"
          >
            {error.message}
          </p>
        ) : null}

        {isUnavailable ? (
          <p
            role="status"
            className="w-full rounded-xl bg-accent-yellow/60 px-4 py-3 text-center text-sm font-medium text-ink"
          >
            Authentication is currently unavailable. Please try again later.
          </p>
        ) : null}

        <button
          type="button"
          onClick={(): void => {
            void signIn();
          }}
          disabled={isSignInDisabled}
          aria-busy={isAuthenticating}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAuthenticating ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
              Signing in…
            </>
          ) : (
            'Continue with Google'
          )}
        </button>
      </section>
    </main>
  );
}
