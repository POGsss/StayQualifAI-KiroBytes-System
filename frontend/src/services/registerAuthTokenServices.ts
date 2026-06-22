/**
 * Startup registration for the token-propagation registry.
 *
 * This module is the single place where every data module's `setAuthToken`
 * is registered with the token-propagation registry (`tokenPropagation.ts`).
 * The auth store never imports module services directly; instead it calls only
 * `propagateToken(token | null)`, which fans the current Supabase access token
 * out to every service registered here. Centralizing registration here keeps
 * the store decoupled from individual modules and gives the app a single,
 * predictable place to populate the registry before bootstrap.
 *
 * The registrations run as a side effect at module load (the top-level call to
 * `registerAllAuthTokenServices()` below), so simply importing this module from
 * the app entry is enough to populate the registry before the auth store's
 * `bootstrap()` runs. `registerAllAuthTokenServices` is also exported as an
 * explicit, idempotent entry point: because `registerAuthTokenService` is
 * idempotent by `id`, calling it again is safe and never produces duplicate
 * registrations.
 *
 * Adding a new module: import its `setAuthToken` (aliased), then add one
 * `registerAuthTokenService({ id, setAuthToken })` call inside
 * `registerAllAuthTokenServices`. No change to the auth store is required.
 *
 * Named exports only. Explicit return types. No `any`.
 */

import { registerAuthTokenService } from './tokenPropagation';
import { setAuthToken as setResumeAuthToken } from './resume.service';
import { setAuthToken as setInterviewAuthToken } from './interview.service';
import { setAuthToken as setJobSearchAuthToken } from './jobsearch.service';
import { setAuthToken as setUpskillingAuthToken } from './upskilling.service';

/**
 * Register every module service's `setAuthToken` with the token-propagation
 * registry. Idempotent: `registerAuthTokenService` keys by `id`, so repeated
 * calls replace rather than duplicate. New modules add one call here.
 */
export function registerAllAuthTokenServices(): void {
  registerAuthTokenService({ id: 'resume', setAuthToken: setResumeAuthToken });
  registerAuthTokenService({ id: 'interview', setAuthToken: setInterviewAuthToken });
  registerAuthTokenService({ id: 'jobsearch', setAuthToken: setJobSearchAuthToken });
  registerAuthTokenService({ id: 'upskilling', setAuthToken: setUpskillingAuthToken });
}

// Populate the registry once at module load so that merely importing this
// module from the app entry guarantees the registry is ready before bootstrap.
registerAllAuthTokenServices();
