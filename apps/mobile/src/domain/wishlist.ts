import { apiRequest } from "@/lib/api";
export type WishlistItem = { productId: string; name: string; brand: string; price: number; currency: "EGP" | "USD"; image: string };
export async function getWishlist() { return (await apiRequest<{ items: WishlistItem[] }>("/api/wishlist")).items; }
export async function toggleWishlist(productId: string) {
  return apiRequest<{ wishlisted: boolean }>("/api/wishlist", { method: "POST", body: JSON.stringify({ productId }) });
}
export async function removeWishlist(productId: string) {
  return apiRequest<{ wishlisted: false }>(`/api/wishlist?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
}
