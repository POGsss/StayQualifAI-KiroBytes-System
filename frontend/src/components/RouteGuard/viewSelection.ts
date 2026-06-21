/**
 * Pure view-selection and fallback-indicator helpers for the Route_Guard and
 * Profile_Control.
 *
 * These functions are intentionally pure (no React, no store, no I/O) so they
 * can be exhaustively validated by property-based tests:
 *   - `selectGuardView`     → Property 2 (view selection is mutually exclusive
 *                              and status-consistent).
 *   - `deriveFallbackInitial` → Property 3 (fallback indicator derivation).
 *
 * Named exports only. Explicit return types. No `any`.
 */

import type {
  AuthStatus,
  FallbackIndicator,
  IUserIdentity,
} from '../../types/auth.types';

/**
 * The exactly-one outcome the Route_Guard renders for a given auth status and
 * requested-route kind. Matches the design's `GuardView` definition.
 *
 * - `loading`     → full-screen loading state (undetermined / transitional).
 * - `login`       → render the Login_Screen.
 * - `module`      → render the requested application module.
 * - `unavailable` → render the Login_Screen in an authentication-unavailable
 *                   state (Supabase client could not initialize).
 */
export type GuardView = 'loading' | 'login' | 'module' | 'unavailable';

/** Default placeholder shown when no name/email character is derivable. */
export const FALLBACK_PLACEHOLDER: FallbackIndicator = '?';

/** Inputs to the pure view-selection decision. */
export interface ISelectGuardViewInput {
  /** Current Auth_System lifecycle status. */
  status: AuthStatus;
  /** True when the requested route is the Login_Screen route. */
  isLoginRoute: boolean;
}

/**
 * Pure mapping from auth status + requested-route kind to exactly one
 * `GuardView`. Total over every `AuthStatus` and both route kinds.
 *
 * Mapping (per design "Route Guard and View Selection"):
 *
 *   status           | isLoginRoute=false (module route) | isLoginRoute=true (login route)
 *   -----------------|-----------------------------------|--------------------------------
 *   initializing     | loading                           | loading
 *   propagating      | loading                           | loading
 *   authenticating   | login                             | login
 *   unauthenticated  | login   (guard redirects→/login)  | login
 *   authenticated    | module                            | loading (guard redirects→module)
 *   unavailable      | unavailable                       | unavailable
 *
 * Property 2 invariants this satisfies:
 *   - returns exactly one view;
 *   - undetermined (`initializing`) and `propagating` → `loading`;
 *   - `authenticated` never yields `login` for a module route, and never
 *     yields `module` for the login route;
 *   - `unauthenticated` never yields `module`.
 *
 * For `authenticated` + login route we return `loading` (not `module`, not
 * `login`): the Route_Guard renders a transient loading state while it
 * navigates the already-signed-in user to the default application module
 * (Requirement 5.3).
 */
export function selectGuardView(input: ISelectGuardViewInput): GuardView {
  const { status, isLoginRoute } = input;

  switch (status) {
    case 'initializing':
    case 'propagating':
      // Undetermined or token-fan-out in progress: never show login or module.
      return 'loading';

    case 'unavailable':
      // Supabase client could not initialize (Requirement 10.5).
      return 'unavailable';

    case 'authenticated':
      // Module route → render the module. Login route → transitional loading
      // while the guard redirects to the default module (Requirement 5.3).
      return isLoginRoute ? 'loading' : 'module';

    case 'authenticating':
    case 'unauthenticated':
      // No active session: render (or redirect to) the Login_Screen. The guard
      // retains the requested module route in `redirectTo` before redirecting.
      return 'login';

    default:
      // Exhaustiveness guard: if `AuthStatus` gains a member, the compiler
      // flags this branch. Safe, status-neutral fallback.
      return assertNeverStatus(status);
  }
}

/**
 * Pure derivation of the Profile_Control fallback indicator from a
 * `User_Identity` (Requirements 8.3, 8.5).
 *
 * Resolution order (always yields exactly one indicator value):
 *   1. the first alphabetic character of `name`, when `name` contains one;
 *   2. otherwise the first character of `email`, when an email is present
 *      (non-empty);
 *   3. otherwise the fixed default placeholder.
 *
 * No case transformation is applied: the indicator equals the source
 * character as found, matching Property 3 exactly. (Presentational casing, if
 * desired, is the component's concern.)
 */
export function deriveFallbackInitial(
  identity: IUserIdentity | null,
): FallbackIndicator {
  const name = identity?.name ?? null;
  if (name !== null) {
    const alphaMatch = name.match(/[a-zA-Z]/);
    if (alphaMatch !== null) {
      return alphaMatch[0];
    }
  }

  const email = identity?.email ?? null;
  if (email !== null && email.length > 0) {
    return email.charAt(0);
  }

  return FALLBACK_PLACEHOLDER;
}

/** Compile-time exhaustiveness helper; returns a safe default at runtime. */
function assertNeverStatus(_status: never): GuardView {
  return 'loading';
}
