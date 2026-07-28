import { supabaseAdmin } from "@/lib/supabase/admin";
import { toProductCard, loadDisplayContext, type ProductRow } from "@/lib/data/products";
import type { Product } from "@/types";

interface RecentlyViewedRow {
  viewed_at: string;
  products: ProductRow | null;
}

// recently_viewed has no public "list everyone" policy — only
// user_id = auth.uid() — so reading it from a Server Component needs
// supabaseAdmin with an explicit userId filter, same convention as
// orders/wishlist/addresses/follows.
export async function getRecentlyViewedForUser(
  userId: string,
  limit: number = 8
): Promise<Product[]> {
  const { data, error } = await supabaseAdmin
    .from("recently_viewed")
    .select("viewed_at, products(*)")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentlyViewedForUser(${userId}) failed: ${error.message}`);
  }

  const rows = ((data ?? []) as unknown as RecentlyViewedRow[]).filter((row) => row.products);
  const displayCtx = await loadDisplayContext(rows.map((row) => row.products!));
  return rows.map((row) => toProductCard(row.products!, displayCtx));
}
