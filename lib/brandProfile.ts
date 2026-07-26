import type { BrandShopTheLookTile, Product } from "@/types";

export const BRAND_PROFILE_ROUTES = ["products", "collections", "offers", "about", "reviews"] as const;
export type BrandProfileRoute = (typeof BRAND_PROFILE_ROUTES)[number];

export function resolveBrandProfileRoute(pathname: string): BrandProfileRoute {
  const segment = pathname.split("?")[0].split("/").filter(Boolean).at(-1);
  return BRAND_PROFILE_ROUTES.includes(segment as BrandProfileRoute) ? segment as BrandProfileRoute : "products";
}

export function isActiveOffer(product: Pick<Product, "price" | "compareAtPrice" | "inStock">): boolean {
  return product.inStock && Number.isFinite(product.price) && product.compareAtPrice != null && Number.isFinite(product.compareAtPrice) && product.compareAtPrice > product.price;
}

export function discountPercentage(currentPrice: number, originalPrice: number): number {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(originalPrice) || originalPrice <= 0 || currentPrice >= originalPrice) return 0;
  return Math.round((1 - currentPrice / originalPrice) * 100);
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
