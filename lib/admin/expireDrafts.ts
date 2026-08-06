import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";

export const DRAFT_EXPIRY_DAYS = 10;

// No cron/scheduled-job infrastructure exists in this project — this is
// the lazy alternative: called from the top of every products-list page
// load (admin and brand-portal), it deletes any draft product whose
// draft_started_at is more than DRAFT_EXPIRY_DAYS in the past. Relies on
// the same ON DELETE CASCADE FKs (product_variants, product_options,
// product_color_images, product_media, product_variant_values all
// reference products(id) on delete cascade) that the existing manual
// product-delete routes already trust — no separate child-table cleanup
// needed here. Best-effort: a failure here should never block the page
// itself from rendering, so callers just fire-and-forget this.
export async function deleteExpiredDrafts(brandId?: string): Promise<void> {
  const cutoff = new Date(Date.now() - DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let query = supabaseAdmin
    .from("products")
    .select("id")
    .eq("status", "draft")
    .lt("draft_started_at", cutoff);
  if (brandId) query = query.eq("brand_id", brandId);

  const { data, error } = await query;
  if (error) {
    logError("expireDrafts.load", error.message);
    return;
  }
  const ids = (data ?? []).map((row) => row.id as string);
  if (!ids.length) return;

  const { error: deleteError } = await supabaseAdmin.from("products").delete().in("id", ids);
  if (deleteError) {
    logError("expireDrafts.delete", deleteError.message);
  }
}

// Days remaining before a draft is auto-deleted — negative once expired
// (the lazy cleanup above just hasn't run yet for it). null when the
// product isn't a draft or was never stamped (pre-existing rows saved
// before this feature shipped).
export function draftDaysRemaining(draftStartedAt: string | null | undefined): number | null {
  if (!draftStartedAt) return null;
  const elapsedMs = Date.now() - new Date(draftStartedAt).getTime();
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  return Math.ceil(DRAFT_EXPIRY_DAYS - elapsedDays);
}
