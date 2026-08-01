import { NextResponse } from "next/server";
import { getFeaturedBrandsForMenu, getSponsoredBrandsForPlacement } from "@/lib/data/brands";

// Header.tsx / BrandsMegaMenu.tsx are both client components (no
// server-side data fetching available to them directly) — same situation
// BrandEditContext already solved for the brand page's inline-edit
// permission via its own small GET route. This is that same pattern for
// the mega menu's real data. Cached at the edge for a minute (sponsorship
// changes are rare and not time-critical to the second) so this doesn't
// hit the DB on every single page view sitewide.
export async function GET() {
  const [featuredBrands, megaMenuBanner] = await Promise.all([
    getFeaturedBrandsForMenu(),
    getSponsoredBrandsForPlacement("mega_menu_banner"),
  ]);

  return NextResponse.json(
    { featuredBrands, megaMenuBanner },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
