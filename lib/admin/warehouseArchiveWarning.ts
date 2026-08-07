import { supabaseAdmin } from "@/lib/supabase/admin";

// Archiving a Mahaly Partner product doesn't touch its physical stock —
// whatever's still sitting in Mahaly's warehouse stays there, now hidden
// from the storefront but not requested back. Not a hard block (a brand
// may genuinely want to discard/write it off), just a surfaced warning so
// it's never a silent, easy-to-forget loose end.
export async function getPartnerStockWarning(productId: string, brandId: string): Promise<string | null> {
  const { data: brand } = await supabaseAdmin.from("brands").select("is_mahaly_partner").eq("id", brandId).maybeSingle();
  if (!brand?.is_mahaly_partner) return null;

  const { data: variants } = await supabaseAdmin
    .from("product_variants")
    .select("quantity")
    .eq("product_id", productId)
    .eq("is_archived", false);
  const totalStock = (variants ?? []).reduce((sum, v) => sum + (v.quantity as number), 0);
  if (totalStock <= 0) return null;

  return `This product still has ${totalStock} unit${totalStock === 1 ? "" : "s"} in Mahaly's Local Warehouse — archiving hides it from the storefront but doesn't return the stock. Request a return from the Local Warehouse page if you want it back.`;
}
