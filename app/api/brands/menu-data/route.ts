import { NextResponse } from "next/server";
import { getFeaturedBrandsForMenu, getSponsoredBrandsForPlacement } from "@/lib/data/brands";

// Header.tsx / BrandsMegaMenu.tsx are both client components (no
// server-side data fetching available to them directly) — same situation
// BrandEditContext already solved for the brand page's inline-edit
// permission via its own small GET route. This is that same pattern for
// the mega menu's real data — and also for the homepage's Sponsored
// banner (Sponsored.tsx), since app/page.tsx is `force-static`: anything
// computed there is frozen at build time and would never reflect a new
// Sponsored toggle until the next deploy. Cached at the edge for a minute
// (sponsorship changes are rare and not time-critical to the second) so
// this doesn't hit the DB on every single page view sitewide.
export async function GET() {
  const [featuredBrands, megaMenuBanner, homepageBanner] = await Promise.all([
    getFeaturedBrandsForMenu(),
    getSponsoredBrandsForPlacement("mega_menu_banner"),
    getSponsoredBrandsForPlacement("homepage_banner"),
  ]);

  return NextResponse.json(
    { featuredBrands, megaMenuBanner, homepageBanner },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
