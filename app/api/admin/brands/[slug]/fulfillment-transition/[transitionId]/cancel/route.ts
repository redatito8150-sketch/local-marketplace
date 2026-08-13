import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// Cancels an in-progress transition, reverting any cutover snapshot
// (brand_stock_quantity not yet shipped/received) back onto `quantity`.
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string; transitionId: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { notes?: string } | null;

  const { data: result, error } = await supabaseAdmin.rpc("cancel_fulfillment_transition", {
    p_transition_id: params.transitionId,
    p_actor_id: admin.id,
    p_notes: body?.notes ?? null,
  } as never);
  if (error) return safeErrorResponse("admin.brands.fulfillmentTransition.cancel", error, "Failed to cancel the fulfillment transition", 400);

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "fulfillment_transition",
    entityId: params.transitionId,
    action: "delete",
    after: { Notes: body?.notes || undefined },
    brandSlug: params.slug,
  });

  return NextResponse.json(result);
}
