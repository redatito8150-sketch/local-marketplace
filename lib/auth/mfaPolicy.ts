export type AuthenticatorAssuranceLevel = "aal1" | "aal2" | (string & {}) | null;

export interface AuthenticatorAssurance {
  currentLevel: AuthenticatorAssuranceLevel;
  nextLevel: AuthenticatorAssuranceLevel;
}

export type MfaAccessDecision = "allow" | "mfa_required" | "assurance_unavailable";

// Supabase's opt-in MFA policy is represented by an upgrade from the
// session's current AAL to its next AAL. aal1 -> aal1 means the account has
// no verified factor and must continue to work normally; aal1 -> aal2 means
// a verified factor exists and this session has not completed it yet.
export function decideMfaAccess(
  assurance: AuthenticatorAssurance | null | undefined,
  hasError = false
): MfaAccessDecision {
  if (hasError || !assurance) return "assurance_unavailable";
  if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    return "mfa_required";
  }
  return "allow";
}

const PROTECTED_PAGE_PREFIXES = [
  "/account/",
  "/admin",
  "/brand-portal",
  "/onboarding",
  "/reset-password",
];

const PROTECTED_API_GET_PREFIXES = [
  "/api/account",
  "/api/admin",
  "/api/brand-portal",
  "/api/join",
  "/api/orders",
  "/api/wishlist",
];

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// The proxy applies MFA only where an authenticated identity can read or
// change private data. Public pages remain usable while a session is at
// aal1, and public guest requests remain unaffected because they have no
// authenticated user to gate.
export function isMfaProtectedRequest(pathname: string, method: string): boolean {
  if (
    PROTECTED_PAGE_PREFIXES.some((prefix) =>
      prefix.endsWith("/") ? pathname.startsWith(prefix) : matchesPathPrefix(pathname, prefix)
    ) ||
    pathname === "/join-as-a-brand/apply"
  ) {
    return true;
  }

  if (!pathname.startsWith("/api/")) return false;

  const normalizedMethod = method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    // Coupon validation is intentionally available to guest checkout and
    // does not consume a coupon or expose account data.
    return pathname !== "/api/coupons/validate";
  }

  if (PROTECTED_API_GET_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))) {
    return true;
  }

  // This endpoint returns account-specific brand membership/follow state.
  return /^\/api\/brands\/[^/]+\/viewer-status$/.test(pathname);
}

export function buildMfaChallengePath(returnTo?: string): string {
  const params = new URLSearchParams({ mfa: "required" });
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("next", returnTo);
  }
  return `/account?${params.toString()}`;
}
