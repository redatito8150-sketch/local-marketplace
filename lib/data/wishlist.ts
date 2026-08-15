import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WishlistItem } from "@/types";

interface WishlistRow {
  product_id: string;
  products: {
    id: string;
    name: string;
    brand_name: string;
    price: number;
    currency: "USD" | "EGP";
    image: string;
  } | null;
}

// wishlists has no public "list everyone" policy — only user_id = auth.uid()
// — so reading it from a Server Component needs supabaseAdmin with an
// explicit userId filter, same convention as lib/data/follows.ts.
//
// CORRECTIVE PASS: supabaseAdmin bypasses RLS entirely, and this used to
// embed straight from `products` — the raw table, not storefront_products
// — so a wishlisted product that later became hidden (unpublished,
// archived, paused, an inactive brand, a still-future publish_date, an
// open fulfillment transition, or a when_stocked product that never
// reached its stock gate) was still returned and displayed here, the one
// customer-facing surface this audit found bypassing canonical visibility
// entirely. Every currently-visible product still shows (a show_now
// product with 0 stock IS visible, so Wishlist keeps working for it, per
// item 5's own requirement); only genuinely hidden ones are now filtered
// OUT of the returned list. The underlying `wishlists` row itself is never
// touched here — removal (a separate, product_id-keyed delete, never
// dependent on first enumerating this list) stays possible for a hidden
// product exactly as before.
export async function getWishlistForUser(userId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabaseAdmin
    .from("wishlists")
    .select("product_id, products(id, name, brand_name, price, currency, image)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getWishlistForUser(${userId}) failed: ${error.message}`);
  }

  const rows = ((data ?? []) as unknown as WishlistRow[]).filter((row) => row.products);
  if (rows.length === 0) return [];

  const distinctProductIds = [...new Set(rows.map((row) => row.products!.id))];
  const visibilityEntries = await Promise.all(
    distinctProductIds.map(async (productId) => {
      const { data: visible } = await supabaseAdmin.rpc("is_product_customer_visible", { p_product_id: productId });
      return [productId, Boolean(visible)] as const;
    })
  );
  const visibleProductIds = new Set(visibilityEntries.filter(([, visible]) => visible).map(([productId]) => productId));

  return rows
    .filter((row) => visibleProductIds.has(row.products!.id))
    .map((row) => ({
      productId: row.products!.id,
      name: row.products!.name,
      brand: row.products!.brand_name,
      price: Number(row.products!.price),
      currency: row.products!.currency,
      image: row.products!.image,
    }));
}
