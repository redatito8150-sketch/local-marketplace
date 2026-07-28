import { apiRequest } from "@/lib/api";
import type { Product } from "@/domain/products";

export type ReviewSummary = { average: number; total: number; distribution: Record<1 | 2 | 3 | 4 | 5, number>; verifiedPercent: number; withPhotos: number };
export type Review = { id: string; productId: string; productName: string; productImage: string; authorName: string; rating: number; title?: string; body: string; createdAt: string; verifiedPurchase: true; images: { id: string; url: string; order: number }[]; helpfulCount: number; viewerFoundHelpful: boolean; isOwn: boolean; reply?: { id: string; body: string; brandName: string; createdAt: string } };
export type EligibleReviewItem = { id: string; product_id: string; name: string; image: string; brand_slug: string };
export type Brand = {
  slug: string; name: string; tagline: string; category: string; city: string; foundedYear?: number;
  heroImage: string; logoImage?: string; websiteUrl?: string; aboutDescription: string; aboutImage: string;
  storyImage: string; storyBody: string; followerCount: number; storeRating: number;
  values: { title: string; description: string }[];
  shopTheLook: { title: string; image: string; href: string }[];
  products: { id: string; name: string; brand: string; price: number; compareAtPrice?: number; currency: "EGP" | "USD"; image: string; inStock: boolean }[];
};
type BrandResponse = { brand: Brand; reviews: { reviews: Review[]; summary: ReviewSummary; total: number }; isFollowing: boolean };
export async function getBrand(slug: string) { return apiRequest<BrandResponse>(`/api/brands/${encodeURIComponent(slug)}`); }
export async function toggleBrandFollow(slug: string) { return apiRequest<{ following: boolean }>(`/api/brands/${encodeURIComponent(slug)}/follow`, { method: "POST" }); }
export async function getReviews(options: { brandSlug?: string; productId?: string }) {
  const params = new URLSearchParams();
  if (options.brandSlug) params.set("brandSlug", options.brandSlug);
  if (options.productId) params.set("productId", options.productId);
  return apiRequest<{ reviews: Review[]; summary: ReviewSummary; eligibleItems: EligibleReviewItem[] }>(`/api/reviews?${params}`);
}
export async function toggleReviewHelpful(id: string) { return apiRequest<{ helpful: boolean; count: number }>(`/api/reviews/${id}/helpful`, { method: "POST" }); }
export async function reportReview(id: string) { return apiRequest<{ ok: true }>(`/api/reviews/${id}/report`, { method: "POST", body: JSON.stringify({ reason: "other", details: "Reported from the Mahaly mobile app." }) }); }
export async function deleteReview(id: string) { return apiRequest<{ ok: true }>(`/api/reviews/${id}`, { method: "DELETE" }); }
export async function getOwnReview(id: string) { return (await apiRequest<{ review: { id: string; rating: number; title?: string; body: string } }>(`/api/reviews/${id}`)).review; }
export async function updateReview(id: string, input: { rating: number; title?: string; body: string }) { return apiRequest<{ ok: true }>(`/api/reviews/${id}`, { method: "PATCH", body: JSON.stringify(input) }); }
export function brandProductToProduct(item: Brand["products"][number]): Product {
  return { id: item.id, name: item.name, brand_name: item.brand, brand_slug: null, audience: null, product_type_id: null, price: item.price, compare_at_price: item.compareAtPrice ?? null, currency: item.currency, image: item.image, images: [item.image], rating: 0, review_count: 0, colors: [], sizes: [], unavailable_sizes: [], description: "", details: [], care_instructions: [], shipping_returns: "", in_stock: item.inStock, track_inventory: false };
}
