import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";

// A lightweight single-field PATCH for the admin brands list's inline
// Active/Partner/Sponsored buttons — the full PATCH at [slug]/route.ts
// requires the entire BrandInput payload (validateBrandInput), which the
// list page doesn't have loaded, so this exists as its own minimal route.
//
// isMahalyPartner no longer takes the plain-UPDATE path below —
// brands.fulfillment_mode (which is_mahaly_partner now mirrors, see
// supabase/migrations/20260814000002_fulfillment_mode.sql) can only change
// through the auditable fulfillment-transition workflow; a direct UPDATE
// would be rejected by that migration's guard trigger anyway. This route
// now calls request_fulfillment_mode_transition, then immediately tries to
// activate it — a brand with no inventory/open orders/transfers (the common
// case for this inline toggle) completes in one round trip; one with open
// blockers returns them (409) instead of silently failing.
type ToggleField = "isActive" | "isMahalyPartner" | "isSponsored";
const FIELD_TO_COLUMN: Record<Exclude<ToggleField, "isMahalyPartner">, string> = {
  isActive: "is_active",
  isSponsored: "is_sponsored",
};

interface RequestTransitionResult {
  transition_id: string;
  status: string;
  blockers?: string[];
  replayed: boolean;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const field = body.field as ToggleField;

  if (field === "isMahalyPartner") {
    if (typeof body.value !== "boolean") {
      return NextResponse.json({ error: "Invalid toggle request" }, { status: 400 });
    }
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, fulfillment_mode")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const toMode = body.value ? "zakhnook_fulfilled" : "brand_fulfilled";
    if (brand.fulfillment_mode === toMode) return NextResponse.json({ ok: true });

    const { data: requestResult, error: requestError } = await supabaseAdmin.rpc("request_fulfillment_mode_transition", {
      p_brand_id: brand.id,
      p_to_mode: toMode,
      p_actor_id: admin.id,
      p_notes: "Requested via admin quick-toggle",
      p_effective_date: null,
      p_operation_key: randomUUID(),
    } as never);
    if (requestError) {
      return safeErrorResponse(
        "admin.brands.quickToggle.fulfillmentTransition",
        requestError,
        "Failed to start the fulfillment mode change",
        400
      );
    }
    const { transition_id: transitionId, status: initialStatus, blockers } = requestResult as RequestTransitionResult;

    if (initialStatus !== "ready_to_activate") {
      return NextResponse.json(
        {
          ok: false,
          transitionId,
          status: initialStatus,
          blockers: blockers ?? [],
          error:
            "This brand has open stock/orders/transfers — resolve them, then complete the fulfillment mode change from its transition record.",
        },
        { status: 409 }
      );
    }

    const { data: activateResult, error: activateError } = await supabaseAdmin.rpc("activate_fulfillment_mode_transition", {
      p_transition_id: transitionId,
      p_actor_id: admin.id,
    } as never);
    if (activateError) {
      return safeErrorResponse(
        "admin.brands.quickToggle.fulfillmentTransition.activate",
        activateError,
        "Failed to complete the fulfillment mode change",
        400
      );
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "brand",
      entityId: params.slug,
      action: "update",
      before: { isMahalyPartner: brand.fulfillment_mode === "zakhnook_fulfilled" },
      after: { isMahalyPartner: body.value },
    });

    return NextResponse.json({ ok: true, transitionId, status: (activateResult as { status: string }).status });
  }

  if (!Object.prototype.hasOwnProperty.call(FIELD_TO_COLUMN, field) || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Invalid toggle request" }, { status: 400 });
  }
  const column = FIELD_TO_COLUMN[field];

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("id, " + column)
    .eq("slug", params.slug)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brands")
    .update({ [column]: body.value })
    .eq("slug", params.slug);

  if (error) {
    return safeErrorResponse("admin.brands.quickToggle", error, "Failed to update brand");
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing ? { [field]: (existing as unknown as Record<string, unknown>)[column] } : undefined,
    after: { [field]: body.value },
  });

  return NextResponse.json({ ok: true });
}
