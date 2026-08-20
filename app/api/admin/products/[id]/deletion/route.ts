import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  archiveProduct,
  deleteArchivedProduct,
  deleteDraftProduct,
  deleteLiveProduct,
  getProductDeletionEligibility,
} from "@/lib/admin/productDeletion";
import { notifyBrandOwnersOfProductLifecycle } from "@/lib/admin/productLifecycleNotifications";

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await props.params;
  return NextResponse.json({ eligibility: await getProductDeletionEligibility(id) });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!checkRateLimit(`admin-product-delete:${staff.user.id}`, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!["delete_draft", "delete_archived", "delete_live", "archive"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const { data: product } = await supabaseAdmin.from("products").select("name, brand_slug").eq("id", id).maybeSingle();
  // Archive is the fallback for immutable history — no typed-name
  // confirmation, but the RPC itself now refuses unless mustRetainHistory
  // is true, so this can never be used as an ordinary hide action.
  if (product && action !== "archive" && body?.confirmationName !== product.name) {
    return NextResponse.json({ error: "Type the exact product name to confirm permanent deletion" }, { status: 400 });
  }
  if (!product && action === "archive") return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const actorLabel = staff.user.email ?? staff.user.id;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const operationKey = typeof body?.operationKey === "string" ? body.operationKey.trim() : "";

  const result =
    action === "archive"
      ? await archiveProduct(id, null, staff.user.id, actorLabel)
      : action === "delete_draft"
        ? await deleteDraftProduct(id, null, staff.user.id, actorLabel, reason, operationKey)
        : action === "delete_live"
          ? await deleteLiveProduct(id, null, staff.user.id, actorLabel, reason, operationKey)
          : await deleteArchivedProduct(id, null, staff.user.id, actorLabel, reason, operationKey);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code, blockers: result.blockers ?? [] },
      { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : result.code === "PRODUCT_NOT_OWNED" ? 403 : 409 }
    );
  }
  // Database idempotency is the source of truth. A retry after permanent
  // deletion has no product row to load, but the durable history can still
  // replay success. Never duplicate audit or notification side effects.
  if (result.code === "ALREADY_DELETED" || result.code === "ALREADY_ARCHIVED") {
    return NextResponse.json(result);
  }
  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel,
    entityType: "product",
    entityId: id,
    action: action === "archive" ? "archive" : action === "delete_draft" ? "product_draft_deleted" : "product_deleted",
    before: product ?? undefined,
    after: { lifecycle: result.lifecycle, reason: reason || undefined },
    brandSlug: product?.brand_slug ?? undefined,
  });
  await notify(
    action === "archive" ? "product_archived" : "product_deleted",
    `${action === "archive" ? "Archived" : "Permanently deleted"}: ${product?.name ?? id}`,
    reason || "",
    { actorLabel }
  );
  await notifyBrandOwnersOfProductLifecycle({
    brandSlug: product?.brand_slug,
    productId: id,
    type: action === "archive" ? "product_archived" : "product_deleted",
    title: action === "archive"
      ? `${product?.name ?? id} was moved to Archived`
      : `${product?.name ?? id} was permanently deleted`,
    body: action === "archive"
      ? "Zakhnook preserved this product because it has permanent business history. Contact an admin if it needs to be restored to Paused."
      : "Zakhnook permanently deleted this product after the final database check found no history or active blockers.",
    deliveryToken: auditLogId ?? `${result.code}:${Date.now()}`,
  });
  return NextResponse.json(result);
}
