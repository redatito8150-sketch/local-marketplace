// Curated option lists for the admin Product Form's Category/Product Type/
// Collection/Material/Fit dropdowns. Plain static content (same pattern as
// content/categories.ts's FILTER_GROUPS) rather than an admin-managed
// taxonomy table — nothing in this project asked for brands to manage
// their own category tree, and a normalized table would be new complexity
// with no current consumer.

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
