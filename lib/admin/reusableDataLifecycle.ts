import { supabaseAdmin } from "@/lib/supabase/admin";

export const HISTORICAL_DELETE_MESSAGE =
  "This value is used by published or historical product data and cannot be deleted. You can archive it instead.";

export async function optionValueReferences(id: string) {
  const [{ count: selectedCount }, { data: variantLinks }] = await Promise.all([
    supabaseAdmin.from("product_option_values").select("id", { count: "exact", head: true }).eq("option_value_id", id),
    supabaseAdmin.from("product_variant_values").select("variant_id").eq("option_value_id", id),
  ]);
  const variantIds = (variantLinks ?? []).map((row) => row.variant_id as string);
  let historical = 0;
  if (variantIds.length) {
    const { count } = await supabaseAdmin.from("order_items").select("id", { count: "exact", head: true }).in("variant_id", variantIds);
    historical = count ?? 0;
  }
  return { selectedCount: selectedCount ?? 0, variantCount: variantIds.length, historical };
}

export async function optionTypeReferences(id: string) {
  const { count } = await supabaseAdmin.from("product_options").select("id", { count: "exact", head: true }).eq("option_type_id", id);
  return { selectedCount: count ?? 0 };
}

export async function collectionReferences(id: string) {
  const { data } = await supabaseAdmin.from("products").select("id, status").eq("collection_id", id);
  const products = data ?? [];
  return {
    productCount: products.length,
    historical: products.some((product) => product.status !== "draft"),
  };
}
