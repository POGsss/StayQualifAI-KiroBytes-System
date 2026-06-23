/**
 * Central resolution of the backend API origin for every frontend service.
 *
 * The four module service files (`resume`, `interview`, `jobsearch`,
 * `upskilling`) build their paths as `${API_BASE_URL}/api/v1/<module>`. This is
 * the ONLY place the backend location is configured, so switching between local
 * dev and the hosted (Vercel) backend means changing a single env var.
 *
 * Behavior:
 * - When `VITE_API_BASE_URL` is set (e.g. `https://your-backend.vercel.app`),
 *   every request is sent to that absolute origin.
 * - When it is empty/unset, requests stay relative (`/api/v1/...`) so the Vite
 *   dev proxy (and the test environment) keep working unchanged.
 *
 * Any trailing slash is trimmed so callers can safely concatenate `/api/...`.
 */
const rawBaseUrl: string =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' ? import.meta.env.VITE_API_BASE_URL : '';

export const API_BASE_URL: string = rawBaseUrl.trim().replace(/\/+$/, '');
