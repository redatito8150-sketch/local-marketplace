import type { BrandShopTheLookTile, Product } from "@/types";
import { isDiscountActive } from "./pricing.ts";

export const BRAND_PROFILE_ROUTES = ["products", "collections", "about", "reviews"] as const;
export type BrandProfileRoute = (typeof BRAND_PROFILE_ROUTES)[number];

export function resolveBrandProfileRoute(pathname: string): BrandProfileRoute {
  const segment = pathname.split("?")[0].split("/").filter(Boolean).at(-1);
  return BRAND_PROFILE_ROUTES.includes(segment as BrandProfileRoute) ? segment as BrandProfileRoute : "products";
}

export function filterProductsForBrand<T extends { brand: string }>(products: T[], brandName: string): T[] {
  return products.filter((product) => product.brand.toLocaleLowerCase() === brandName.toLocaleLowerCase());
}

export function filterCollectionsByBrand(tiles: BrandShopTheLookTile[]): BrandShopTheLookTile[] {
  return tiles.filter((tile) => Boolean(tile.image?.trim() && tile.title?.trim()));
}

export function aggregateBrandRatings(products: Array<Pick<Product, "rating" | "reviewCount">>) {
  const reviewCount = products.reduce((sum, product) => sum + Math.max(0, product.reviewCount), 0);
  if (reviewCount === 0) return { average: 0, reviewCount: 0 };
  const weightedTotal = products.reduce((sum, product) => sum + product.rating * Math.max(0, product.reviewCount), 0);
  return { average: weightedTotal / reviewCount, reviewCount };
}

export function isActiveOffer(
  product: Pick<Product, "discountPercent" | "discountEndsAt" | "inStock">,
  now: Date = new Date()
) {
  return product.inStock && isDiscountActive(product.discountPercent, product.discountEndsAt, now);
}

export function discountPercentage(price: number, compareAtPrice: number) {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(compareAtPrice) ||
    price < 0 ||
    compareAtPrice <= price
  ) {
    return 0;
  }

  return Math.min(99, Math.round((1 - price / compareAtPrice) * 100));
}
