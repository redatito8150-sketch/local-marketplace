import "server-only";
import { DRAFT_EXPIRY_DAYS } from "@/lib/admin/expireDrafts";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function archiveExpiredProductDrafts(limit = 500): Promise<number> {
  const cutoff = new Date(Date.now() - DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("archive_expired_product_drafts", {
    p_cutoff: cutoff,
    p_limit: Math.min(Math.max(limit, 1), 1000),
  });
  if (error) throw error;
  return Number(data ?? 0);
}
