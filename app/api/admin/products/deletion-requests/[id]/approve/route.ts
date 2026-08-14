import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notifyUser, notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminApproveProductDeletion } from "@/lib/admin/productDeletion";
import { extractOwnedStorageTargets } from "@/lib/admin/productMediaStorage";
import { queueStorageCleanupTargets } from "@/lib/account/storageCleanup";

// The one and only endpoint that can permanently delete a product. Gated
// at the "admin" rank (not just "manager"), matching this codebase's
// existing convention of reserving irreversible/high-blast-radius actions
// for the top staff rank (see CLAUDE.md's PATCH /api/admin/users/[id]
// note). admin_approve_product_deletion always recomputes eligibility
// inside the same transaction — new activity since the request was filed
// (a new order, a warehouse receipt, a review) blocks the deletion even
// if the original snapshot looked clean, and the request falls back to
// "blocked" instead of silently succeeding.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-deletion-request-approve:${staff.user.id}`, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { data: before } = await supabaseAdmin.from("product_deletion_requests").select("*").eq("id", params.id).maybeSingle();
  if (!before) {
    return NextResponse.json({ error: "Deletion request not found" }, { status: 404 });
  }
  const { data: product } = await supabaseAdmin.from("products").select("name, brand_slug").eq("id", before.product_id).maybeSingle();

  const result = await adminApproveProductDeletion(params.id, staff.user.id, staff.user.email ?? staff.user.id);

  if (!result.ok) {
    // PRODUCT_MUST_BE_RETAINED: recomputed blockers found new activity —
    // the request was automatically moved to "blocked" by the RPC itself,
    // not deleted, not silently reported as success.
    const auditLogId = await logAudit({
      actorId: staff.user.id,
      actorLabel: staff.user.email ?? staff.user.id,
      entityType: "product",
      entityId: before.product_id,
      action: "product_deletion_blocked",
      before,
      after: { code: result.code, blockers: result.blockers },
      brandSlug: product?.brand_slug ?? undefined,
    });
    await notify(
      "product_deletion_requested",
      `Deletion blocked by new activity: ${product?.name ?? before.product_name}`,
      result.message,
      { relatedEntityType: "product", relatedEntityId: before.product_id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
    );
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers }, { status: 409 });
  }

  if (result.mediaUrls?.length && before.product_id) {
    const targets = extractOwnedStorageTargets(before.product_id, result.mediaUrls);
    if (targets.length) await queueStorageCleanupTargets(staff.user.id, targets);
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: before.product_id ?? before.id,
    action: "product_permanently_deleted",
    before: result.before ?? before,
  });

  if (before.requested_by) {
    await notifyUser(
      before.requested_by,
      "product_deletion_approved",
      "Deletion approved",
      `${product?.name ?? before.product_name} has been permanently deleted.`,
      { relatedEntityType: "product", relatedEntityId: before.product_id }
    );
  }
  await notify(
    "product_permanently_deleted",
    `Product permanently deleted: ${product?.name ?? before.product_name}`,
    "",
    { relatedEntityType: "product", relatedEntityId: before.product_id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code, requestState: result.requestState });
}
