import { getSafeRedirectPath } from "./safeRedirect.ts";

export interface PostAuthProfile {
  onboardingCompletedAt: string | null | undefined;
  isAdmin: boolean;
  role: string;
}

function defaultWorkspace(profile: PostAuthProfile): string {
  if (profile.isAdmin) return "/admin";
  if (profile.role === "brand_owner" || profile.role === "brand_assistant") return "/brand-portal";
  return "/account/overview";
}

// The single "where does this signed-in user land" rule, shared by the
// email/password redirect effect (app/account/page.tsx) and the Google
// OAuth callback (app/auth/callback/route.ts) so the two flows can never
// silently disagree. Onboarding always wins over an intended destination —
// same precedence the existing email/password flow already used before a
// `next` path existed at all.
export function decidePostAuthDestination(
  profile: PostAuthProfile,
  next?: string | null
): string {
  if (!profile.onboardingCompletedAt) return "/onboarding/add-address";

  const fallback = defaultWorkspace(profile);
  const destination = getSafeRedirectPath(next, fallback);
  const isBrandUser = profile.isAdmin || profile.role === "brand_owner" || profile.role === "brand_assistant";

  // A same-origin `next` path is not automatically authorized. In
  // particular, preserving `/admin` for a signed-in Brand Owner creates a
  // redirect loop: the Admin layout sends them back to `/account`, which
  // then sends them to `/admin` again. Keep workspace return paths aligned
  // with the profile's server-enforced role instead.
  if (destination === "/account") return fallback;
  if (destination.startsWith("/admin") && !profile.isAdmin) return fallback;
  if (destination.startsWith("/brand-portal") && !isBrandUser) return fallback;

  return destination;
}
