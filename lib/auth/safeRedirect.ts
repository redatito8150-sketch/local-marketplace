// Validates a "return to where the user came from" path (query param
// `next`, e.g. `/account?next=/account/wishlist`) so it can only ever
// point somewhere inside this app. Deliberately dependency-free (only the
// built-in `URL`) so it behaves identically — and is testable — in the
// browser, in a Route Handler, and under plain `node --test`.
//
// Rejects anything that isn't a same-origin, path-only string: absolute
// URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`),
// backslash variants browsers normalize to protocol-relative
// (`/\evil.com`), non-http(s) schemes (`javascript:...`), and malformed or
// double-encoded values — falling back to a safe default in every case.
const DEFAULT_SAFE_PATH = "/account/overview";
const PARSE_BASE = "https://mahaly.internal";

export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_SAFE_PATH
): string {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(decoded, PARSE_BASE);
  } catch {
    return fallback;
  }

  // A same-origin relative path resolves to the same origin as the base.
  // Anything else (protocol-relative "//evil.com", backslash variants the
  // URL parser normalizes the same way a browser does, or an absolute URL
  // that slipped past the startsWith("/") check) resolves elsewhere.
  if (parsed.origin !== PARSE_BASE) return fallback;

  const safePath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!safePath.startsWith("/") || safePath.startsWith("//")) return fallback;

  return safePath;
}
