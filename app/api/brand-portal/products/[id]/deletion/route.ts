import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit, type AuditAction } from "@/lib/auditLog";
import { notify, type NotificationType } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPartnerStockWarning } from "@/lib/admin/warehouseArchiveWarning";
import {
  getProductDeletionEligibility,
  getDeletionRequestForProduct,
  archiveProduct,
  restoreProduct,
  deleteDraftProduct,
  requestProductDeletion,
  cancelProductDeletionRequest,
  type DeletionRpcResult,
} from "@/lib/admin/productDeletion";

// The brand-portal-facing half of the product deletion lifecycle. Deliberately
// its own route (not an overload of the base products/[id] resource's
// GET/PATCH/DELETE) so no HTTP verb is ever asked to mean two different
// things — the old `DELETE /api/brand-portal/products/[id]` only ever
// archived the product while the UI called it "Request deletion" and
// promised a staff review that never happened; this route makes every
// action explicit and honest about what it actually does:
//   - archive: remove from the storefront immediately, fully reversible
//   - restore: bring an archived product back, revalidated
//   - delete_draft: permanently delete a genuinely pristine, never-touched
//     draft — irreversible, allowed without admin approval
//   - request: ask Zakhnook staff to permanently delete an archived
//     product that has real history and can't be self-served
//   - cancel: withdraw an open deletion request
// Every branch calls the same canonical, transaction-safe RPCs the admin
// side uses (lib/admin/productDeletion.ts) — eligibility is always
// recomputed by the database inside the same transaction as the mutation,
// never trusted from an earlier client-side read.

async function loadOwnedProduct(id: string, brandId: string) {
  const { data } = await supabaseAdmin.from("products").select("*").eq("id", id).eq("brand_id", brandId).maybeSingle();
  return data;
}

function statusForCode(code: string): number {
  switch (code) {
    case "PRODUCT_NOT_OWNED":
    case "NOT_AUTHORIZED":
      return 403;
    case "PRODUCT_NOT_FOUND":
    case "DELETION_REQUEST_NOT_FOUND":
      return 404;
    case "DELETION_REQUEST_ALREADY_OPEN":
    case "DELETION_REQUEST_STATE_CONFLICT":
    case "DELETION_ELIGIBILITY_CHANGED":
    case "PRODUCT_MUST_BE_RETAINED":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "PRODUCT_NOT_DRAFT":
      return 422;
    default:
      return 400;
  }
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const existing = await loadOwnedProduct(params.id, owner.brandId);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const [eligibility, activeRequest] = await Promise.all([
    getProductDeletionEligibility(params.id),
    getDeletionRequestForProduct(params.id),
  ]);

  return NextResponse.json({ eligibility, activeRequest });
}

type Action = "archive" | "restore" | "delete_draft" | "request" | "cancel";

const AUDIT_ACTION_BY_TYPE: Record<Action, AuditAction> = {
  archive: "archive",
  restore: "product_restored",
  delete_draft: "product_draft_deleted",
  request: "product_deletion_requested",
  cancel: "product_deletion_request_cancelled",
};

const NOTIFY_TYPE_BY_ACTION: Record<Action, NotificationType> = {
  archive: "product_archived",
  restore: "product_restored",
  delete_draft: "product_draft_deleted",
  request: "product_deletion_requested",
  cancel: "product_deletion_request_cancelled",
};

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-portal-product-deletion:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnedProduct(params.id, owner.brandId);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action: Action = body.action;
  if (!["archive", "restore", "delete_draft", "request", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const actorId = owner.user.id;
  const actorLabel = owner.user.email ?? owner.user.id;

  let result: DeletionRpcResult;
  if (action === "archive") {
    result = await archiveProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "restore") {
    result = await restoreProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "delete_draft") {
    result = await deleteDraftProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "request") {
    const reason = typeof body.reason === "string" ? body.reason : "";
    const operationKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
    result = await requestProductDeletion(params.id, owner.brandId, actorId, actorLabel, reason, operationKey);
  } else {
    result = await cancelProductDeletionRequest(params.id, owner.brandId, actorId, actorLabel);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers }, { status: statusForCode(result.code) });
  }

  // Storage cleanup for a deleted draft is enqueued by delete_draft_product
  // itself, inside the same database transaction as the delete (see
  // private.queue_owned_product_media_cleanup in supabase/migrations/
  // 20260814020000_product_deletion_lifecycle.sql) — never a separate
  // step here that could fail after the product is already gone.
  // result.mediaUrls/mediaJobsQueued are informational only.

  const auditLogId = await logAudit({
    actorId,
    actorLabel,
    entityType: "product",
    entityId: params.id,
    action: AUDIT_ACTION_BY_TYPE[action],
    before: existing,
    after: { code: result.code, requestId: result.requestId, requestState: result.requestState },
    brandSlug: owner.brandSlug ?? undefined,
  });

  const stockWarning = action === "archive" ? await getPartnerStockWarning(params.id, owner.brandId) : null;
  await notify(
    NOTIFY_TYPE_BY_ACTION[action],
    `${result.message}: ${existing.name}`,
    stockWarning ?? "",
    {
      relatedEntityType: "product",
      relatedEntityId: params.id,
      auditLogId,
      actorLabel,
    }
  );

  return NextResponse.json({
    ok: true,
    code: result.code,
    message: result.message,
    lifecycle: result.lifecycle,
    requestId: result.requestId,
    requestState: result.requestState,
    warning: stockWarning ?? undefined,
  });
}
