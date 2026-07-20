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
export async function getWishlistForUser(userId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabaseAdmin
    .from("wishlists")
    .select("product_id, products(id, name, brand_name, price, currency, image)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getWishlistForUser(${userId}) failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as WishlistRow[])
    .filter((row) => row.products)
    .map((row) => ({
      productId: row.products!.id,
      name: row.products!.name,
      brand: row.products!.brand_name,
      price: Number(row.products!.price),
      currency: row.products!.currency,
      image: row.products!.image,
    }));
}
