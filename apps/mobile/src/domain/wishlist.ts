import { apiRequest } from "@/lib/api";
import type { WishlistStateItem } from "./wishlist-state";
export type WishlistItem = WishlistStateItem;
export { toggleWishlistState } from "./wishlist-state";
export async function getWishlist() { return (await apiRequest<{ items: WishlistItem[] }>("/api/wishlist")).items; }
export async function toggleWishlist(productId: string) {
  return apiRequest<{ wishlisted: boolean }>("/api/wishlist", { method: "POST", body: JSON.stringify({ productId }) });
}
export async function removeWishlist(productId: string) {
  return apiRequest<{ wishlisted: false }>(`/api/wishlist?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
}
