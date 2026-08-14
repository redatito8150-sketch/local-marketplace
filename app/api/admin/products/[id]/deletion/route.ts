import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  deleteArchivedProduct,
  deleteDraftProduct,
  getProductDeletionEligibility,
} from "@/lib/admin/productDeletion";

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
  if (action !== "delete_draft" && action !== "delete_archived") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const { data: product } = await supabaseAdmin.from("products").select("name").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (body?.confirmationName !== product.name) {
    return NextResponse.json({ error: "Type the exact product name to confirm permanent deletion" }, { status: 400 });
  }
  const actorLabel = staff.user.email ?? staff.user.id;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const operationKey = typeof body?.operationKey === "string" ? body.operationKey.trim() : "";
  const result = action === "delete_draft"
    ? await deleteDraftProduct(id, null, staff.user.id, actorLabel, reason, operationKey)
    : await deleteArchivedProduct(id, null, staff.user.id, actorLabel, reason, operationKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers ?? [] }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 409 });
  }
  await logAudit({
    actorId: staff.user.id,
    actorLabel,
    entityType: "product",
    entityId: id,
    action: action === "delete_draft" ? "product_draft_deleted" : "product_deleted",
    after: { lifecycle: "deleted", reason: reason || undefined },
  });
  return NextResponse.json(result);
}
