// Canonical/absolute-URL helper. Nothing in this codebase hardcodes a
// production domain (docs/google-auth-setup.md's mahaly.eg references are
// documentation only, never app code) — this keeps it that way so the
// current domain can change without touching metadata/sitemap/robots.
// Resolves, in order:
// 1. NEXT_PUBLIC_SITE_URL — set this once the production domain is final;
//    nothing else in the app needs to change when it is.
// 2. VERCEL_PROJECT_PRODUCTION_URL — Vercel sets this automatically to
//    whatever domain is currently aliased to production, so this stays
//    correct even while that domain is still temporary.
// 3. VERCEL_URL — set on preview deployments.
// 4. http://localhost:3000 — local dev fallback.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const deploymentUrl = process.env.VERCEL_URL;
  if (deploymentUrl) return `https://${deploymentUrl}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Static, publicly indexable marketing/content routes — used by
// app/sitemap.ts. Account, admin, brand-portal, checkout, api, and auth
// routes are intentionally excluded (private or no indexing value).
// Dynamic per-product/per-brand URLs (/product/[id], /brands/[slug])
// aren't enumerated here yet; adding them would mean querying Supabase at
// sitemap build time, which is a reasonable future enhancement but a
// separate change from this one.
export const PUBLIC_STATIC_ROUTES = [
  "",
  "/best-sellers",
  "/new-arrivals",
  "/trending",
  "/brands",
  "/journal",
  "/join-as-a-brand",
  "/shop/all",
  "/shop/women",
  "/shop/men",
  "/shop/kids",
  "/shop/home",
  "/privacy",
  "/terms",
];

// Used by app/robots.ts — private/authenticated areas that have no
// indexing value and shouldn't appear in search results.
export const DISALLOWED_ROUTES = ["/account", "/admin", "/brand-portal", "/checkout", "/api", "/auth"];
