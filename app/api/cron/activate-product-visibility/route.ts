import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Safety-net for the one case with no natural write to hook: a product
// whose only remaining launch blocker was a future publish_date simply
// elapsing (show_now), or a when_stocked product that already has stock
// but whose publish_date hadn't arrived yet when the stock landed. Every
// other transition (first stock arriving, publish, resume, the explicit
// "Show now" override) stamps first_visible_at inline at the moment it
// happens — see private.stamp_product_first_visible_if_eligible()
// (supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql).
// Same CRON_SECRET bearer-token auth as the existing storage-cleanup cron.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("execute_scheduled_product_visibility_activation", { p_batch_size: 200 });
    if (error) throw error;
    return NextResponse.json({ ok: true, ...(data as { checked: number; activated: number }) });
  } catch (error) {
    return safeErrorResponse("cron.activate-product-visibility", error as Error);
  }
}
