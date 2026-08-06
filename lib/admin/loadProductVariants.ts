import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProductVariant, SellingStatus } from "@/types";

interface VariantRow {
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

// Loads a product's non-archived variants with their resolved option
// value labels — the one shared read path for the admin form, the public
// product detail page, and the brand-portal/admin inventory pages, so
// none of them independently re-derive this shape.
export async function loadProductVariants(
  productId: string,
  options: { includeArchived?: boolean } = {}
): Promise<ProductVariant[]> {
  let query = supabaseAdmin.from("product_variants").select("*").eq("product_id", productId);
  if (!options.includeArchived) query = query.eq("is_archived", false);
  const { data: variantRows, error } = await query.order("created_at", { ascending: true });
  if (error) throw new Error(`loadProductVariants(${productId}) failed: ${error.message}`);

  const variants = (variantRows ?? []) as VariantRow[];
  if (variants.length === 0) return [];

  const { data: valueRows, error: valuesError } = await supabaseAdmin
    .from("product_variant_values")
    .select("variant_id, option_value_id, option_values(label, option_type_id, sort_order, brand_id, swatch_type, primary_color, secondary_color, option_types(id, name))")
    .in("variant_id", variants.map((v) => v.id));
  if (valuesError) throw new Error(`loadProductVariants(${productId}) values failed: ${valuesError.message}`);

  const valuesByVariant = new Map<string, VariantValueRow[]>();
  for (const row of (valueRows ?? []) as unknown as VariantValueRow[]) {
    const list = valuesByVariant.get(row.variant_id) ?? [];
    list.push(row);
    valuesByVariant.set(row.variant_id, list);
  }

  return variants.map((v) => ({
    id: v.id,
    productId: v.product_id,
    sku: v.sku,
    quantity: v.quantity,
    lowStockThresholdOverride: v.low_stock_threshold_override ?? undefined,
    variantPrice: v.variant_price ?? undefined,
    variantDiscountPercent: v.variant_discount_percent ?? undefined,
    sellingStatus: v.selling_status,
    isArchived: v.is_archived,
    optionValues: (valuesByVariant.get(v.id) ?? [])
      .filter((row) => row.option_values)
      .map((row) => ({
        optionValueId: row.option_value_id,
        label: row.option_values!.label,
        optionTypeId: row.option_values!.option_type_id,
        optionTypeName: row.option_values!.option_types?.name ?? "",
        sortOrder: row.option_values!.sort_order,
        brandId: row.option_values!.brand_id,
        swatchType: (row.option_values!.swatch_type as ProductVariant["optionValues"][number]["swatchType"]) ?? undefined,
        primaryColor: row.option_values!.primary_color ?? undefined,
        secondaryColor: row.option_values!.secondary_color ?? undefined,
      })),
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  }));
}
