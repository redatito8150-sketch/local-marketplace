import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

const BULK_ACTIONS = ["publish", "archive", "delete"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

const STATUS_BY_ACTION: Record<Exclude<BulkAction, "delete">, string> = {
  publish: "published",
  archive: "archived",
};

export async function POST(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
    .select("id, name, status")
    .in("id", ids);
  const existingById = new Map((existingRows ?? []).map((r) => [r.id, r]));

  if (action === "delete") {
    const { error } = await supabaseAdmin.from("products").delete().in("id", ids);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete products: ${error.message}` },
        { status: 500 }
      );
    }
  } else {
    const status = STATUS_BY_ACTION[action];
    const { error } = await supabaseAdmin.from("products").update({ status }).in("id", ids);
    if (error) {
      return NextResponse.json(
        { error: `Failed to update products: ${error.message}` },
        { status: 500 }
      );
    }
  }

  const auditAction = action === "delete" ? "bulk_delete" : action === "publish" ? "bulk_publish" : "bulk_archive";
  for (const id of ids) {
    const before = existingById.get(id);
    await logAudit({
      actorId: staff.user.id,
      actorLabel: staff.user.email ?? staff.user.id,
      entityType: "product",
      entityId: id,
      action: auditAction,
      before,
      after: action === "delete" ? undefined : { status: STATUS_BY_ACTION[action] },
    });
  }

  // Matches the single-product routes' convention: publish/archive notify,
  // delete does not (the existing single-item DELETE route never notifies
  // either — only logs the audit entry above).
  if (action !== "delete") {
    await notify(
      action === "publish" ? "product_published" : "product_archived",
      `Bulk ${action}: ${ids.length} product${ids.length === 1 ? "" : "s"}`,
      (existingRows ?? []).map((r) => r.name).join(", "),
      { actorLabel: staff.user.email ?? staff.user.id, detailLabel: "Products" }
    );
  }

  return NextResponse.json({ ok: true, affected: ids.length });
}
