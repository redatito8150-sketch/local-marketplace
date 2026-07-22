import { supabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariant, VariantAvailabilityStatus } from "@/types";

interface ProductVariantRow {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  quantity: number;
  low_stock_threshold: number;
  price_override: number | null;
  availability_status: VariantAvailabilityStatus;
  created_at: string;
  updated_at: string;
}

function toProductVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    color: row.color ?? undefined,
    size: row.size ?? undefined,
    sku: row.sku ?? undefined,
    quantity: row.quantity,
    lowStockThreshold: row.low_stock_threshold,
    priceOverride: row.price_override != null ? Number(row.price_override) : undefined,
    availabilityStatus: row.availability_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Single `.in(...)` query for however many product ids the caller needs
// variants for, grouped in memory by product id — callers on a listing
// page (search results, category grid, brand page) fetch every product's
// variants in one round trip instead of one query per product.
export async function getVariantsForProducts(
  productIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, ProductVariant[]>> {
  const byProduct = new Map<string, ProductVariant[]>();
  if (productIds.length === 0) return byProduct;

  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .in("product_id", productIds);

  if (error) {
    throw new Error(`getVariantsForProducts failed: ${error.message}`);
  }

  for (const row of (data as ProductVariantRow[] | null) ?? []) {
    const variant = toProductVariant(row);
    const existing = byProduct.get(variant.productId);
    if (existing) existing.push(variant);
    else byProduct.set(variant.productId, [variant]);
  }

  return byProduct;
}
