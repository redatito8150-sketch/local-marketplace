import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// Atomically flips brands.fulfillment_mode — only succeeds when the
// transition is (still, re-checked under lock) ready_to_activate. See
// supabase/migrations/20260814000002_fulfillment_mode.sql's
// activate_fulfillment_mode_transition for the reconciliation logic run at
// this moment (e.g. moving residual brand_stock_quantity back into
// `quantity` for a zakhnook_fulfilled -> brand_fulfilled switch).
export async function POST(_request: NextRequest, props: { params: Promise<{ slug: string; transitionId: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: result, error } = await supabaseAdmin.rpc("activate_fulfillment_mode_transition", {
    p_transition_id: params.transitionId,
    p_actor_id: admin.id,
  } as never);
  if (error) return safeErrorResponse("admin.brands.fulfillmentTransition.activate", error, "Failed to activate the fulfillment mode change", 400);

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "fulfillment_transition",
    entityId: params.transitionId,
    action: "approve",
    after: { "New fulfillment mode": (result as { new_mode: string }).new_mode },
    brandSlug: params.slug,
  });

  return NextResponse.json(result);
}
