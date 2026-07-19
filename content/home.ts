// Static copy for the homepage Hero — same role as content/join.ts: this is
// the fallback used whenever no admin-edited "home_hero" row exists in
// site_content (see lib/data/siteContent.ts).

import type { HomeHeroContent } from "@/types";

export const HOME_HERO: HomeHeroContent = {
  headingLines: ["Local brands.", "Real stories.", "All in one place."],
  subheading:
    "Discover and shop from the best local brands. Support creators. Wear what matters.",
  ctaLabel: "Join As Brand",
};
