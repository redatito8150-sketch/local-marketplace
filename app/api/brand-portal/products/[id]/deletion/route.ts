import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit, type AuditAction } from "@/lib/auditLog";
import { notify, type NotificationType } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPartnerStockWarning } from "@/lib/admin/warehouseArchiveWarning";
import {
  getProductDeletionEligibility,
  getActiveDeletionScheduleForProduct,
  retireProduct,
  restoreProduct,
  deleteDraftProduct,
  scheduleProductDeletion,
  cancelProductDeletionSchedule,
  type DeletionRpcResult,
} from "@/lib/admin/productDeletion";

// The brand-portal-facing half of the product lifecycle. Deliberately its
// own route (not an overload of the base products/[id] resource's
// GET/PATCH) so no HTTP verb is ever asked to mean two different things.
// Ordinary permanent deletion no longer waits on admin approval:
//   - retire: remove from the storefront immediately, fully reversible
//   - restore: bring a retired product back to Draft, revalidated
//   - delete_draft: permanently delete a genuinely pristine, never-touched
//     draft — irreversible, immediate, no grace period needed
//   - schedule_delete: schedule a retired, history-free product for
//     automatic permanent deletion in 7 days — either succeeds outright
//     (the database is fully eligible right now) or fails outright with
//     the current blockers; there is no "pending review" in between
//   - cancel_schedule: withdraw an active deletion schedule
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
    case "DELETION_SCHEDULE_NOT_FOUND":
      return 404;
    case "DELETION_SCHEDULE_ALREADY_ACTIVE":
    case "DELETION_ALREADY_SCHEDULED":
    case "RETIRE_STATE_CONFLICT":
    case "DELETION_ELIGIBILITY_CHANGED":
    case "PRODUCT_MUST_BE_RETAINED":
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "PRODUCT_NOT_DRAFT":
    case "PRODUCT_NOT_RETIRED":
    case "PRODUCT_DELETION_BLOCKED":
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

  const [eligibility, activeSchedule] = await Promise.all([
    getProductDeletionEligibility(params.id),
    getActiveDeletionScheduleForProduct(params.id),
  ]);

  return NextResponse.json({ eligibility, activeSchedule });
}

type Action = "retire" | "restore" | "delete_draft" | "schedule_delete" | "cancel_schedule";

const AUDIT_ACTION_BY_TYPE: Record<Action, AuditAction> = {
  retire: "product_retired",
  restore: "product_restored",
  delete_draft: "product_draft_deleted",
  schedule_delete: "product_deletion_scheduled",
  cancel_schedule: "product_deletion_schedule_cancelled",
};

const NOTIFY_TYPE_BY_ACTION: Record<Action, NotificationType> = {
  retire: "product_retired",
  restore: "product_restored",
  delete_draft: "product_draft_deleted",
  schedule_delete: "product_deletion_scheduled",
  cancel_schedule: "product_deletion_schedule_cancelled",
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
  if (!["retire", "restore", "delete_draft", "schedule_delete", "cancel_schedule"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Brand assistants may pause/retire per existing role rules, but must
  // never permanently delete a draft or schedule/cancel a permanent
  // deletion — only the brand owner may. `accessLevel` is already
  // resolved by requireActiveBrandOwner() from the brand_staff role table.
  if (["delete_draft", "schedule_delete", "cancel_schedule"].includes(action) && owner.accessLevel !== "owner") {
    return NextResponse.json({ error: "Only the brand owner can permanently delete or schedule/cancel deletion of a product." }, { status: 403 });
  }

  const actorId = owner.user.id;
  const actorLabel = owner.user.email ?? owner.user.id;

  let result: DeletionRpcResult;
  if (action === "retire") {
    result = await retireProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "restore") {
    result = await restoreProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "delete_draft") {
    result = await deleteDraftProduct(params.id, owner.brandId, actorId, actorLabel);
  } else if (action === "schedule_delete") {
    const reason = typeof body.reason === "string" ? body.reason : "";
    const operationKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
    result = await scheduleProductDeletion(params.id, owner.brandId, actorId, actorLabel, reason, operationKey);
  } else {
    result = await cancelProductDeletionSchedule(params.id, owner.brandId, actorId, actorLabel);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers }, { status: statusForCode(result.code) });
  }

  // Storage cleanup for a deleted draft is enqueued by delete_draft_product
  // itself, inside the same database transaction as the delete (see
  // private.queue_owned_product_media_cleanup in supabase/migrations/
  // 20260814020000_product_deletion_lifecycle.sql) — never a separate step
  // here that could fail after the product is already gone. Automatic
  // scheduled deletion runs entirely inside the cron executor, never here.

  const auditLogId = await logAudit({
    actorId,
    actorLabel,
    entityType: "product",
    entityId: params.id,
    action: AUDIT_ACTION_BY_TYPE[action],
    before: existing,
    after: { code: result.code, scheduleId: result.scheduleId, scheduleState: result.scheduleState, dueAt: result.dueAt },
    brandSlug: owner.brandSlug ?? undefined,
  });

  // Never send a "deleted successfully" notification for an action that
  // didn't actually delete anything — delete_draft only reaches this
  // point once the database transaction already committed the delete,
  // and schedule_delete only ever confirms a schedule was created, never
  // implies the product is gone yet.
  const stockWarning = action === "retire" ? await getPartnerStockWarning(params.id, owner.brandId) : null;
  const dueNote = action === "schedule_delete" && result.dueAt ? `Scheduled for ${new Date(result.dueAt).toDateString()}.` : "";
  await notify(
    NOTIFY_TYPE_BY_ACTION[action],
    `${result.message}: ${existing.name}`,
    [stockWarning, dueNote].filter(Boolean).join("\n\n"),
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
    scheduleId: result.scheduleId,
    scheduleState: result.scheduleState,
    dueAt: result.dueAt,
    warning: stockWarning ?? undefined,
  });
}
