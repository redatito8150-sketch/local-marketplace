// Default option lists for the admin Product Form's Category/Product Type/
// Collection/Material/Fit dropdowns — the fallback `DEFAULT_PRODUCT_TAXONOMY`
// below is used whenever no admin-edited "product_taxonomy" row exists in
// site_content (see lib/data/siteContent.ts and app/admin/products/categories).

import type { ProductTaxonomyContent } from "@/types";

// "Home" exists because the brand catalog already includes a home/ceramics
// brand (Sahara Form) predating this taxonomy — not every brand on Local
// sells clothing.
export const PRODUCT_CATEGORIES = [
  "Clothing",
  "Shoes",
  "Bags",
  "Accessories",
  "Jewelry",
  "Home",
] as const;

export type ProductCategoryOption = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_TYPES_BY_CATEGORY: Record<ProductCategoryOption, string[]> = {
  Clothing: ["Shirts", "Dresses", "Pants", "Jackets", "Skirts", "Sweaters", "T-Shirts", "Outerwear"],
  Shoes: ["Sneakers", "Sandals", "Boots", "Heels", "Flats"],
  Bags: ["Handbags", "Backpacks", "Totes", "Clutches"],
  Accessories: ["Belts", "Scarves", "Hats", "Sunglasses", "Watches"],
  Jewelry: ["Necklaces", "Earrings", "Bracelets", "Rings"],
  Home: ["Vases", "Bowls", "Plates", "Candles", "Decor"],
};

export const COLLECTIONS = [
  "Summer 2026",
  "Winter 2026",
  "Ramadan Edit",
  "Eid Collection",
  "Resort Wear",
  "Everyday Essentials",
];

export const MATERIALS = [
  "Cotton",
  "Linen",
  "Silk",
  "Wool",
  "Denim",
  "Leather",
  "Polyester",
  "Viscose",
  "Cashmere",
];

export const FITS = ["Regular", "Slim", "Oversized", "Relaxed", "Tailored"];

export const DEFAULT_PRODUCT_TAXONOMY: ProductTaxonomyContent = {
  categories: [...PRODUCT_CATEGORIES],
  typesByCategory: PRODUCT_TYPES_BY_CATEGORY,
  collections: COLLECTIONS,
  materials: MATERIALS,
  fits: FITS,
};
