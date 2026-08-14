import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit, type AuditAction } from "@/lib/auditLog";
import { notifyUser, notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { getProductDeletionEligibility, adminUpdateDeletionRequest } from "@/lib/admin/productDeletion";

// Full detail for one deletion request: the product's current state, its
// currently-recomputed blockers (never the stale snapshot alone), the
// snapshot taken at request time for comparison, and links to the
// relevant orders/stock/warehouse docs/returns/reviews driving each
// blocker (surfaced via each blocker's own message/category — the
// blockers array itself carries everything the admin UI needs to render
// "why," per supabase/migrations/20260814020000_product_deletion_lifecycle.sql).
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: requestRow, error } = await supabaseAdmin
    .from("product_deletion_requests")
    .select("*, brands(name, slug, is_mahaly_partner)")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !requestRow) {
    return NextResponse.json({ error: "Deletion request not found" }, { status: 404 });
  }

  // Recomputed with this request's own id excluded — otherwise a still-
  // open request would always show DELETION_REQUEST_ALREADY_OPEN against
  // itself, which is confusing/wrong on that very request's own detail
  // page (see the SQL function's corrective-pass comment).
  const currentEligibility = requestRow.product_id
    ? await getProductDeletionEligibility(requestRow.product_id, requestRow.id)
    : null;

  return NextResponse.json({
    request: {
      id: requestRow.id,
      productId: requestRow.product_id,
      productName: requestRow.product_name,
      productSku: requestRow.product_sku,
      productImage: requestRow.product_image,
      brandId: requestRow.brand_id,
      requestedByLabel: requestRow.requested_by_label,
      requestedAt: requestRow.requested_at,
      reason: requestRow.reason,
      status: requestRow.status,
      reviewedAt: requestRow.reviewed_at,
      adminNote: requestRow.admin_note,
      completedAt: requestRow.completed_at,
      cancelledAt: requestRow.cancelled_at,
      blockerSnapshot: requestRow.blocker_snapshot ?? [],
      brand: requestRow.brands,
    },
    currentEligibility,
    // The product row itself is gone once a request is 'completed' — the
    // request row's own product_name/sku/image snapshot (above) is the
    // only thing left to display at that point, which is exactly why
    // those columns exist.
    productDeleted: requestRow.status === "completed" && !requestRow.product_id,
  });
}

const AUDIT_ACTION_BY_STATUS: Record<"under_review" | "blocked" | "rejected", AuditAction> = {
  under_review: "product_deletion_under_review",
  blocked: "product_deletion_blocked",
  rejected: "product_deletion_rejected",
};

// Moves a request to under_review / blocked / rejected. Approval (the
// only status that actually deletes anything) is its own endpoint —
// deletion-requests/[id]/approve — kept separate so this handler can
// never accidentally delete a product.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-deletion-request-update:${staff.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const newStatus = body.status;
  if (!["under_review", "blocked", "rejected"].includes(newStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : "";
  if (newStatus === "rejected" && !adminNote.trim()) {
    return NextResponse.json({ error: "A reason is required to reject a deletion request." }, { status: 400 });
  }

  const { data: before } = await supabaseAdmin.from("product_deletion_requests").select("*").eq("id", params.id).maybeSingle();
  if (!before) {
    return NextResponse.json({ error: "Deletion request not found" }, { status: 404 });
  }

  const result = await adminUpdateDeletionRequest(params.id, staff.user.id, staff.user.email ?? staff.user.id, newStatus, adminNote);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "DELETION_REQUEST_NOT_FOUND" ? 404 : 409 });
  }

  const productId: string | null = before.product_id;
  const { data: product } = productId
    ? await supabaseAdmin.from("products").select("name, brand_slug").eq("id", productId).maybeSingle()
    : { data: null };

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: productId ?? before.id,
    action: AUDIT_ACTION_BY_STATUS[newStatus as "under_review" | "blocked" | "rejected"],
    before,
    after: { status: newStatus, adminNote },
    brandSlug: product?.brand_slug ?? undefined,
  });

  // Let the requesting brand user know the decision without exposing
  // internal blocker detail they can't act on beyond what's already shown
  // in their own Brand Portal deletion-request view.
  if (before.requested_by) {
    await notifyUser(
      before.requested_by,
      newStatus === "rejected" ? "product_deletion_rejected" : "product_deletion_updated",
      newStatus === "rejected" ? "Deletion request rejected" : "Deletion request update",
      adminNote || `Your deletion request for ${product?.name ?? before.product_name} is now ${newStatus.replace("_", " ")}.`,
      { relatedEntityType: "product", relatedEntityId: productId ?? undefined }
    );
  }
  if (newStatus === "rejected") {
    await notify(
      "product_deletion_rejected",
      `Deletion request rejected: ${product?.name ?? before.product_name}`,
      adminNote,
      { relatedEntityType: "product", relatedEntityId: productId ?? undefined, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
    );
  }

  return NextResponse.json({ ok: true, code: result.code, requestState: result.requestState });
}
