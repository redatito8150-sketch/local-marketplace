// Static fallback for the "shop_by_mood" Site Content key — used whenever
// no admin override row exists yet (see lib/data/siteContent.ts).

import type { ShopByMoodContent } from "@/types";

export const SHOP_BY_MOOD: ShopByMoodContent = [
  {
    id: "cairo-summer",
    label: "Cairo Summer",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80",
    href: "/shop/women",
  },
  {
    id: "weekend-escape",
    label: "Weekend Escape",
    image: "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&q=80",
    href: "/shop/women",
  },
  {
    id: "everyday-linen",
    label: "Everyday Linen",
    image: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80",
    href: "/shop/women",
  },
  {
    id: "after-dark",
    label: "After Dark",
    image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80",
    href: "/shop/women",
  },
  {
    id: "made-for-movement",
    label: "Made for Movement",
    image: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80",
    href: "/shop/men",
  },
];
