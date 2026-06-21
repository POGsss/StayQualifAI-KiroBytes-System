/**
 * Supabase Auth client wrapper.
 *
 * This module is the ONLY place in the frontend that imports
 * `@supabase/supabase-js` (the documented, scoped Supabase exception — see
 * `.kiro/steering/tech.md` "Authentication & Authorization"). It exposes a
 * minimal, auth-only surface: OAuth sign-in, session retrieval, sign-out, and
 * an auth-state-change subscription. No database, storage, or realtime
 * operation is reachable through this wrapper, keeping the API-boundary
 * architecture intact and the exception auditable (Requirements 10.1–10.3).
 *
 * Configuration (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`) is read from
 * `import.meta.env`; a missing/empty value throws {@link AuthConfigError} so
 * the Auth_System can render an authentication-unavailable state instead of an
 * application module (Requirements 10.4, 10.5).
 *
 * Named exports only. Explicit return types. No `any`.
 */
import {
  createClient,
  type Session,
  type AuthChangeEvent,
  type Subscription,
} from '@supabase/supabase-js';

/**
 * Thrown when a required Supabase environment variable is absent or empty when
 * the Supabase Auth client initializes (Requirement 10.5).
 *
 * Mirrors the backend typed-error pattern: a stable `name` and a restored
 * prototype chain so `instanceof` works under ES2022 class output.
 */
export class AuthConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
    // Restore the prototype chain (required when extending the built-in Error
    // with down-levelled / ES2022 class output).
    Object.setPrototypeOf(this, AuthConfigError.prototype);
  }
}

/**
 * Auth-only surface over the Supabase client. No database, storage, or realtime
 * methods are exposed — the raw client never escapes this module.
 */
export interface ISupabaseAuthClient {
  /**
   * Begin a Google OAuth sign-in flow, redirecting the browser to the Google
   * authorization page with `redirectTo` as the post-authorization return URL.
   * Rejects if Supabase fails to initiate the flow before redirect.
   */
  signInWithGoogle(redirectTo: string): Promise<void>;
  /** Resolve the current persisted session, or `null` when none exists. */
  getSession(): Promise<Session | null>;
  /** Terminate the current session. Rejects on failure. */
  signOut(): Promise<void>;
  /**
   * Subscribe to auth-state changes (sign-in, token refresh, sign-out).
   * Returns the underlying {@link Subscription}; call `.unsubscribe()` to stop.
   */
  onAuthStateChange(
    handler: (event: AuthChangeEvent, session: Session | null) => void,
  ): Subscription;
}

/** Read a required env var, throwing {@link AuthConfigError} when missing/empty. */
function requireEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const raw = import.meta.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    throw new AuthConfigError(
      `Missing required Supabase configuration: ${name} is absent or empty.`,
    );
  }
  return value;
}

/**
 * Build the auth-only Supabase client.
 *
 * Throws {@link AuthConfigError} when either `VITE_SUPABASE_URL` or
 * `VITE_SUPABASE_ANON_KEY` is missing/empty. The underlying client is
 * configured so the library owns session persistence, automatic token refresh
 * (≥60s before expiry), and OAuth callback detection; the PKCE flow is used for
 * the browser OAuth exchange.
 */
export function createSupabaseAuthClient(): ISupabaseAuthClient {
  const url = requireEnv('VITE_SUPABASE_URL');
  const anonKey = requireEnv('VITE_SUPABASE_ANON_KEY');

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  return {
    async signInWithGoogle(redirectTo: string): Promise<void> {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        throw error;
      }
    },

    async getSession(): Promise<Session | null> {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session;
    },

    async signOut(): Promise<void> {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    },

    onAuthStateChange(
      handler: (event: AuthChangeEvent, session: Session | null) => void,
    ): Subscription {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(handler);
      return subscription;
    },
  };
}
