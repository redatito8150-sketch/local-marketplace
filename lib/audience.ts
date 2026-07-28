import type { Audience, CategorySlug } from "@/types";

// Audience is the sole stored source of truth for who a product is for.
// /shop/women|men|kids routing predates it and stays exactly as it is —
// this is the one place that bridges the two: which audience values a
// given shop category shows (mirrors the old category+is_unisex pairing,
// where a unisex product showed under both women and men), and which shop
// category a given audience's product page/breadcrumb should link to.
export function shopCategoryAudiences(category: CategorySlug): Audience[] {
  if (category === "kids") return ["kids_baby"];
  if (category === "women") return ["women", "unisex"];
  return ["men", "unisex"];
}

export function primaryShopCategoryForAudience(audience: Audience): CategorySlug {
  if (audience === "kids_baby") return "kids";
  if (audience === "men") return "men";
  return "women"; // "women" and "unisex" both land here
}
