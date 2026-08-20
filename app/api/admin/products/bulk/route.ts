import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

// Lifecycle transitions are intentionally absent. Publish needs the full
// product/Variant readiness validation, while permanent deletion and its
// Archive fallback need a fresh, per-product eligibility check and explicit
// confirmation. Bulk actions stay limited to reversible merchandising
// changes that cannot bypass lifecycle policy.
const BULK_ACTIONS = ["feature", "unfeature"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

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

  const featured = action === "feature";
  const { data: affectedRows, error } = await supabaseAdmin
    .from("products")
    .update({ featured })
    .in("id", ids)
    .select("id");
  if (error) return safeErrorResponse("admin.products.bulk.feature", error, "Failed to update products");

  const affectedIds = (affectedRows ?? []).map((r) => r.id);
  for (const id of affectedIds) {
    const before = existingById.get(id);
    await logAudit({
      actorId: staff.user.id,
      actorLabel,
      entityType: "product",
      entityId: id,
      action: "update",
      before,
      after: { featured },
    });
  }

  if (affectedIds.length > 0) await notify(
    "product_updated",
    `${featured ? "Featured" : "Removed from Featured"}: ${affectedIds.length} product${affectedIds.length === 1 ? "" : "s"}`,
    affectedIds.map((id) => existingById.get(id)?.name).filter(Boolean).join(", "),
    { actorLabel, detailLabel: "Products" }
  );

  return NextResponse.json({ ok: true, affected: affectedIds.length, succeeded: affectedIds, failed: [] });
}
