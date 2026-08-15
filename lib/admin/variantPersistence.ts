import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildComboKey } from "@/lib/inventory/variantCombinations";
import { buildVariantSkuBase, buildVariantSkuWithSuffix } from "@/lib/inventory/variantSku";
import { logError } from "@/lib/errorLog";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import type { SellingStatus } from "@/types";

export interface VariantEditInput {
  id?: string;
  optionValueIds: string[]; // in the product's declared option order
  // Read-only passthrough of an already-persisted variant's real quantity —
  // never written by this module. Irrelevant for a brand-new row, which
  // always starts at 0 server-side regardless of this value (see
  // create_variant_with_opening_stock).
  quantity: number;
  variantPrice?: number | null;
  variantDiscountPercent?: number | null;
  lowStockThresholdOverride?: number | null;
  sellingStatus: SellingStatus;
}

export type SyncVariantsResult =
  | { ok: true; variantIds: string[]; removedArchivedCount: number; removedDeletedCount: number }
  | { ok: false; error: string };

// Every `error` string this module returns used to interpolate the raw
// Postgres error message (`${error.message}`) straight into text that
// flowed, unmodified, all the way to the client's error banner — a real
// internal-detail leak (schema/constraint text reaching the browser). The
// real message is now only ever passed to logError() (console + Discord
// #errors mirror); every returned `error` is a fixed, safe string.
function fail(context: string, pgError: { message: string }, safeMessage: string): { ok: false; error: string } {
  logError(context, pgError.message);
  return { ok: false, error: safeMessage };
}

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
  actorId: string;
  operationKey: string;
}): Promise<SyncVariantsResult> {
  const { productId, productSku, submitted, actorId, operationKey } = params;

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("product_variants")
    .select("id, combo_key, is_archived, quantity")
    .eq("product_id", productId)
    .eq("is_archived", false);
  if (existingError) {
    return fail("variantPersistence.loadExisting", existingError, "We couldn't load this product's current variants. Try again.");
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
      return fail("variantPersistence.resolveOptionValues", valuesError, "We couldn't resolve this product's color/size options. Try again.");
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
          variant_price: edit.variantPrice ?? null,
          variant_discount_percent: edit.variantDiscountPercent ?? null,
          low_stock_threshold_override: edit.lowStockThresholdOverride ?? null,
          selling_status: edit.sellingStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      if (updateError) {
        return fail("variantPersistence.updateVariant", updateError, "We couldn't save this variant's changes. Try again.");
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
    let lastError: { message: string } | null = null;
    for (let attempt = 0; attempt < 5 && !newVariantId; attempt++) {
      const sku = buildVariantSkuWithSuffix(base, attempt);
      const { data: inserted, error: insertError } = await supabaseAdmin.rpc(
        "create_variant_with_opening_stock",
        {
          p_product_id: productId,
          p_sku: sku,
          p_combo_key: comboKey,
          // Ignored server-side unconditionally now (see
          // create_variant_with_opening_stock) — sent as 0 for honesty,
          // not because the RPC trusts it.
          p_opening_stock: 0,
          p_variant_price: edit.variantPrice ?? null,
          p_variant_discount_percent: edit.variantDiscountPercent ?? null,
          p_low_stock_threshold_override: edit.lowStockThresholdOverride ?? null,
          p_selling_status: edit.sellingStatus,
          p_option_value_ids: edit.optionValueIds,
          p_actor_id: actorId,
          p_operation_key: `${operationKey}:${comboKey || "default"}`,
        } as never
      );
      if (!insertError && inserted) {
        newVariantId = inserted as string;
      } else if (insertError && insertError.code !== "23505") {
        lastError = insertError;
        break;
      } else if (insertError) {
        lastError = insertError;
      }
    }
    if (!newVariantId) {
      return fail(
        "variantPersistence.generateSku",
        lastError ?? { message: "unknown error" },
        "We couldn't generate a unique SKU for this variant. Try saving again."
      );
    }

    variantIds.push(newVariantId);
  }

  // Combinations that existed before but aren't in this submission anymore.
  let removedArchivedCount = 0;
  let removedDeletedCount = 0;
  for (const [comboKey, existingId] of existingByCombo) {
    if (submittedByCombo.has(comboKey)) continue;

    const row = (existingRows ?? []).find((candidate) => candidate.id === existingId);
    if ((row?.quantity ?? 0) > 0) {
      return {
        ok: false,
        error: "Resolve this variant's remaining stock in Inventory before removing it.",
      };
    }

    const { count } = await supabaseAdmin
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", existingId);

    if (count && count > 0) {
      const { error: archiveError } = await supabaseAdmin
        .from("product_variants")
        .update({ is_archived: true })
        .eq("id", existingId);
      if (archiveError) {
        return fail("variantPersistence.archiveVariant", archiveError, "We couldn't remove this variant. Try again.");
      }
      removedArchivedCount += 1;
    } else {
      const { error: deleteError } = await supabaseAdmin
        .from("product_variants")
        .delete()
        .eq("id", existingId);
      if (deleteError) {
        return fail("variantPersistence.deleteVariant", deleteError, "We couldn't remove this variant. Try again.");
      }
      removedDeletedCount += 1;
    }
  }

  // Covers a variant whose selling_status just flipped back to "active"
  // here (quantity itself is never touched by this save path — see the
  // update above — only Inventory's own adjustments RPC changes that, and
  // calls this too). Re-verifies purchasability itself and no-ops for
  // anything not actually purchasable or with no waiting subscribers, so
  // it's safe to call for every touched variant rather than pre-filtering.
  await checkAndNotifyRestock(variantIds);

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
    return fail("variantPersistence.resetColorImages", deleteError, "We couldn't save the color images. Try again.");
  }

  const entries = Object.entries(colorImages).filter(([, url]) => url?.trim());
  if (entries.length === 0) return { ok: true };

  const { error: insertError } = await supabaseAdmin.from("product_color_images").insert(
    entries.map(([optionValueId, imageUrl]) => ({ product_id: productId, option_value_id: optionValueId, image_url: imageUrl }))
  );
  if (insertError) {
    return fail("variantPersistence.saveColorImages", insertError, "We couldn't save the color images. Try again.");
  }
  return { ok: true };
}

export async function replaceProductMedia(params: {
  productId: string;
  coverUrl: string;
  galleryUrls: string[];
  colorImages: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Real limits (1 cover, up to 3 gallery, 1 per color) are enforced by the
  // editor's ImageUploader instances; this is only a generous safety backstop.
  const orderedUrls = [...new Set([params.coverUrl, ...params.galleryUrls, ...Object.values(params.colorImages)].filter(Boolean))].slice(0, 50);
  const colorByUrl = new Map(Object.entries(params.colorImages).map(([valueId, url]) => [url, valueId]));
  const { error: deleteError } = await supabaseAdmin.from("product_media").delete().eq("product_id", params.productId);
  if (deleteError) return fail("variantPersistence.resetMedia", deleteError, "We couldn't save the product media. Try again.");
  if (!orderedUrls.length) return { ok: true };
  const { error } = await supabaseAdmin.from("product_media").insert(orderedUrls.map((url, displayOrder) => ({
    product_id: params.productId,
    storage_reference: url,
    display_order: displayOrder,
    is_cover: url === params.coverUrl,
    color_option_value_id: colorByUrl.get(url) ?? null,
  })));
  return error ? fail("variantPersistence.saveMedia", error, "We couldn't save the product media. Try again.") : { ok: true };
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
    return fail("variantPersistence.resetOptions", deleteError, "We couldn't save the product's variant options. Try again.");
  }

  for (let i = 0; i < optionTypeIdsInOrder.length; i++) {
    const optionTypeId = optionTypeIdsInOrder[i];
    const { data: created, error: insertError } = await supabaseAdmin
      .from("product_options")
      .insert({ product_id: productId, option_type_id: optionTypeId, sort_order: i })
      .select("id")
      .single();
    if (insertError || !created) {
      return fail("variantPersistence.saveOptions", insertError ?? { message: "insert returned no row" }, "We couldn't save the product's variant options. Try again.");
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
        return fail("variantPersistence.saveOptionValues", valuesError, "We couldn't save the product's variant options. Try again.");
      }
    }
  }

  return { ok: true };
}
