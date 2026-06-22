import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, JSX, MouseEvent } from 'react';

import { useAuthStore } from '../../stores/auth.store';
import {
  BauhausBrand,
  BauhausShapeThree,
  GoogleIcon,
} from '../Bauhaus/BauhausGraphics';

/**
 * LoginDialog — the StayQualifAI sign-in surface rendered as a native modal
 * `<dialog>` (per the project's modern-web steering: native `<dialog>` +
 * `.showModal()`, no third-party modal package).
 *
 * Visual design is a 1:1 implementation of the Figma "Login" frame
 * (file MXGwmd1qDNyIOLbmQkyd36, node 47:678): a 640×480 rounded card split into
 * a white credential panel (left) and a decorative Bauhaus panel (right).
 *
 * Auth wiring: the platform currently supports Google OAuth only (see
 * steering/tech.md — "no login/auth UI flow" / Supabase Google sign-in). The
 * "Continue with Google" action therefore drives the real `signIn()` from the
 * auth store. The username/password fields are rendered for design fidelity and
 * accessibility, but email/password is not yet backed by the API; submitting
 * surfaces an inline notice directing the user to Google sign-in.
 *
 * Open/close is controlled by the parent via `open`; the component mirrors that
 * onto the imperative dialog API and reports user-driven closes (Escape,
 * backdrop click, close button) through `onClose`.
 */
export interface ILoginDialogProps {
  /** Whether the modal should be shown. */
  open: boolean;
  /** Called when the user dismisses the dialog (Escape, backdrop, close button). */
  onClose: () => void;
}

export function LoginDialog({ open, onClose }: ILoginDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [credentialNotice, setCredentialNotice] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);

  const isAuthenticating = status === 'authenticating';
  const isUnavailable = status === 'unavailable';
  const isSignInDisabled = isAuthenticating || isUnavailable;

  // Mirror the controlled `open` prop onto the imperative dialog API. The
  // feature check keeps non-DOM test environments (jsdom without dialog
  // support) from throwing — the children remain in the DOM regardless.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else if (!open && dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [open]);

  // Bridge a native close (Escape key / programmatic) back to the parent.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    const handleClose = (): void => {
      onClose();
    };
    dialog.addEventListener('close', handleClose);
    return (): void => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  // Close when the backdrop (the dialog element itself) is clicked.
  const handleDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  const handleCredentialSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Email/password is not yet backed by the API — guide the user to Google.
    setCredentialNotice(true);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleDialogClick}
      className="w-[640px] max-w-[calc(100vw-2rem)] rounded-[20px] border-0 bg-transparent p-0 backdrop:bg-bauhaus-ink/60 open:animate-dialog-pop"
    >
      <div className="flex min-h-[480px] overflow-hidden rounded-[20px] bg-bauhaus-bg">
        {/* Right — decorative Bauhaus panel */}
        <div className="relative hidden flex-1 overflow-hidden sm:block p-6">
          <BauhausShapeThree className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Left — credential panel */}
        <div className="flex flex-1 flex-col items-center justify-center bg-white p-6">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex flex-col items-center gap-2.5">
              <BauhausBrand className='flex-col' />
              <h2 id={titleId} className="sr-only">
                Sign in to StayQualifAI
              </h2>
            </div>

            <form
              className="flex flex-col gap-2.5"
              onSubmit={handleCredentialSubmit}
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${titleId}-username`}
                  className="text-xs font-bold text-bauhaus-ink"
                >
                  Username
                </label>
                <input
                  id={`${titleId}-username`}
                  type="text"
                  autoComplete="username"
                  placeholder="John Doe"
                  value={username}
                  onChange={(e): void => setUsername(e.target.value)}
                  className="h-[35px] rounded-[15px] bg-bauhaus-bg px-5 text-xs text-bauhaus-ink placeholder:text-bauhaus-ink/50 focus:outline-none focus:ring-2 focus:ring-bauhaus-blue/40"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${titleId}-password`}
                  className="text-xs font-bold text-bauhaus-ink"
                >
                  Password
                </label>
                <input
                  id={`${titleId}-password`}
                  type="password"
                  autoComplete="current-password"
                  placeholder="JohnDoe123"
                  value={password}
                  onChange={(e): void => setPassword(e.target.value)}
                  className="h-[35px] rounded-[15px] bg-bauhaus-bg px-5 text-xs text-bauhaus-ink placeholder:text-bauhaus-ink/50 focus:outline-none focus:ring-2 focus:ring-bauhaus-blue/40"
                />
              </div>

              {credentialNotice ? (
                <p
                  role="alert"
                  className="rounded-[10px] bg-bauhaus-yellow/40 px-3 py-2 text-[11px] font-medium text-bauhaus-ink"
                >
                  Email &amp; password sign-in is coming soon. Continue with
                  Google for now.
                </p>
              ) : null}

              {error !== null ? (
                <p
                  role="alert"
                  className="rounded-[10px] bg-bauhaus-red/15 px-3 py-2 text-[11px] font-medium text-bauhaus-red"
                >
                  {error.message}
                </p>
              ) : null}

              {isUnavailable ? (
                <p
                  role="status"
                  className="rounded-[10px] bg-bauhaus-yellow/40 px-3 py-2 text-[11px] font-medium text-bauhaus-ink"
                >
                  Authentication is currently unavailable. Please try again
                  later.
                </p>
              ) : null}
            </form>

            <div className="mt-1.5 flex flex-col items-center gap-1.5">
              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-[10px] bg-bauhaus-ink px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-bauhaus-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2"
              >
                Login to your account
              </button>

              <span className="text-xs text-bauhaus-ink">or</span>

              <button
                type="button"
                onClick={(): void => {
                  void signIn();
                }}
                disabled={isSignInDisabled}
                aria-busy={isAuthenticating}
                className="flex w-full items-center justify-center gap-2.5 rounded-[10px] border-2 border-bauhaus-ink bg-white px-5 py-2.5 text-xs font-medium text-bauhaus-ink transition-colors hover:bg-bauhaus-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAuthenticating ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-bauhaus-ink/30 border-t-bauhaus-ink"
                    />
                    Signing in…
                  </>
                ) : (
                  <>
                    Continue with Google
                    <GoogleIcon />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close sign-in dialog"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-bauhaus-ink transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-bauhaus-blue/50"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ×
        </span>
      </button>
    </dialog>
  );
}
