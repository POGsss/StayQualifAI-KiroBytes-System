/**
 * Shared TypeScript types for the Auth feature.
 *
 * Covers the narrowed projections of the Supabase session/user the UI depends
 * on, the auth store's discriminated status/error model, and the store's
 * state + action surface.
 *
 * Named exports only. No `any` (prefer `unknown` + narrowing).
 */

/** Narrowed projection of the Supabase user identity (from the Google profile). */
export interface IUserIdentity {
  id: string;
  /** Display name from the Google profile, when present. */
  name: string | null;
  /** Email from the Google profile, when present. */
  email: string | null;
  /** Avatar URL from the Google profile, when present. */
  avatarUrl: string | null;
}

/** Narrowed projection of the Supabase session the UI depends on. */
export interface ISupabaseSession {
  /** The JWT sent as `Authorization: Bearer <token>` to the backend. */
  accessToken: string;
  /** Unix seconds at which the access token expires (for refresh reasoning). */
  expiresAt: number | null;
  identity: IUserIdentity;
}

/** Discriminated lifecycle status for the Auth_System. */
export type AuthStatus =
  | 'initializing' // bootstrap in progress (Req 7.3 loading)
  | 'unauthenticated' // no session → Login_Screen
  | 'authenticating' // sign-in initiated, awaiting redirect (Req 1.7)
  | 'propagating' // session established, tokens fanning out (Req 3.3)
  | 'authenticated' // tokens propagated, modules may render
  | 'unavailable'; // Supabase client could not initialize (Req 10.5)

/** Typed authentication error surfaced to the Login_Screen. */
export interface IAuthError {
  type:
    | 'oauth_failed'
    | 'session_expired'
    | 'signout_unconfirmed'
    | 'no_access_token'
    | 'config_missing'
    | 'unknown';
  message: string;
}

/** Single source of truth for session/auth state. */
export interface IAuthState {
  status: AuthStatus;
  session: ISupabaseSession | null;
  identity: IUserIdentity | null;
  /** Route to return to after login (Requirements 5.1, 5.5). */
  redirectTo: string | null;
  error: IAuthError | null;
  /** True while a sign-out is in flight (Requirement 6.5). */
  isSigningOut: boolean;
}

/** Auth store actions. */
export interface IAuthActions {
  bootstrap(): Promise<void>; // Req 7
  signIn(): Promise<void>; // Req 1, 2.1
  completeOAuth(): Promise<void>; // Req 2.2–2.5, 3
  signOut(): Promise<void>; // Req 6
  handleAuthFailure(status: number): void; // Req 9.3, 9.6
  setRedirectTo(path: string | null): void; // Req 5.1, 5.5
  clearError(): void;
}

/** Combined store shape (state + actions). */
export type IAuthStore = IAuthState & IAuthActions;

/** Derived display value for the Profile_Control fallback indicator. */
export type FallbackIndicator = string; // single character, or default placeholder

/**
 * Minimal structural input for the pure `toUserIdentity` projection.
 *
 * NOTE: We intentionally do NOT import the Supabase SDK's `User` type here.
 * The `@supabase/supabase-js` dependency is added by a parallel setup task and
 * its install may not yet be visible; depending on the SDK type would create a
 * build-ordering hazard for this pure, framework-agnostic projection. Instead
 * we accept a precisely-typed structural shape that the Supabase `User` already
 * satisfies, keeping the projection fully testable without the SDK. No `any`.
 */
export interface ISupabaseUserLike {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    picture?: string | null;
  } | null;
}

/**
 * Pure projection from a Supabase user-like object to the narrowed
 * `IUserIdentity` the UI depends on.
 *
 * - `name`      ← `user_metadata.full_name ?? user_metadata.name`
 * - `avatarUrl` ← `user_metadata.avatar_url ?? user_metadata.picture`
 * - `email`     ← `user.email`
 *
 * Absent fields collapse to `null`.
 */
export function toUserIdentity(user: ISupabaseUserLike): IUserIdentity {
  const metadata = user.user_metadata ?? null;
  const name = metadata?.full_name ?? metadata?.name ?? null;
  const avatarUrl = metadata?.avatar_url ?? metadata?.picture ?? null;
  const email = user.email ?? null;

  return {
    id: user.id,
    name,
    email,
    avatarUrl,
  };
}
