/**
 * Root auth-bootstrap hook.
 *
 * Mounted exactly once at the application root (see `App.tsx`), this hook kicks
 * off the auth store's `bootstrap()` so the app determines, on startup, whether
 * a persisted Supabase session exists before any guarded route renders
 * (Requirements 4.1, 4.2, 7.1, 7.4).
 *
 * Subscription ownership: the auth store owns the `onAuthStateChange`
 * subscription for the app lifetime. `bootstrap()` calls the store's internal
 * `subscribeOnce(...)`, which registers a single module-scoped subscription
 * that handles `SIGNED_IN` (session establishment via the resolved session),
 * `TOKEN_REFRESHED` (token re-propagation), and `SIGNED_OUT` (forced sign-out).
 * Because that subscription is app-lifetime and store-owned, this hook does NOT
 * create or tear down a subscription of its own — doing so would duplicate the
 * store's handler. The hook's sole responsibility is to invoke `bootstrap()`
 * once on mount.
 *
 * StrictMode: in development, React intentionally mounts → unmounts → remounts
 * effects to surface unsafe side effects, which would otherwise invoke
 * `bootstrap()` twice. The store's `bootstrap()` is idempotent (it re-derives
 * state from `getSession()` and `subscribeOnce` guards against a duplicate
 * subscription), but we additionally guard with a ref so the bootstrap runs a
 * single time per mounted hook instance regardless of the double-invoke.
 *
 * Named export. Explicit return type. No `any`.
 */

import { useEffect, useRef } from 'react';

import { useAuthStore } from '../stores/auth.store';

/**
 * Trigger the auth store's one-time startup bootstrap.
 *
 * Returns nothing; the resulting auth state is read from `useAuthStore` by the
 * RouteGuard and other consumers.
 */
export function useAuthBootstrap(): void {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    if (hasBootstrapped.current) {
      return;
    }
    hasBootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);
}
