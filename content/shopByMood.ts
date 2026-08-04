// Static fallback for the "shop_by_mood" Site Content key — used whenever
// no admin override row exists yet (see lib/data/siteContent.ts). productIds
// starts empty for every tile: this file ships with the code, and inventing
// a fake curated product list here would mean a brand-new install shows
// products that were never really picked for that mood.

import type { ShopByMoodContent } from "@/types";

export const SHOP_BY_MOOD: ShopByMoodContent = [
  {
    id: "cairo-summer",
    label: "Cairo Summer",
    images: ["/images/home/moods/summer-beach.webp"],
    productIds: [],
  },
  {
    id: "weekend-escape",
    label: "Weekend Escape",
    images: ["/images/home/moods/work-pool.webp"],
    productIds: [],
  },
  {
    id: "everyday-linen",
    label: "Everyday Linen",
    images: ["/images/home/moods/night-out.webp"],
    productIds: [],
  },
  {
    id: "after-dark",
    label: "After Dark",
    images: ["/images/home/moods/movement.webp"],
    productIds: [],
  },
  {
    id: "made-for-movement",
    label: "Made for Movement",
    images: ["/images/home/moods/wedding.webp"],
    productIds: [],
  },
];
