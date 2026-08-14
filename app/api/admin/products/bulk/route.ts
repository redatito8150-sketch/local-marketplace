import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { retireProduct, deleteDraftProduct } from "@/lib/admin/productDeletion";

// "delete" was removed from this route entirely — it used to run a single
// unguarded `delete from products where id in (...)`, with no dependency
// checks and a blind `affected: ids.length` regardless of how many rows
// actually matched. Permanent deletion of a product with real history is
// never possible at all (mustRetainHistory forbids it outright); a
// history-free Retired product goes through the automatic
// schedule_product_deletion RPC (7-day grace period, no admin approval
// required — see app/admin/products/deletion-schedules/); the only bulk
// delete this route still offers is "delete_draft", which is per-product
// eligibility-checked (via the same canonical RPC the single-product route
// uses) and reports which ids actually succeeded vs. why each failure did.
const BULK_ACTIONS = ["publish", "retire", "delete_draft", "feature", "unfeature"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

const STATUS_BY_ACTION: Partial<Record<BulkAction, string>> = {
  publish: "published",
};

const FEATURED_ACTIONS = ["feature", "unfeature"] as const;

export async function POST(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-products-bulk:${staff.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const action: BulkAction = body.action;

  if (ids.length === 0) {
    return NextResponse.json({ error: "No products selected" }, { status: 400 });
  }
  if (!BULK_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: existingRows } = await supabaseAdmin
    .from("products")
    .select("id, name, status, featured, brand_slug")
    .in("id", ids);
  const existingById = new Map((existingRows ?? []).map((r) => [r.id, r]));
  const actorLabel = staff.user.email ?? staff.user.id;

  // archive / delete_draft: per-product, eligibility-checked, transaction-
  // safe RPC calls — structured {succeeded, failed} result, never a blind
  // "all N affected."
  if (action === "retire" || action === "delete_draft") {
    const succeeded: string[] = [];
    const failed: { productId: string; code: string; message: string }[] = [];

    for (const id of ids) {
      const existing = existingById.get(id);
      if (!existing) {
        failed.push({ productId: id, code: "PRODUCT_NOT_FOUND", message: "This product no longer exists." });
        continue;
      }
      const result = action === "retire"
        ? await retireProduct(id, null, staff.user.id, actorLabel)
        : await deleteDraftProduct(id, null, staff.user.id, actorLabel);

      if (!result.ok) {
        failed.push({ productId: id, code: result.code, message: result.message });
        continue;
      }
      // Storage cleanup for a deleted draft is enqueued transactionally by
      // delete_draft_product itself (private.queue_owned_product_media_cleanup)
      // — nothing to do here per product, and one product's later failure
      // in this loop can never undo an earlier product's already-committed
      // cleanup jobs, since each RPC call is its own transaction.
      succeeded.push(id);
      await logAudit({
        actorId: staff.user.id,
        actorLabel,
        entityType: "product",
        entityId: id,
        action: action === "retire" ? "bulk_archive" : "product_draft_deleted",
        before: existing,
        brandSlug: existing.brand_slug ?? undefined,
      });
    }

    if (action === "retire" && succeeded.length > 0) {
      await notify(
        "product_retired",
        `Bulk retire: ${succeeded.length} product${succeeded.length === 1 ? "" : "s"}`,
        succeeded.map((id) => existingById.get(id)?.name).filter(Boolean).join(", "),
        { actorLabel, detailLabel: "Products" }
      );
    }

    return NextResponse.json({ ok: true, succeeded, failed });
  }

  const isFeaturedAction = (FEATURED_ACTIONS as readonly string[]).includes(action);
  const failed: { productId: string; code: string; message: string }[] = [];

  let affectedRows: { id: string }[] = [];
  if (isFeaturedAction) {
    const featured = action === "feature";
    const { data, error } = await supabaseAdmin.from("products").update({ featured }).in("id", ids).select("id");
    if (error) return safeErrorResponse("admin.products.bulk.feature", error, "Failed to update products");
    affectedRows = data ?? [];
  } else {
    // Closes the restore bypass this bulk action otherwise offered: a
    // currently-archived product can't be flipped straight to "published"
    // by this raw status update — it must go through restore_product's
    // canonical revalidation (per-product, not batchable the same way).
    const targetIds = action === "publish"
      ? ids.filter((id) => {
          const isArchived = existingById.get(id)?.status === "archived";
          if (isArchived) failed.push({ productId: id, code: "RESTORE_REQUIRES_CANONICAL_RPC", message: "This product is archived — use Restore product instead of bulk publish." });
          return !isArchived;
        })
      : ids;
    const status = STATUS_BY_ACTION[action];
    const { data, error } = targetIds.length
      ? await supabaseAdmin.from("products").update({ status }).in("id", targetIds).select("id")
      : { data: [], error: null };
    if (error) return safeErrorResponse("admin.products.bulk.status", error, "Failed to update products");
    affectedRows = data ?? [];
  }

  const affectedIds = affectedRows.map((r) => r.id);
  const auditAction = action === "publish" ? "bulk_publish" : "update";
  for (const id of affectedIds) {
    const before = existingById.get(id);
    await logAudit({
      actorId: staff.user.id,
      actorLabel,
      entityType: "product",
      entityId: id,
      action: auditAction,
      before,
      after: isFeaturedAction ? { featured: action === "feature" } : { status: STATUS_BY_ACTION[action] },
    });
  }

  if (action === "publish" && affectedIds.length > 0) {
    await notify(
      "product_published",
      `Bulk publish: ${affectedIds.length} product${affectedIds.length === 1 ? "" : "s"}`,
      affectedIds.map((id) => existingById.get(id)?.name).filter(Boolean).join(", "),
      { actorLabel, detailLabel: "Products" }
    );
  }

  return NextResponse.json({ ok: true, affected: affectedIds.length, succeeded: affectedIds, failed });
}
