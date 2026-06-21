import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import type { IUserIdentity } from '../../types/auth.types';
import {
  FALLBACK_PLACEHOLDER,
  deriveFallbackInitial,
} from '../RouteGuard/viewSelection';

/**
 * ProfileControl — the signed-in user's identity control in the top bar.
 *
 * Replaces the placeholder avatar button. Purely presentational: all data is
 * read from the `identity` prop (the auth store feeds it from the active
 * session). No store or service calls and no application-data fetching.
 *
 * Behavior (Requirement 8):
 *   - 8.1 Shows the avatar image when `avatarUrl` loads successfully within 5s.
 *   - 8.2 On activation, shows the name and email as readable text in a native
 *         `popover` panel.
 *   - 8.3 / 8.5 When there is no avatar (or it fails), shows a fallback
 *         indicator derived by the pure `deriveFallbackInitial`; when neither
 *         name nor email is present, that derivation yields the default
 *         placeholder.
 *   - 8.4 If the avatar URL is present but fails to load (via `onError`) or has
 *         not loaded within 5 seconds, the image is hidden entirely and only
 *         the fallback indicator is shown.
 *
 * Uses the native HTML Popover API per the modern-web steering. The panel
 * carries the lowercase `popover="auto"` attribute and is toggled imperatively
 * from the trigger's `onClick` via `HTMLElement.togglePopover()` (the camelCase
 * `popoverTarget` prop is intentionally avoided because React 18 does not
 * recognize it and silently drops it from the DOM). The `togglePopover` call is
 * feature-detected so it degrades gracefully where the API is unavailable
 * (e.g. jsdom in tests), falling back to React-managed open state. The trigger
 * carries `aria-haspopup` and an `aria-expanded` that reflects the open state,
 * `loading="lazy"` on the avatar image, an `aria-label` on the icon-only
 * control, and Tailwind utility classes only.
 */

export interface IProfileControlProps {
  /** The signed-in user's identity, or `null` when none is available. */
  identity: IUserIdentity | null;
}

/** Load lifecycle of the avatar image. */
type AvatarStatus = 'pending' | 'loaded' | 'failed';

/** Maximum time (ms) to wait for the avatar image to load before falling back. */
const AVATAR_LOAD_TIMEOUT_MS = 5000;

/** Stable id linking the trigger button to its native popover panel. */
const PANEL_ID = 'profile-control-panel';

export function ProfileControl({ identity }: IProfileControlProps): JSX.Element {
  const avatarUrl = identity?.avatarUrl ?? null;
  const name = identity?.name ?? null;
  const email = identity?.email ?? null;

  const [status, setStatus] = useState<AvatarStatus>(
    avatarUrl !== null ? 'pending' : 'failed',
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether the identity panel is open. Mirrors the native popover state and
  // drives `aria-expanded` for accessibility. When the native Popover API is
  // unavailable (e.g. jsdom), this state also drives the panel's visibility.
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function handleToggle(): void {
    const panel = panelRef.current;
    // Prefer the native Popover API when present; feature-detect so the call
    // degrades gracefully where the API is unavailable.
    if (panel !== null && typeof panel.togglePopover === 'function') {
      panel.togglePopover();
    }
    setIsOpen((open) => !open);
  }

  // Keep `isOpen` in sync with the native popover when it is dismissed by means
  // other than the trigger (Esc key or a light-dismiss outside click), so that
  // `aria-expanded` stays accurate. No-op where the `toggle` event is
  // unsupported.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }

    function handleNativeToggle(event: Event): void {
      const newState = (event as ToggleEvent).newState;
      setIsOpen(newState === 'open');
    }

    panel.addEventListener('toggle', handleNativeToggle);
    return (): void => {
      panel.removeEventListener('toggle', handleNativeToggle);
    };
  }, []);

  // Reset load tracking whenever the avatar URL changes, and arm a 5s timeout
  // that treats a slow-loading image as failed (Requirement 8.4). The timeout
  // is cleared on successful load, on error, and on unmount.
  useEffect(() => {
    if (avatarUrl === null) {
      setStatus('failed');
      return;
    }

    setStatus('pending');
    const timer = setTimeout(() => {
      setStatus((current) => (current === 'pending' ? 'failed' : current));
    }, AVATAR_LOAD_TIMEOUT_MS);
    timeoutRef.current = timer;

    return (): void => {
      clearTimeout(timer);
      timeoutRef.current = null;
    };
  }, [avatarUrl]);

  function handleLoad(): void {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('loaded');
  }

  function handleError(): void {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus('failed');
  }

  const fallbackInitial = deriveFallbackInitial(identity).toUpperCase();
  const showImage = avatarUrl !== null && status === 'loaded';
  const hasIdentityText = (name !== null && name.length > 0) || (email !== null && email.length > 0);

  // Accessible name for the icon-only control. When identity text exists, name
  // it after the user; otherwise a generic account label.
  const triggerLabel = hasIdentityText
    ? `Account menu for ${name ?? email ?? ''}`.trim()
    : 'Account menu';

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-accent-green text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {avatarUrl !== null && status !== 'failed' ? (
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
            className={
              showImage
                ? 'h-full w-full object-cover'
                : 'pointer-events-none absolute h-px w-px opacity-0'
            }
          />
        ) : null}
        {!showImage ? (
          <span aria-hidden="true">{fallbackInitial || FALLBACK_PLACEHOLDER}</span>
        ) : null}
      </button>

      <div
        ref={panelRef}
        id={PANEL_ID}
        popover="auto"
        className={`absolute right-0 mt-2 min-w-56 rounded-2xl border border-gray-200 bg-surface p-4 text-ink shadow-lg${
          isOpen ? '' : ' hidden'
        }`}
      >
        {hasIdentityText ? (
          <div className="flex flex-col gap-1">
            {name !== null && name.length > 0 ? (
              <span className="text-sm font-semibold text-ink">{name}</span>
            ) : null}
            {email !== null && email.length > 0 ? (
              <span className="text-sm text-gray-500">{email}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-gray-500">Signed-in account</span>
        )}
      </div>
    </div>
  );
}
