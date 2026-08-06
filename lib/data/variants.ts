import { supabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductVariant, SellingStatus } from "@/types";

interface ProductVariantRow {
  id: string;
  product_id: string;
  sku: string;
  quantity: number;
  low_stock_threshold_override: number | null;
  variant_price: number | null;
  variant_discount_percent: number | null;
  selling_status: SellingStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface VariantValueRow {
  variant_id: string;
  option_value_id: string;
  option_values: {
    label: string;
    option_type_id: string;
    sort_order: number;
    brand_id: string | null;
    swatch_type: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    option_types: { id: string; name: string } | null;
  } | null;
}

// Single `.in(...)` query (plus one more for their option values) for
// however many product ids the caller needs variants for, grouped in
// memory by product id — callers on a listing page (search results,
// category grid, brand page) fetch every product's variants in one round
// trip instead of one query per product. Archived variants are excluded —
// they're historical only, never shown or purchasable.
export async function getVariantsForProducts(
  productIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, ProductVariant[]>> {
  const byProduct = new Map<string, ProductVariant[]>();
  if (productIds.length === 0) return byProduct;

  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .in("product_id", productIds)
    .eq("is_archived", false);

  if (error) {
    throw new Error(`getVariantsForProducts failed: ${error.message}`);
  }

  const rows = (data as ProductVariantRow[] | null) ?? [];
  if (rows.length === 0) return byProduct;

  const { data: valueRows, error: valuesError } = await client
    .from("product_variant_values")
    .select("variant_id, option_value_id, option_values(label, option_type_id, sort_order, brand_id, swatch_type, primary_color, secondary_color, option_types(id, name))")
    .in("variant_id", rows.map((r) => r.id));
  if (valuesError) {
    throw new Error(`getVariantsForProducts values failed: ${valuesError.message}`);
  }

  const valuesByVariant = new Map<string, VariantValueRow[]>();
  for (const row of ((valueRows ?? []) as unknown as VariantValueRow[])) {
    const list = valuesByVariant.get(row.variant_id) ?? [];
    list.push(row);
    valuesByVariant.set(row.variant_id, list);
  }

  for (const row of rows) {
    const variant: ProductVariant = {
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      quantity: row.quantity,
      lowStockThresholdOverride: row.low_stock_threshold_override ?? undefined,
      variantPrice: row.variant_price != null ? Number(row.variant_price) : undefined,
      variantDiscountPercent: row.variant_discount_percent != null ? Number(row.variant_discount_percent) : undefined,
      sellingStatus: row.selling_status,
      isArchived: row.is_archived,
      optionValues: (valuesByVariant.get(row.id) ?? [])
        .filter((v) => v.option_values)
        .map((v) => ({
          optionValueId: v.option_value_id,
          label: v.option_values!.label,
          optionTypeId: v.option_values!.option_type_id,
          optionTypeName: v.option_values!.option_types?.name ?? "",
          sortOrder: v.option_values!.sort_order,
          brandId: v.option_values!.brand_id,
          swatchType: (v.option_values!.swatch_type as ProductVariant["optionValues"][number]["swatchType"]) ?? undefined,
          primaryColor: v.option_values!.primary_color ?? undefined,
          secondaryColor: v.option_values!.secondary_color ?? undefined,
        })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const existing = byProduct.get(variant.productId);
    if (existing) existing.push(variant);
    else byProduct.set(variant.productId, [variant]);
  }

  return byProduct;
}
