import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { scheduleProductDeletion, cancelProductDeletionSchedule } from "@/lib/admin/productDeletion";

// Admin's own ability to schedule/cancel a permanent deletion — the exact
// same canonical, eligibility-checked, transaction-safe RPC the Brand
// Portal uses (schedule_product_deletion always either succeeds outright
// or fails outright with the current blockers; there is no "pending
// review" state to sit in). Admin never bypasses immutable-history
// retention or an active legal/admin hold — those are enforced inside the
// RPC itself, not just here.
function statusForCode(code: string): number {
  switch (code) {
    case "PRODUCT_NOT_FOUND":
    case "DELETION_SCHEDULE_NOT_FOUND":
      return 404;
    case "DELETION_ALREADY_SCHEDULED":
    case "PRODUCT_MUST_BE_RETAINED":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "PRODUCT_NOT_RETIRED":
    case "PRODUCT_DELETION_BLOCKED":
      return 422;
    default:
      return 400;
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-product-schedule-delete:${staff.user.id}`, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("*").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason : "";
  const operationKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();

  const result = await scheduleProductDeletion(params.id, null, staff.user.id, staff.user.email ?? staff.user.id, reason, operationKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers }, { status: statusForCode(result.code) });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_deletion_scheduled",
    before: existing,
    after: { scheduleId: result.scheduleId, dueAt: result.dueAt },
    brandSlug: existing.brand_slug ?? undefined,
  });
  await notify(
    "product_deletion_scheduled",
    `Deletion scheduled by admin: ${existing.name}`,
    result.dueAt ? `Scheduled for ${new Date(result.dueAt).toDateString()}.` : "",
    { relatedEntityType: "product", relatedEntityId: params.id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code, scheduleId: result.scheduleId, dueAt: result.dueAt });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("*").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const result = await cancelProductDeletionSchedule(params.id, null, staff.user.id, staff.user.email ?? staff.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: statusForCode(result.code) });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_deletion_schedule_cancelled",
    before: existing,
    brandSlug: existing.brand_slug ?? undefined,
  });
  await notify(
    "product_deletion_schedule_cancelled",
    `Deletion schedule cancelled by admin: ${existing.name}`,
    "",
    { relatedEntityType: "product", relatedEntityId: params.id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code });
}
