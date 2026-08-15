import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";

// Best-effort — same contract as notify()/logAudit(): supplementary to the
// real write it's attached to (a product save, a stock increase), so a
// failure here is logged, never thrown, and never blocks the operation
// that triggered it. Idempotent server-side (private.stamp_product_first_
// visible_if_eligible only ever sets a null first_visible_at once), so
// calling this defensively after every save that could plausibly have
// just made a product visible is safe and cheap.
export async function stampFirstVisibleIfEligible(productId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("stamp_product_first_visible_if_eligible", { p_product_id: productId });
  if (error) {
    logError(`stampFirstVisibleIfEligible(${productId}) failed`, error.message);
  }
}

export interface LaunchPolicyRpcResult {
  ok: boolean;
  code: string;
  message: string;
  launchPolicy?: "show_now" | "when_stocked";
  before?: Record<string, unknown>;
}

// The one authorized way to move a product from when_stocked to show_now
// after publish — a brand owner/admin explicitly overriding the wait-for-
// stock policy to expose the product out of stock before stock arrives.
// p_brand_id non-null verifies brand-portal ownership; null means the
// caller has already been authorized as admin at the application layer.
export async function setProductLaunchPolicyShowNow(
  productId: string,
  brandId: string | null,
  actorId: string,
  actorLabel: string
): Promise<LaunchPolicyRpcResult> {
  const { data, error } = await supabaseAdmin.rpc("set_product_launch_policy_show_now", {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
  });
  if (error) {
    logError(`setProductLaunchPolicyShowNow(${productId}) failed`, error.message);
    return { ok: false, code: "RPC_FAILED", message: "Something went wrong. Please try again." };
  }
  return data as LaunchPolicyRpcResult;
}
