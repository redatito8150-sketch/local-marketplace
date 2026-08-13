import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Re-checks an in-progress transition's blockers against current reality
// (e.g. after a transfer was just received) and advances/re-blocks its
// status accordingly. Safe to call repeatedly / poll.
export async function POST(_request: NextRequest, props: { params: Promise<{ slug: string; transitionId: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: result, error } = await supabaseAdmin.rpc("revalidate_fulfillment_transition", {
    p_transition_id: params.transitionId,
    p_actor_id: admin.id,
  } as never);
  if (error) return safeErrorResponse("admin.brands.fulfillmentTransition.revalidate", error, "Failed to revalidate the fulfillment transition", 400);

  return NextResponse.json(result);
}
