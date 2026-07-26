import { getSafeRedirectPath } from "./safeRedirect.ts";

// The single "where does this signed-in user land" rule, shared by the
// email/password redirect effect (app/account/page.tsx) and the Google
// OAuth callback (app/auth/callback/route.ts) so the two flows can never
// silently disagree. Onboarding always wins over an intended destination —
// same precedence the existing email/password flow already used before a
// `next` path existed at all.
export function decidePostAuthDestination(
  onboardingCompletedAt: string | null | undefined,
  next?: string | null
): string {
  if (!onboardingCompletedAt) return "/onboarding/add-address";
  return getSafeRedirectPath(next);
}
