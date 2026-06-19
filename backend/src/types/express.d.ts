/**
 * Ambient declaration that augments the Express `Request` type with the
 * authenticated user and a per-request Supabase client.
 *
 * The auth middleware (`middleware/auth.ts`) verifies the caller's Supabase
 * JWT, attaches the resolved {@link User} as `req.user`, and attaches a
 * Supabase client built from that token as `req.supabase`. Because the client
 * carries the caller's JWT, Row Level Security scopes every query to
 * `auth.uid()` — so RLS remains the source of truth for ownership
 * (design.md "Authentication and Tenancy").
 *
 * Both properties are optional: routes that do not run the auth middleware
 * (e.g. the health check) leave them undefined, so downstream consumers must
 * narrow before use. No `any`.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /** The authenticated Supabase user, set by the auth middleware. */
      user?: User;
      /**
       * A Supabase client bound to the caller's JWT. All queries made through
       * it are RLS-scoped to the authenticated user.
       */
      supabase?: SupabaseClient;
    }
  }
}

export {};
