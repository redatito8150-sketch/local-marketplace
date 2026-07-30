// Static fallback for the "shop_by_mood" Site Content key — used whenever
// no admin override row exists yet (see lib/data/siteContent.ts).

import type { ShopByMoodContent } from "@/types";

export const SHOP_BY_MOOD: ShopByMoodContent = [
  {
    id: "cairo-summer",
    label: "Cairo Summer",
    image: "/images/home/moods/summer-beach.webp",
    href: "/shop/women",
  },
  {
    id: "weekend-escape",
    label: "Weekend Escape",
    image: "/images/home/moods/work-pool.webp",
    href: "/shop/women",
  },
  {
    id: "everyday-linen",
    label: "Everyday Linen",
    image: "/images/home/moods/night-out.webp",
    href: "/shop/women",
  },
  {
    id: "after-dark",
    label: "After Dark",
    image: "/images/home/moods/movement.webp",
    href: "/shop/women",
  },
  {
    id: "made-for-movement",
    label: "Made for Movement",
    image: "/images/home/moods/wedding.webp",
    href: "/shop/men",
  },
];
