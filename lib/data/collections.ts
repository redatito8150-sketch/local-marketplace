// Best Sellers / Trending need to read order_items/orders across every
// customer, which has no public RLS select policy (a customer can only
// read their own orders) — so this file uses supabaseAdmin and must only
// ever be imported from server-only code (page.tsx Server Components),
// never from a "use client" component or anything that reaches the
// browser bundle. Kept out of lib/data/products.ts on purpose: that file
// is imported by client components (e.g. SearchAutocomplete), and pulling
// supabaseAdmin in there would ship the service-role client into the
// browser bundle.
import { supabase } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Product } from "@/types";
import { ProductRow, toProductCard } from "./products";

// Ranks product ids by total quantity sold, optionally restricted to orders
// placed within the last `sinceDays` days (for "Trending" vs. all-time
// "Best Sellers"). Cancelled orders don't count as sales. This query only
// ever returns aggregate product_id/quantity numbers, never any per-order
// or per-customer detail.
async function getTopSellingProductIds(
  limit: number,
  sinceDays?: number
): Promise<string[]> {
  let query = supabaseAdmin
    .from("order_items")
    .select("product_id, quantity, orders!inner(status, created_at)")
    .neq("orders.status", "cancelled")
    .not("product_id", "is", null);

  if (sinceDays) {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("orders.created_at", cutoff);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`getTopSellingProductIds failed: ${error.message}`);
  }

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.product_id) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

async function getProductCardsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("id", ids)
    .eq("status", "published")
    .eq("paused_by_brand", false);
  if (error) {
    throw new Error(`getProductCardsByIds failed: ${error.message}`);
  }

  const byId = new Map((data as ProductRow[] | null)?.map((row) => [row.id, row]));
  // Preserve the caller's ranking (sold-quantity order) rather than
  // whatever order Postgres happens to return rows in.
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is ProductRow => Boolean(row))
    .map(toProductCard);
}

export async function getBestSellingProducts(limit: number = 24): Promise<Product[]> {
  const ids = await getTopSellingProductIds(limit);
  return getProductCardsByIds(ids);
}

export async function getTrendingProducts(
  limit: number = 24,
  sinceDays: number = 30
): Promise<Product[]> {
  const ids = await getTopSellingProductIds(limit, sinceDays);
  return getProductCardsByIds(ids);
}

// Ranks a single brand's own products by sold quantity — filters to the
// brand's product ids first, rather than "rank globally, then keep this
// brand's hits," which would return near-empty results for any brand
// that isn't already a top seller site-wide.
async function getTopSellingProductIdsForBrand(
  brandSlug: string,
  limit: number
): Promise<string[]> {
  const { data: brandProducts, error: brandProductsError } = await supabase
    .from("products")
    .select("id")
    .eq("brand_slug", brandSlug)
    .eq("status", "published")
    .eq("paused_by_brand", false);

  if (brandProductsError) {
    throw new Error(
      `getTopSellingProductIdsForBrand(${brandSlug}) products query failed: ${brandProductsError.message}`
    );
  }
  const productIds = (brandProducts ?? []).map((p) => p.id as string);
  if (productIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("product_id, quantity, orders!inner(status)")
    .in("product_id", productIds)
    .neq("orders.status", "cancelled");

  if (error) {
    throw new Error(`getTopSellingProductIdsForBrand(${brandSlug}) failed: ${error.message}`);
  }

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.product_id) continue;
    totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// Brand-scoped "Best Sellers" row for the brand page — falls back to the
// brand's own newest products when it has no sales history yet, so a
// freshly onboarded brand never shows an empty section.
export async function getBestSellingProductsForBrand(
  brandSlug: string,
  limit: number = 12
): Promise<Product[]> {
  const ids = await getTopSellingProductIdsForBrand(brandSlug, limit);
  if (ids.length > 0) {
    return getProductCardsByIds(ids);
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("brand_slug", brandSlug)
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getBestSellingProductsForBrand(${brandSlug}) fallback failed: ${error.message}`);
  }
  return ((data ?? []) as ProductRow[]).map(toProductCard);
}
