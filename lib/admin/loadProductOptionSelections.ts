import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ProductOptionSelectionsSnapshot {
  optionTypeIdsInOrder: string[];
  valueIdsByOptionType: Record<string, string[]>;
}

// Loads a product's current option-type/value selections in the same
// shape replaceProductOptionSelections() accepts — used both to snapshot
// "before" state for a revertible audit log entry and to restore it later.
export async function loadProductOptionSelections(
  productId: string
): Promise<ProductOptionSelectionsSnapshot> {
  const { data: options, error } = await supabaseAdmin
    .from("product_options")
    .select("id, option_type_id, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`loadProductOptionSelections(${productId}) failed: ${error.message}`);

  const optionTypeIdsInOrder = (options ?? []).map((o) => o.option_type_id as string);
  const valueIdsByOptionType: Record<string, string[]> = {};

  if ((options ?? []).length > 0) {
    const { data: values, error: valuesError } = await supabaseAdmin
      .from("product_option_values")
      .select("product_option_id, option_value_id, sort_order")
      .in("product_option_id", (options ?? []).map((o) => o.id))
      .order("sort_order", { ascending: true });
    if (valuesError) {
      throw new Error(`loadProductOptionSelections(${productId}) values failed: ${valuesError.message}`);
    }
    const optionTypeByProductOptionId = new Map(
      (options ?? []).map((o) => [o.id as string, o.option_type_id as string])
    );
    for (const row of values ?? []) {
      const optionTypeId = optionTypeByProductOptionId.get(row.product_option_id as string);
      if (!optionTypeId) continue;
      const list = valueIdsByOptionType[optionTypeId] ?? [];
      list.push(row.option_value_id as string);
      valueIdsByOptionType[optionTypeId] = list;
    }
  }

  return { optionTypeIdsInOrder, valueIdsByOptionType };
}

// Loads a product's current Color -> image mapping as a plain
// optionValueId -> url record — the same shape replaceProductColorImages()
// accepts.
export async function loadProductColorImages(productId: string): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("product_color_images")
    .select("option_value_id, image_url")
    .eq("product_id", productId);
  if (error) throw new Error(`loadProductColorImages(${productId}) failed: ${error.message}`);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.option_value_id as string] = row.image_url as string;
  return map;
}
