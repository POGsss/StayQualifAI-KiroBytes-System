import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { IAuthStore, AuthStatus } from './types/auth.types';

/**
 * The App is now auth-gated: the AppShell (sidebar + top bar + module routes)
 * renders only when the auth store reports an authenticated session; otherwise
 * the RouteGuard redirects to the Login_Screen. These tests therefore mock the
 * auth store so we can exercise both the authenticated shell and the
 * unauthenticated redirect, and stub the app-lifetime auth hooks so no real
 * Supabase client (and no env configuration) is required.
 */

// Mutable mock auth state shared across the mocked store + tests (hoisted so it
// is available inside the `vi.mock` factory, which is hoisted above imports).
const authMock = vi.hoisted(() => {
  const state: IAuthStore = {
    status: 'authenticated',
    session: null,
    identity: {
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatarUrl: null,
    },
    redirectTo: null,
    error: null,
    isSigningOut: false,
    bootstrap: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    completeOAuth: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    handleAuthFailure: () => {},
    setRedirectTo: () => {},
    clearError: () => {},
  };
  return { state };
});

vi.mock('./stores/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: IAuthStore) => T): T =>
    selector(authMock.state),
}));

vi.mock('./hooks/useAuthBootstrap', () => ({
  useAuthBootstrap: (): void => {},
}));

vi.mock('./hooks/useApiAuthFailure', () => ({
  useApiAuthFailure: (): void => {},
}));

// Imported AFTER the mocks are registered so App picks up the mocked store/hooks.
import { App } from './App';

function setStatus(status: AuthStatus): void {
  authMock.state.status = status;
}

describe('App shell (authenticated)', () => {
  beforeEach(() => {
    setStatus('authenticated');
    authMock.state.redirectTo = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the primary navigation when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/resume/scan']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('navigation', { name: /primary/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /scanner/i })
    ).toBeInTheDocument();
  });

  it('renders the scanner page on the default route when authenticated', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /resume scanner/i })
    ).toBeInTheDocument();
  });
});

describe('App shell (unauthenticated)', () => {
  beforeEach(() => {
    setStatus('unauthenticated');
    authMock.state.redirectTo = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a module route to the Login_Screen when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/resume/scan']}>
        <App />
      </MemoryRouter>
    );

    // The module shell is not rendered; the guard redirects to /login.
    expect(
      screen.queryByRole('navigation', { name: /primary/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continue with google/i })
    ).toBeInTheDocument();
  });
});
