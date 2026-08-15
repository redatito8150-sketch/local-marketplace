import { supabaseAdmin } from "@/lib/supabase/admin";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { notifyUser } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { backInStockEmail } from "@/lib/email/templates/backInStock";
import { logError } from "@/lib/errorLog";

// "Notify me when back in stock" is scoped to one specific variant (the
// exact Color+Size a shopper wanted), never the whole product — one color
// can be sold out while every other one is fine. See supabase/migrations/
// 20260809000003_back_in_stock_subscriptions.sql.

// Degrades to "nothing subscribed" rather than throwing if the migration
// hasn't been applied yet (undefined_table) — a missing subscriptions
// table should never break the product page itself.
export async function getSubscribedVariantIds(userId: string, productId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("back_in_stock_subscriptions")
    .select("variant_id")
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) {
    logError("getSubscribedVariantIds failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.variant_id as string);
}

export async function subscribeToRestock(
  userId: string,
  email: string,
  productId: string,
  variantId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: variant, error } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id, quantity, selling_status, is_archived")
    .eq("id", variantId)
    .maybeSingle();
  if (error || !variant || variant.product_id !== productId) {
    return { ok: false, error: "That variant couldn't be found." };
  }
  // Defensive — never let someone subscribe to something already
  // purchasable (the button shouldn't offer this in the first place, but
  // stock can change between page load and click).
  if (
    isVariantPurchasable({
      sellingStatus: variant.selling_status,
      quantity: variant.quantity,
      isArchived: variant.is_archived,
    })
  ) {
    return { ok: false, error: "This is already in stock." };
  }

  const { error: insertError } = await supabaseAdmin
    .from("back_in_stock_subscriptions")
    .insert({ user_id: userId, email, product_id: productId, variant_id: variantId });
  // A unique_violation just means they already subscribed — treat that as
  // success rather than an error the shopper needs to see.
  if (insertError) {
    if (insertError.code === "23505") return { ok: true };
    // CORRECTIVE PASS: the database's own back_in_stock_subscriptions_
    // enforce_visibility trigger (supabase/migrations/
    // 20260815000000_product_launch_policy_and_opening_stock.sql) rejects
    // an INSERT outright for a product that isn't currently
    // customer-visible (PRODUCT_NOT_AVAILABLE_FOR_NOTIFY_ME) — a hidden
    // when_stocked, paused, future-scheduled, inactive-brand, archived, or
    // transition-blocked product. A show_now out-of-stock product is
    // unaffected (it's visible, so the trigger never fires). This is the
    // hard boundary; this check just turns the raw DB exception into a
    // clean, user-facing message.
    if (insertError.message.includes("PRODUCT_NOT_AVAILABLE_FOR_NOTIFY_ME")) {
      return { ok: false, error: "This product isn't currently available to customers." };
    }
    logError("subscribeToRestock failed", insertError.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return { ok: true };
}

// Shape of a row returned by claim_back_in_stock_deliveries (supabase/
// migrations/20260815000000_product_launch_policy_and_opening_stock.sql) —
// not in the generated Supabase types since that migration is still
// unapplied (see the RPC call site below).
interface ClaimedBackInStockDelivery {
  id: string;
  variant_id: string;
  user_id: string;
  email: string;
}

interface VariantNotifyDetail {
  productId: string;
  productName: string;
  image: string;
  brandSlug?: string;
  variantLabel: string;
}

async function loadVariantNotifyDetails(variantIds: string[]): Promise<Map<string, VariantNotifyDetail>> {
  const result = new Map<string, VariantNotifyDetail>();
  const { data: variantRows } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id")
    .in("id", variantIds);
  if (!variantRows?.length) return result;

  const productIds = [...new Set(variantRows.map((row) => row.product_id as string))];
  const [{ data: products }, { data: valueRows }] = await Promise.all([
    supabaseAdmin.from("products").select("id, name, image, brand_slug").in("id", productIds),
    supabaseAdmin
      .from("product_variant_values")
      .select("variant_id, option_value_id, option_values(label, option_types(name))")
      .in("variant_id", variantIds),
  ]);

  const productById = new Map((products ?? []).map((row) => [row.id as string, row]));
  const labelsByVariant = new Map<string, string[]>();
  // The Color option value each variant selected — used below to pull that
  // exact color's photo (product_media) instead of always sending the
  // product's generic cover image regardless of which color someone
  // actually asked to be notified about.
  const colorValueIdByVariant = new Map<string, string>();
  for (const row of (valueRows ?? []) as unknown as {
    variant_id: string;
    option_value_id: string;
    option_values: { label: string; option_types: { name: string } | null } | null;
  }[]) {
    if (!row.option_values) continue;
    const list = labelsByVariant.get(row.variant_id) ?? [];
    list.push(row.option_values.label);
    labelsByVariant.set(row.variant_id, list);
    if (row.option_values.option_types?.name.toLowerCase() === "color") {
      colorValueIdByVariant.set(row.variant_id, row.option_value_id);
    }
  }

  // Same source of truth as the product page's own Color -> image mapping
  // (see getProductById in lib/data/products.ts) — one row per Color per
  // product, keyed by (product_id, color_option_value_id).
  const colorValueIds = [...new Set(colorValueIdByVariant.values())];
  const { data: mediaRows } = colorValueIds.length
    ? await supabaseAdmin
        .from("product_media")
        .select("product_id, color_option_value_id, storage_reference")
        .in("product_id", productIds)
        .in("color_option_value_id", colorValueIds)
        .eq("is_archived", false)
    : { data: [] as { product_id: string; color_option_value_id: string; storage_reference: string }[] };
  const colorImageByKey = new Map(
    (mediaRows ?? []).map((row) => [`${row.product_id}:${row.color_option_value_id}`, row.storage_reference as string])
  );

  for (const row of variantRows) {
    const product = productById.get(row.product_id as string);
    if (!product) continue;
    const colorValueId = colorValueIdByVariant.get(row.id as string);
    const colorImage = colorValueId ? colorImageByKey.get(`${row.product_id}:${colorValueId}`) : undefined;
    result.set(row.id as string, {
      productId: row.product_id as string,
      productName: product.name as string,
      image: colorImage ?? (product.image as string),
      brandSlug: (product.brand_slug as string | null) ?? undefined,
      variantLabel: (labelsByVariant.get(row.id as string) ?? []).join(" / "),
    });
  }
  return result;
}

// Call this with every variant id that could plausibly have just become
// purchasable — a quantity bump, a selling_status flip back to "active",
// etc. Re-verifies purchasability itself (never trust the caller's
// before/after diff alone), so it's safe and cheap to call broadly rather
// than needing perfect change-detection at every call site. Never throws
// — same contract as notify()/notifyUser()/sendEmail(), since this is a
// side effect hung off unrelated save/adjustment requests and must never
// fail those.
//
// CORRECTIVE PASS — durable delivery: subscriptions are no longer deleted
// before (or instead of) confirmed delivery. claim_back_in_stock_deliveries
// (supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql)
// atomically claims each eligible row (variant purchasable — checked here
// — AND the product currently customer-visible — checked as PART of the
// same claiming UPDATE, not a separate stale read) into a 'claimed' lease.
// A concurrent worker can never double-claim: the claiming UPDATE's WHERE
// clause only matches 'pending' rows or 'claimed' rows whose lease has
// expired, so two simultaneous calls simply serialize and the second only
// ever claims whatever the first didn't. Delivery success/failure is then
// reported back explicitly (mark_..._sent / mark_..._failed) — a failed
// send (or a process crash before either call lands) leaves the row
// 'claimed' until its lease expires, then it's retried on a later call, up
// to a bounded attempts budget; only then does it become a permanent,
// inspectable 'failed' row. Nothing is ever silently discarded.
export async function checkAndNotifyRestock(variantIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(variantIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  try {
    const { data: variants, error } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, quantity, selling_status, is_archived")
      .in("id", uniqueIds);
    if (error || !variants?.length) return;

    // Variant-level purchasability (Selling Status Active, quantity > 0,
    // not archived — never for damaged/missing/quarantined/reserved
    // stock, since none of that ever reaches product_variants.quantity).
    // Product-level visibility is checked next, atomically, inside the
    // claim itself.
    const purchasableIds = variants
      .filter((row) =>
        isVariantPurchasable({
          sellingStatus: row.selling_status,
          quantity: row.quantity,
          isArchived: row.is_archived,
        })
      )
      .map((row) => row.id as string);
    if (purchasableIds.length === 0) return;

    // CORRECTIVE PASS: claim_back_in_stock_deliveries isn't in the
    // generated Supabase types yet (its migration is still unapplied — see
    // this migration's own header — so `supabase gen types` has never run
    // against it), which makes `.rpc()`'s return type unknown[] rather than
    // a real row shape. Cast explicitly to the RPC's documented return
    // columns (supabase/migrations/20260815000000_product_launch_policy_
    // and_opening_stock.sql, private/public.claim_back_in_stock_deliveries)
    // instead of leaving this untyped.
    const { data: claimedRaw, error: claimError } = await supabaseAdmin.rpc("claim_back_in_stock_deliveries", {
      p_variant_ids: purchasableIds,
    });
    if (claimError || !claimedRaw?.length) {
      if (claimError) logError("checkAndNotifyRestock: claim failed", claimError.message);
      return;
    }
    const claimed = claimedRaw as unknown as ClaimedBackInStockDelivery[];

    const details = await loadVariantNotifyDetails([...new Set(claimed.map((row) => row.variant_id))]);

    // Each claimed row is delivered independently — one subscriber's
    // failure must never stop the rest of the batch, and every outcome
    // (success or failure) is explicitly reported back to the database so
    // the row's state always reflects reality, never assumed.
    for (const claim of claimed) {
      const detail = details.get(claim.variant_id);
      if (!detail) {
        // No resolvable detail (e.g. the variant was deleted between claim
        // and delivery) — nothing meaningful to send; record it as a
        // failure so it's retried/eventually surfaced rather than left
        // claimed forever.
        await supabaseAdmin.rpc("mark_back_in_stock_delivery_failed", {
          p_id: claim.id, p_error: "No variant/product detail resolvable at delivery time",
        });
        continue;
      }
      const { subject, html } = backInStockEmail(detail);
      const emailResult = await sendEmail({ to: claim.email, subject, html });
      if (!emailResult.ok) {
        await supabaseAdmin.rpc("mark_back_in_stock_delivery_failed", {
          p_id: claim.id, p_error: emailResult.error ?? "sendEmail failed",
        });
        continue;
      }
      const notifyResult = await notifyUser(
        claim.user_id,
        "back_in_stock",
        `${detail.productName} is back in stock`,
        detail.variantLabel ? `${detail.variantLabel} is available again.` : "It's available again.",
        { relatedEntityType: "product", relatedEntityId: detail.productId }
      );
      if (!notifyResult.ok) {
        // The email already sent successfully — recording the in-account
        // notification failed, which is a real but lesser failure. Still
        // marked failed (not sent) so it's retried: sendEmail is expected
        // to be safely re-callable by the shopper's own inbox (a duplicate
        // "back in stock" email is a much smaller harm than a silently
        // lost account notification), and the alternative — marking this
        // 'sent' despite a known partial failure — would hide the gap.
        await supabaseAdmin.rpc("mark_back_in_stock_delivery_failed", {
          p_id: claim.id, p_error: notifyResult.error ?? "notifyUser failed",
        });
        continue;
      }
      await supabaseAdmin.rpc("mark_back_in_stock_delivery_sent", { p_id: claim.id });
    }
  } catch (err) {
    logError("checkAndNotifyRestock failed", err instanceof Error ? err.message : String(err));
  }
}
