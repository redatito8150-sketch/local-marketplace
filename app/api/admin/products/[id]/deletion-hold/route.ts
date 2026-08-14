import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { applyProductDeletionHold, releaseProductDeletionHold } from "@/lib/admin/productDeletion";

// A real legal/admin hold — blocks immediate hard deletion, scheduling,
// and execution of an existing schedule while active (enforced inside the
// canonical eligibility calculation every relevant RPC recomputes fresh —
// never trusted from a stale read). Applying a hold to an already-
// scheduled product safely stops that schedule. Releasing a hold never
// auto-schedules or auto-deletes anything.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-product-hold-apply:${staff.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to apply a hold." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("name, brand_slug").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const result = await applyProductDeletionHold(params.id, staff.user.id, staff.user.email ?? staff.user.id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "ALREADY_ON_HOLD" ? 409 : 400 });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_deletion_hold_applied",
    before: existing,
    after: { reason, holdId: result.holdId },
    brandSlug: existing.brand_slug ?? undefined,
  });
  await notify(
    "product_deletion_hold_applied",
    `Deletion hold applied: ${existing.name}`,
    reason,
    { relatedEntityType: "product", relatedEntityId: params.id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code, holdId: result.holdId });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("name, brand_slug").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const result = await releaseProductDeletionHold(params.id, staff.user.id, staff.user.email ?? staff.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "HOLD_NOT_FOUND" ? 404 : 400 });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_deletion_hold_released",
    before: existing,
    brandSlug: existing.brand_slug ?? undefined,
  });
  await notify(
    "product_deletion_hold_released",
    `Deletion hold released: ${existing.name}`,
    "",
    { relatedEntityType: "product", relatedEntityId: params.id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code, holdId: result.holdId });
}
