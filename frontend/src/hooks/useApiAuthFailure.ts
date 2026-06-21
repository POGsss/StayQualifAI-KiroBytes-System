/**
 * Global API auth-failure observer hook.
 *
 * Bridges the module domain stores to the auth store: whenever any module
 * store surfaces an error carrying `status === 401` (an expired/invalid session
 * detected by a backend API call), this hook invokes the auth store's
 * `handleAuthFailure(401)`, which terminates the session, clears the propagated
 * token from every module service, and drops the app to the unauthenticated
 * state so the RouteGuard redirects to `/login` (Requirements 9.3, 9.4, 9.6).
 *
 * Coupling is intentionally minimal and read-only: the hook only READS the
 * already-present `error.status` field exposed by the module stores
 * (`IStoreError = { type; message; status? }`). It does NOT modify the module
 * services or their stores in any way.
 *
 * Loop safety: `handleAuthFailure` transitions AUTH state only — it never writes
 * back to a module store's `error`, so it cannot re-trigger this effect. As an
 * extra guard, the effect tracks the last error instance it acted on so a single
 * 401 fires `handleAuthFailure` exactly once (re-renders with the same error
 * reference are ignored).
 *
 * Mount this once at the app root (alongside `useAuthBootstrap`). Named export,
 * explicit `void` return type, no `any`.
 */

import { useEffect, useRef } from 'react';

import { useAuthStore } from '../stores/auth.store';
import { useInterviewStore, type IStoreError as IInterviewStoreError } from '../stores/interview.store';
import { useResumeStore, type IStoreError as IResumeStoreError } from '../stores/resume.store';

/** HTTP status that signals an invalidated session. */
const UNAUTHORIZED_STATUS = 401;

/**
 * Observe both module stores' errors and force an auth failure on any 401.
 *
 * Subscribes narrowly to each store's `error` slice (so the hook only re-runs
 * when an error changes) and to the auth store's `handleAuthFailure` action.
 */
export function useApiAuthFailure(): void {
  const interviewError = useInterviewStore((state) => state.error);
  const resumeError = useResumeStore((state) => state.error);
  const handleAuthFailure = useAuthStore((state) => state.handleAuthFailure);

  // Remember the exact error instances already handled so a given 401 only
  // triggers a forced sign-out once, even across unrelated re-renders.
  const handledRef = useRef<{
    interview: IInterviewStoreError | null;
    resume: IResumeStoreError | null;
  }>({ interview: null, resume: null });

  useEffect(() => {
    const interviewUnauthorized =
      interviewError !== null &&
      interviewError.status === UNAUTHORIZED_STATUS &&
      interviewError !== handledRef.current.interview;
    const resumeUnauthorized =
      resumeError !== null &&
      resumeError.status === UNAUTHORIZED_STATUS &&
      resumeError !== handledRef.current.resume;

    // Record the instances we are about to act on so they are not re-handled.
    handledRef.current = { interview: interviewError, resume: resumeError };

    if (interviewUnauthorized || resumeUnauthorized) {
      handleAuthFailure(UNAUTHORIZED_STATUS);
    }
  }, [interviewError, resumeError, handleAuthFailure]);
}
