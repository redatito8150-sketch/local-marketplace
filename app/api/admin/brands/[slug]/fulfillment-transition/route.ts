import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

// GET: the brand's current (most recent) fulfillment transition, if any —
// used to render an in-progress transition's status/blockers.
// POST: request a new brand_fulfilled <-> zakhnook_fulfilled transition.
// See supabase/migrations/20260814000002_fulfillment_mode.sql for the
// state machine (requested -> validating -> awaiting_stock_transfer/
// scheduled -> ready_to_activate -> completed, or cancelled/failed).
export async function GET(_request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: brand } = await supabaseAdmin.from("brands").select("id, fulfillment_mode").eq("slug", params.slug).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: transition, error } = await supabaseAdmin
    .from("brand_fulfillment_transitions")
    .select("*")
    .eq("brand_id", brand.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return safeErrorResponse("admin.brands.fulfillmentTransition.get", error, "Failed to load fulfillment transition");

  return NextResponse.json({ fulfillmentMode: brand.fulfillment_mode, transition: transition ?? null });
}

export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { toMode?: string; notes?: string; effectiveDate?: string } | null;
  if (body?.toMode !== "brand_fulfilled" && body?.toMode !== "zakhnook_fulfilled") {
    return NextResponse.json({ error: "toMode must be 'brand_fulfilled' or 'zakhnook_fulfilled'" }, { status: 400 });
  }
  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

  const { data: brand } = await supabaseAdmin.from("brands").select("id, name").eq("slug", params.slug).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: result, error } = await supabaseAdmin.rpc("request_fulfillment_mode_transition", {
    p_brand_id: brand.id,
    p_to_mode: body.toMode,
    p_actor_id: admin.id,
    p_notes: body.notes ?? null,
    p_effective_date: body.effectiveDate ?? null,
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("admin.brands.fulfillmentTransition.request", error, "Failed to request the fulfillment mode change", 400);

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "fulfillment_transition",
    entityId: (result as { transition_id: string }).transition_id,
    action: "create",
    after: { "Requested mode": body.toMode, Notes: body.notes || undefined },
    brandSlug: params.slug,
  });

  return NextResponse.json(result);
}
