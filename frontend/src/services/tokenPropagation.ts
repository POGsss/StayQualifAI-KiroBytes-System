/**
 * Token propagation registry.
 *
 * A single fan-out point for the Supabase session access token. Every module
 * service (e.g. `resume`, `interview`) registers its `setAuthToken` exactly
 * once at startup; the auth store then calls only `propagateToken(token | null)`
 * to push the current token (or clear it) onto every registered service. The
 * auth store never imports module services directly, which avoids cross-module
 * coupling and lets new modules opt in without changing the store.
 *
 * `propagateToken` is intentionally TOTAL: it never throws. A failure in one
 * service's `setAuthToken` is captured as a per-service `IPropagationResult`
 * so unrelated modules can still render while an isolated failure is logged
 * (Requirement 3.4).
 *
 * Named exports only. Explicit return types. No `any` (errors are `unknown`).
 */

/** The shape every module service already satisfies. */
export type SetAuthToken = (token: string | null) => void;

/** A module service's registration with the propagation registry. */
export interface IServiceRegistration {
  /** Stable identifier for logging/diagnostics, e.g. "resume", "interview". */
  readonly id: string;
  readonly setAuthToken: SetAuthToken;
}

/** Per-service propagation outcome. */
export interface IPropagationResult {
  readonly id: string;
  readonly ok: boolean;
  readonly error?: unknown;
}

/**
 * Module-level registry keyed by `id`, so registration is idempotent: a
 * second registration with the same id replaces the previous entry rather
 * than creating a duplicate. Insertion order is preserved by `Map`, so the
 * token fans out in a stable, predictable order.
 */
const registry: Map<string, IServiceRegistration> = new Map();

/**
 * Register a module service exactly once. Idempotent by `id`: re-registering
 * the same id replaces the existing entry, so the registry never holds
 * duplicate entries for a single service.
 */
export function registerAuthTokenService(reg: IServiceRegistration): void {
  registry.set(reg.id, reg);
}

/**
 * Fan the token (or `null`) out to every registered service by calling each
 * service's `setAuthToken`. Never throws: a failure in one service is captured
 * as a result so unrelated modules can still receive the token (Requirement
 * 3.4). Returns one result per registered service, in registration order.
 */
export function propagateToken(token: string | null): IPropagationResult[] {
  const results: IPropagationResult[] = [];
  for (const reg of registry.values()) {
    try {
      reg.setAuthToken(token);
      results.push({ id: reg.id, ok: true });
    } catch (error: unknown) {
      results.push({ id: reg.id, ok: false, error });
    }
  }
  return results;
}

/** Read-only view of registered ids (used by the store to gate module render). */
export function registeredServiceIds(): readonly string[] {
  return Array.from(registry.keys());
}

/**
 * Test-only helper: clears the module-level registry so each test starts from
 * a known-empty state. NOT part of the production surface — do not call this
 * from application code.
 */
export function __resetAuthTokenRegistry(): void {
  registry.clear();
}
