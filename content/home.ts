// Static copy for the homepage Hero — same role as content/join.ts: this is
// the fallback used whenever no admin-edited "home_hero" row exists in
// site_content (see lib/data/siteContent.ts).

import type {
  FeaturedBrandAndSponsoredContent,
  HomeHeroContent,
  HomeHeroTilesContent,
  HomeProductSectionContent,
} from "@/types";

export const HOME_HERO: HomeHeroContent = {
  headingLines: ["Local brands.", "Real stories.", "All in one place."],
  subheading:
    "Discover and shop from the best local brands. Support creators. Wear what matters.",
  ctaLabel: "Join As Brand",
};

// Fallback for the "home_hero_tiles" CMS key — the 4 equal-size hero tiles
// (Women/Men/Kids/Home). "Home" has no real category yet, so it points at
// a static coming-soon page instead of /shop/home data.
export const HOME_HERO_TILES: HomeHeroTilesContent = {
  women: {
    label: "Women",
    href: "/shop/women",
    image: "/images/home/women-category-v2.png",
  },
  men: {
    label: "Men",
    href: "/shop/men",
    image: "/images/home/men-category-v2.png",
  },
  kids: {
    label: "Kids",
    href: "/shop/kids",
    image: "/images/home/kids-category-v2.png",
  },
  home: {
    label: "Home",
    href: "/shop/home",
    image: "https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80",
  },
};

// Fallback for the "home_new_arrivals" CMS key. Changing "source" to
// "trending" or "bestsellers" (and "title" to match) is exactly how the
// owner renames this whole section from Site Content — no code change.
export const HOME_NEW_ARRIVALS: HomeProductSectionContent = {
  title: "New Arrivals",
  source: "new",
  limit: 12,
};

// Fallback for the "featured_brand_and_sponsored" CMS key. Real brand
// slugs from the seeded catalog — the admin form only lets the owner pick
// from real brands, never a typo'd or fabricated slug.
export const FEATURED_BRAND_AND_SPONSORED: FeaturedBrandAndSponsoredContent = {
  featuredBrandSlug: "studio-nile",
  sponsoredBrandSlugs: ["nola", "kai", "sahara-form", "remady-star"],
};
