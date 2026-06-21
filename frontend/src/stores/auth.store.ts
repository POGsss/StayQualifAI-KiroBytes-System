/**
 * Auth module Zustand store.
 *
 * Single domain store (one store per module) and the single source of truth for
 * the frontend's authentication/session state. It owns the discriminated
 * `status`, the narrowed `session` + derived `identity`, the post-login
 * `redirectTo`, the last `error`, and the `isSigningOut` re-entry guard.
 *
 * The store reaches Supabase ONLY through the auth-only wrapper
 * (`services/supabaseAuthClient.ts`) and fans the access token out to module
 * services ONLY through the propagation registry (`services/tokenPropagation.ts`).
 * It NEVER imports `@supabase/supabase-js` (the architectural smoke check asserts
 * only the wrapper does), and it NEVER imports module services directly.
 *
 * Navigation is NOT performed here: the store only transitions `status`/state;
 * the RouteGuard and components derive navigation from this state (e.g. a
 * forced sign-out sets `status = 'unauthenticated'`, and the guard redirects to
 * `/login`). `redirectTo` is stored for the guard to consume after login.
 *
 * Named exports only. Explicit return types. No `any` (errors are `unknown`).
 */

import { create } from 'zustand';

import {
  AuthConfigError,
  createSupabaseAuthClient,
  type ISupabaseAuthClient,
} from '../services/supabaseAuthClient';
import { propagateToken } from '../services/tokenPropagation';
import {
  toUserIdentity,
  type IAuthError,
  type IAuthState,
  type IAuthStore,
  type ISupabaseSession,
} from '../types/auth.types';

/**
 * The SDK `Session` shape, derived structurally from the wrapper interface so
 * this module never imports `@supabase/supabase-js` (Requirement 10.1 / the
 * architectural smoke check). `NonNullable<Awaited<...>>` strips the `| null`
 * and the surrounding `Promise<>` from `getSession`'s return type.
 */
type SdkSession = NonNullable<
  Awaited<ReturnType<ISupabaseAuthClient['getSession']>>
>;

/**
 * The `onAuthStateChange` handler signature, derived from the wrapper interface
 * (again avoiding a direct SDK import for the `AuthChangeEvent`/`Session` types).
 */
type AuthChangeHandler = Parameters<
  ISupabaseAuthClient['onAuthStateChange']
>[0];

/** Timeout bounds (ms) per the design's error mapping. */
const BOOTSTRAP_TIMEOUT_MS = 10_000; // Req 7.4, 7.5
const CALLBACK_TIMEOUT_MS = 10_000; // Req 2.2, 2.5
const SIGN_OUT_TIMEOUT_MS = 5_000; // Req 6.1, 6.4

/** Stable user-facing error messages keyed by failure mode. */
const ERROR_MESSAGES = {
  oauth_failed: 'Authentication failed. Please try signing in again.',
  no_access_token: 'Authentication failed. Please try signing in again.',
  session_expired: 'Your session has expired. Please sign in again.',
  signout_unconfirmed:
    'We could not confirm your sign-out, but your session was cleared on this device.',
  config_missing: 'Authentication is currently unavailable.',
  unknown: 'An unexpected authentication error occurred.',
} as const;

/** Build a typed {@link IAuthError} with the canonical message for its type. */
function authError(type: IAuthError['type']): IAuthError {
  return { type, message: ERROR_MESSAGES[type] };
}

/** Marker error used when a raced promise exceeds its timeout bound. */
class TimeoutError extends Error {
  public constructor() {
    super('Operation timed out.');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Race a promise against a timeout. Rejects with {@link TimeoutError} when the
 * bound elapses first; the underlying promise is left to settle on its own.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError());
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

/** Project the SDK session onto the narrowed {@link ISupabaseSession}. */
function toSession(session: SdkSession): ISupabaseSession {
  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
    identity: toUserIdentity(session.user),
  };
}

/** True when the SDK session carries a usable, non-empty access token. */
function hasAccessToken(session: SdkSession | null): session is SdkSession {
  return (
    session !== null &&
    typeof session.access_token === 'string' &&
    session.access_token.length > 0
  );
}

/**
 * Module-scoped Supabase auth client and its auth-state subscription. These are
 * intentionally NOT React/store state: the client is a singleton built lazily
 * (and only once) and the subscription lives for the app lifetime.
 */
let authClient: ISupabaseAuthClient | null = null;
let authSubscription: ReturnType<ISupabaseAuthClient['onAuthStateChange']> | null =
  null;

/**
 * Lazily build (and memoize) the auth client. May throw {@link AuthConfigError}
 * when required Supabase env configuration is missing/empty (Requirement 10.5).
 */
function ensureClient(): ISupabaseAuthClient {
  if (authClient === null) {
    authClient = createSupabaseAuthClient();
  }
  return authClient;
}

/** The initial (pre-bootstrap) state: determining whether a session exists. */
const initialState: IAuthState = {
  status: 'initializing',
  session: null,
  identity: null,
  redirectTo: null,
  error: null,
  isSigningOut: false,
};

export const useAuthStore = create<IAuthStore>((set, get) => {
  /**
   * Establish an authenticated session: enter `propagating`, fan the token out
   * to every module service, then enter `authenticated` (Requirements 3.1, 3.3).
   */
  const establishSession = (session: SdkSession): void => {
    const mapped = toSession(session);
    set({ status: 'propagating', error: null });
    propagateToken(mapped.accessToken);
    set({
      status: 'authenticated',
      session: mapped,
      identity: mapped.identity,
      error: null,
    });
  };

  /**
   * Forced sign-out path shared by 401 handling and refresh/SIGNED_OUT events:
   * clear the token from every module service and drop to the unauthenticated
   * state with the given error (Requirements 4.3, 9.3, 9.4, 9.6).
   */
  const forcedSignOut = (error: IAuthError | null): void => {
    propagateToken(null);
    set({
      status: 'unauthenticated',
      session: null,
      identity: null,
      error,
    });
  };

  /**
   * Auth-state subscription handler. Re-propagates the rotated token on
   * `TOKEN_REFRESHED` (Requirement 4.1) and runs the forced-sign-out path on a
   * non-deliberate `SIGNED_OUT` / refresh rejection (Requirement 4.3). A
   * deliberate sign-out (while `isSigningOut`) is owned by `signOut` itself and
   * is ignored here to avoid surfacing a spurious "session expired" error.
   */
  const handleAuthChange: AuthChangeHandler = (event, session): void => {
    if (event === 'TOKEN_REFRESHED') {
      if (hasAccessToken(session)) {
        const mapped = toSession(session);
        propagateToken(mapped.accessToken);
        set({
          status: 'authenticated',
          session: mapped,
          identity: mapped.identity,
          error: null,
        });
      }
      return;
    }
    if (event === 'SIGNED_OUT') {
      if (get().isSigningOut) {
        return;
      }
      forcedSignOut(authError('session_expired'));
    }
  };

  /** Subscribe to auth-state changes exactly once for the app lifetime. */
  const subscribeOnce = (client: ISupabaseAuthClient): void => {
    if (authSubscription === null) {
      authSubscription = client.onAuthStateChange(handleAuthChange);
    }
  };

  return {
    ...initialState,

    bootstrap: async (): Promise<void> => {
      set({ status: 'initializing', error: null });

      let client: ISupabaseAuthClient;
      try {
        client = ensureClient();
      } catch (cause) {
        if (cause instanceof AuthConfigError) {
          // Req 10.5: client cannot initialize → authentication-unavailable.
          set({
            status: 'unavailable',
            session: null,
            identity: null,
            error: authError('config_missing'),
          });
          return;
        }
        set({
          status: 'unauthenticated',
          session: null,
          identity: null,
          error: authError('unknown'),
        });
        return;
      }

      subscribeOnce(client);

      try {
        const session = await withTimeout(
          client.getSession(),
          BOOTSTRAP_TIMEOUT_MS,
        );
        if (hasAccessToken(session)) {
          establishSession(session);
        } else {
          // No stored session (or one without a token): render the Login_Screen.
          set({ status: 'unauthenticated', session: null, identity: null });
        }
      } catch {
        // Req 7.5 / 9.5: timeout or restore failure → clear state, render Login,
        // no error message.
        set({ status: 'unauthenticated', session: null, identity: null });
      }
    },

    signIn: async (): Promise<void> => {
      // Req 1.6/1.7: enter the loading state and disable the action via status.
      set({ status: 'authenticating', error: null });

      let client: ISupabaseAuthClient;
      try {
        client = ensureClient();
      } catch (cause) {
        if (cause instanceof AuthConfigError) {
          set({ status: 'unavailable', error: authError('config_missing') });
          return;
        }
        set({ status: 'unauthenticated', error: authError('oauth_failed') });
        return;
      }

      try {
        const callbackUrl = `${window.location.origin}/auth/callback`;
        await client.signInWithGoogle(callbackUrl);
        // On success the browser is redirected by Supabase; remain in the
        // `authenticating` loading state until then.
      } catch {
        // Req 1.8: pre-redirect failure → back to Login, re-enable, error shown.
        set({ status: 'unauthenticated', error: authError('oauth_failed') });
      }
    },

    completeOAuth: async (): Promise<void> => {
      // Determining the session from the callback → loading view.
      set({ status: 'initializing', error: null });

      let client: ISupabaseAuthClient;
      try {
        client = ensureClient();
      } catch (cause) {
        if (cause instanceof AuthConfigError) {
          set({ status: 'unavailable', error: authError('config_missing') });
          return;
        }
        forcedSignOut(authError('oauth_failed'));
        return;
      }

      subscribeOnce(client);

      try {
        const session = await withTimeout(
          client.getSession(),
          CALLBACK_TIMEOUT_MS,
        );
        if (session === null) {
          // Req 2.5: missing params / no session → authentication failed.
          set({
            status: 'unauthenticated',
            session: null,
            identity: null,
            error: authError('oauth_failed'),
          });
          return;
        }
        if (!hasAccessToken(session)) {
          // Req 3.5: session without a non-empty token → leave token unset.
          set({
            status: 'unauthenticated',
            session: null,
            identity: null,
            error: authError('no_access_token'),
          });
          return;
        }
        establishSession(session);
      } catch {
        // Req 2.5: timeout (≥10s) or failure → return to Login with error.
        set({
          status: 'unauthenticated',
          session: null,
          identity: null,
          error: authError('oauth_failed'),
        });
      }
    },

    signOut: async (): Promise<void> => {
      // Req 6.5: ignore re-entry while a sign-out is already in flight.
      if (get().isSigningOut) {
        return;
      }
      set({ isSigningOut: true, error: null });

      let client: ISupabaseAuthClient | null = null;
      try {
        client = ensureClient();
      } catch {
        client = null;
      }

      let confirmed = false;
      if (client !== null) {
        try {
          await withTimeout(client.signOut(), SIGN_OUT_TIMEOUT_MS);
          confirmed = true;
        } catch {
          // Req 6.4: failure or ≥5s timeout → still clear locally below.
          confirmed = false;
        }
      }

      // Req 6.2/6.4: ALWAYS clear the token from every module service and drop
      // to the unauthenticated state (the guard then navigates to /login).
      propagateToken(null);
      set({
        status: 'unauthenticated',
        session: null,
        identity: null,
        isSigningOut: false,
        error: confirmed ? null : authError('signout_unconfirmed'),
      });
    },

    handleAuthFailure: (status: number): void => {
      // Req 9.3/9.4/9.6: a 401 on a presumed-active session invalidates it.
      if (status !== 401) {
        return;
      }
      forcedSignOut(authError('session_expired'));
    },

    setRedirectTo: (path: string | null): void => {
      set({ redirectTo: path });
    },

    clearError: (): void => {
      set({ error: null });
    },
  };
});
