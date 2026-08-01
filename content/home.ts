// Static copy for the homepage Hero — same role as content/join.ts: this is
// the fallback used whenever no admin-edited "home_hero" row exists in
// site_content (see lib/data/siteContent.ts).

import type {
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
    image: "/images/home/category-wide/women.webp",
  },
  men: {
    label: "Men",
    href: "/shop/men",
    image: "/images/home/category-wide/men.webp",
  },
  kids: {
    label: "Kids",
    href: "/shop/kids",
    image: "/images/home/category-wide/kids.webp",
  },
  home: {
    label: "Home",
    href: "/shop/home",
    image: "/images/home/category-wide/home.webp",
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
