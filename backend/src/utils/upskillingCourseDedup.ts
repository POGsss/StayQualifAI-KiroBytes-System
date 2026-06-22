/**
 * Pure utilities for the Upskilling module's Course & Certificate Finder.
 *
 * These functions support aggregating Course_Recommendations from multiple
 * Learning_Platform_API sources:
 * - `normalizeUrl` produces a canonical form of a URL for duplicate detection
 *   (also reused for the saved-course conflict check).
 * - `dedupeByNormalizedUrl` removes duplicates that share a normalized URL.
 * - `orderRecommendations` imposes the deterministic display order.
 *
 * All functions are pure (no I/O, no mutation of inputs). Named exports only.
 * No `any`.
 *
 * Requirements: 5.4, 5.9, 6.4
 */
import type {
  CostClassification,
  ICourseRecommendation,
} from '../types/upskilling.types.js';

/**
 * Normalizes a URL into a canonical form for comparison:
 * - Lowercases the scheme and host
 * - Strips the default port (443 for https, 80 for http)
 * - Strips a single trailing slash from the path
 *
 * The query string and fragment are preserved (they can be semantically
 * meaningful), while the scheme/host casing and default ports are normalized so
 * that URLs differing only in those respects compare equal. If the input is not
 * a parseable absolute URL, it falls back to a lowercased, trailing-slash
 * trimmed form so the function is total.
 *
 * Requirements: 5.4, 6.4
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not a parseable absolute URL — best-effort canonicalization.
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }

  const scheme = parsed.protocol.toLowerCase(); // includes trailing ':'
  const host = parsed.hostname.toLowerCase();

  // Strip default ports for the matching scheme.
  let port = parsed.port;
  if ((scheme === 'https:' && port === '443') || (scheme === 'http:' && port === '80')) {
    port = '';
  }
  const authority = port.length > 0 ? `${host}:${port}` : host;

  // Strip a trailing slash from the path (but keep a non-empty path otherwise).
  let pathname = parsed.pathname;
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return `${scheme}//${authority}${pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Removes recommendations whose normalized URL has already been seen, keeping
 * the first occurrence of each normalized URL and preserving the relative order
 * of the retained recommendations.
 *
 * Requirements: 5.4
 */
export function dedupeByNormalizedUrl(
  recs: ICourseRecommendation[]
): ICourseRecommendation[] {
  const seen = new Set<string>();
  const result: ICourseRecommendation[] = [];

  for (const rec of recs) {
    const key = normalizeUrl(rec.url);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(rec);
    }
  }

  return result;
}

/**
 * Returns a new array of recommendations in deterministic display order:
 * all Free recommendations precede all Paid recommendations, and within the
 * same cost classification recommendations are ordered by title in
 * case-insensitive ascending order. The input array is not mutated.
 *
 * Requirements: 5.9
 */
export function orderRecommendations(
  recs: ICourseRecommendation[]
): ICourseRecommendation[] {
  const costRank = (cost: CostClassification): number => (cost === 'Free' ? 0 : 1);

  return [...recs].sort((a, b) => {
    const costDiff = costRank(a.cost) - costRank(b.cost);
    if (costDiff !== 0) {
      return costDiff;
    }
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
}
