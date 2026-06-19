/**
 * Authentication middleware.
 *
 * Verifies the Supabase JWT supplied in the `Authorization: Bearer <token>`
 * header. On success it:
 *   - attaches the authenticated user as `req.user`, and
 *   - builds a per-request Supabase client bound to the caller's token and
 *     attaches it as `req.supabase`, so Row Level Security is the source of
 *     truth for ownership (design.md "Authentication and Tenancy").
 *
 * Missing or invalid tokens are rejected with a typed {@link AuthError}, passed
 * to `next()` so the centralized error middleware serializes the
 * `{ data: null, error, meta }` envelope with HTTP 401 (Requirement 11.2).
 *
 * Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the environment — never
 * hardcoded (project ref: mlnhocdsbwlaeqemluvp). Named exports only. No `any`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';

import { AuthError, InternalError } from '../utils/errors.js';

/** Matches `Bearer <token>` (case-insensitive scheme), capturing the token. */
const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Extracts the bearer token from the `Authorization` header, or returns
 * `null` when the header is absent or not a well-formed bearer credential.
 */
function extractBearerToken(req: Request): string | null {
  const header: string | undefined = req.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match: RegExpExecArray | null = BEARER_PATTERN.exec(header.trim());
  if (match === null) {
    return null;
  }
  const token: string = (match[1] ?? '').trim();
  return token.length > 0 ? token : null;
}

/**
 * Reads the Supabase connection settings from the environment. A missing
 * value is a server misconfiguration (not a client error), so it surfaces as
 * an {@link InternalError} rather than an {@link AuthError}.
 */
function readSupabaseConfig(): { url: string; anonKey: string } {
  const url: string | undefined = process.env.SUPABASE_URL;
  const anonKey: string | undefined = process.env.SUPABASE_ANON_KEY;
  if (url === undefined || url.length === 0 || anonKey === undefined || anonKey.length === 0) {
    throw new InternalError('Supabase configuration is missing (SUPABASE_URL/SUPABASE_ANON_KEY).');
  }
  return { url, anonKey };
}

/**
 * Express middleware that authenticates the request against Supabase.
 *
 * Attaches `req.user` and a token-scoped `req.supabase` on success; forwards a
 * typed {@link AuthError} to `next()` when the token is missing or invalid.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token: string | null = extractBearerToken(req);
    if (token === null) {
      next(new AuthError('Missing or malformed Authorization header.'));
      return;
    }

    const { url, anonKey } = readSupabaseConfig();

    // Build a per-request client carrying the caller's JWT so every query is
    // RLS-scoped to the authenticated user. Session persistence/refresh are
    // disabled — this client lives only for the duration of the request.
    const supabase: SupabaseClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the token and resolve the user. An error or a null user both mean
    // the token is invalid/expired.
    const { data, error } = await supabase.auth.getUser(token);
    if (error !== null || data.user === null) {
      next(new AuthError('Invalid or expired authentication token.'));
      return;
    }

    req.user = data.user;
    req.supabase = supabase;
    next();
  } catch (err: unknown) {
    next(err);
  }
}
