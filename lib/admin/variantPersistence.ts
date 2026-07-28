import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildComboKey } from "@/lib/inventory/variantCombinations";
import { buildVariantSkuBase, buildVariantSkuWithSuffix } from "@/lib/inventory/variantSku";
import type { SellingStatus } from "@/types";

export interface VariantEditInput {
  optionValueIds: string[]; // in the product's declared option order
  quantity: number;
  variantPrice?: number | null;
  lowStockThresholdOverride?: number | null;
  sellingStatus: SellingStatus;
}

export type SyncVariantsResult =
  | { ok: true; variantIds: string[]; removedArchivedCount: number; removedDeletedCount: number }
  | { ok: false; error: string };

// Safe variant regeneration: matches submitted combinations against
// existing variants by their (order-independent) combo key. A match
// preserves the variant row exactly (id, SKU, and anything not present in
// this edit) and only updates quantity/variantPrice/threshold/status. A
// new combination gets a freshly generated, immutable SKU. A previously
// existing combination that's no longer submitted is archived (if it has
// order history) or hard-deleted (if it has none) — never silently
// destroyed when it carries real history.
export async function syncProductVariants(params: {
  productId: string;
  productSku: string;
  submitted: VariantEditInput[];
}): Promise<SyncVariantsResult> {
  const { productId, productSku, submitted } = params;

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("product_variants")
    .select("id, combo_key, is_archived")
    .eq("product_id", productId)
    .eq("is_archived", false);
  if (existingError) {
    return { ok: false, error: `Failed to load existing variants: ${existingError.message}` };
  }
  const existingByCombo = new Map((existingRows ?? []).map((row) => [row.combo_key as string, row.id as string]));

  const submittedByCombo = new Map(
    submitted.map((s) => [buildComboKey(s.optionValueIds), s] as const)
  );

  // Resolve sku_token for every option value referenced, once.
  const allValueIds = [...new Set(submitted.flatMap((s) => s.optionValueIds))];
  const tokenById = new Map<string, string>();
  if (allValueIds.length > 0) {
    const { data: values, error: valuesError } = await supabaseAdmin
      .from("option_values")
      .select("id, sku_token")
      .in("id", allValueIds);
    if (valuesError) {
      return { ok: false, error: `Failed to resolve option values: ${valuesError.message}` };
    }
    for (const v of values ?? []) tokenById.set(v.id as string, v.sku_token as string);
  }

  const variantIds: string[] = [];

  for (const [comboKey, edit] of submittedByCombo) {
    const existingId = existingByCombo.get(comboKey);
    if (existingId) {
      const { error: updateError } = await supabaseAdmin
        .from("product_variants")
        .update({
          quantity: edit.quantity,
          variant_price: edit.variantPrice ?? null,
          low_stock_threshold_override: edit.lowStockThresholdOverride ?? null,
          selling_status: edit.sellingStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      if (updateError) {
        return { ok: false, error: `Failed to update variant: ${updateError.message}` };
      }
      variantIds.push(existingId);
      continue;
    }

    // New combination — generate an immutable SKU (retry with a numeric
    // suffix on the rare token collision, same pattern used for product
    // ids/collection slugs elsewhere in this codebase).
    const tokens = edit.optionValueIds.map((id) => tokenById.get(id)).filter((t): t is string => Boolean(t));
    const base = buildVariantSkuBase(productSku, tokens);
    let newVariantId: string | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 5 && !newVariantId; attempt++) {
      const sku = buildVariantSkuWithSuffix(base, attempt);
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("product_variants")
        .insert({
          product_id: productId,
          sku,
          quantity: edit.quantity,
          variant_price: edit.variantPrice ?? null,
          low_stock_threshold_override: edit.lowStockThresholdOverride ?? null,
          selling_status: edit.sellingStatus,
          combo_key: comboKey,
        })
        .select("id")
        .single();
      if (!insertError && inserted) {
        newVariantId = inserted.id as string;
      } else if (insertError && insertError.code !== "23505") {
        lastError = insertError.message;
        break;
      } else if (insertError) {
        lastError = insertError.message;
      }
    }
    if (!newVariantId) {
      return { ok: false, error: `Failed to generate a unique variant SKU: ${lastError ?? "unknown error"}` };
    }

    if (edit.optionValueIds.length > 0) {
      const { error: valuesInsertError } = await supabaseAdmin.from("product_variant_values").insert(
        edit.optionValueIds.map((optionValueId) => ({ variant_id: newVariantId, option_value_id: optionValueId }))
      );
      if (valuesInsertError) {
        return { ok: false, error: `Failed to save variant options: ${valuesInsertError.message}` };
      }
    }
    variantIds.push(newVariantId);
  }

  // Combinations that existed before but aren't in this submission anymore.
  let removedArchivedCount = 0;
  let removedDeletedCount = 0;
  for (const [comboKey, existingId] of existingByCombo) {
    if (submittedByCombo.has(comboKey)) continue;

    const { count } = await supabaseAdmin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", existingId);

    if (count && count > 0) {
      const { error: archiveError } = await supabaseAdmin
        .from("product_variants")
        .update({ is_archived: true })
        .eq("id", existingId);
      if (archiveError) {
        return { ok: false, error: `Failed to archive removed variant: ${archiveError.message}` };
      }
      removedArchivedCount += 1;
    } else {
      const { error: deleteError } = await supabaseAdmin
        .from("product_variants")
        .delete()
        .eq("id", existingId);
      if (deleteError) {
        return { ok: false, error: `Failed to remove variant: ${deleteError.message}` };
      }
      removedDeletedCount += 1;
    }
  }

  return { ok: true, variantIds, removedArchivedCount, removedDeletedCount };
}

// Replaces a product's Color -> image mapping. No independent history of
// its own (unlike variants), so delete-then-reinsert is safe.
export async function replaceProductColorImages(params: {
  productId: string;
  colorImages: Record<string, string>; // optionValueId -> url
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { productId, colorImages } = params;

  const { error: deleteError } = await supabaseAdmin
    .from("product_color_images")
    .delete()
    .eq("product_id", productId);
  if (deleteError) {
    return { ok: false, error: `Failed to reset color images: ${deleteError.message}` };
  }

  const entries = Object.entries(colorImages).filter(([, url]) => url?.trim());
  if (entries.length === 0) return { ok: true };

  const { error: insertError } = await supabaseAdmin.from("product_color_images").insert(
    entries.map(([optionValueId, imageUrl]) => ({ product_id: productId, option_value_id: optionValueId, image_url: imageUrl }))
  );
  if (insertError) {
    return { ok: false, error: `Failed to save color images: ${insertError.message}` };
  }
  return { ok: true };
}

// Replaces a product's option-type/value selections (product_options /
// product_option_values) — small, no independent history of their own, so
// a delete-then-reinsert is safe (unlike product_variants, which must be
// reconciled, never wholesale replaced).
export async function replaceProductOptionSelections(params: {
  productId: string;
  optionTypeIdsInOrder: string[];
  valueIdsByOptionType: Map<string, string[]>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { productId, optionTypeIdsInOrder, valueIdsByOptionType } = params;

  const { error: deleteError } = await supabaseAdmin
    .from("product_options")
    .delete()
    .eq("product_id", productId);
  if (deleteError) {
    return { ok: false, error: `Failed to reset product options: ${deleteError.message}` };
  }

  for (let i = 0; i < optionTypeIdsInOrder.length; i++) {
    const optionTypeId = optionTypeIdsInOrder[i];
    const { data: created, error: insertError } = await supabaseAdmin
      .from("product_options")
      .insert({ product_id: productId, option_type_id: optionTypeId, sort_order: i })
      .select("id")
      .single();
    if (insertError || !created) {
      return { ok: false, error: `Failed to save product options: ${insertError?.message}` };
    }

    const valueIds = valueIdsByOptionType.get(optionTypeId) ?? [];
    if (valueIds.length > 0) {
      const { error: valuesError } = await supabaseAdmin.from("product_option_values").insert(
        valueIds.map((optionValueId, sortOrder) => ({
          product_option_id: created.id,
          option_value_id: optionValueId,
          sort_order: sortOrder,
        }))
      );
      if (valuesError) {
        return { ok: false, error: `Failed to save product option values: ${valuesError.message}` };
      }
    }
  }

  return { ok: true };
}
