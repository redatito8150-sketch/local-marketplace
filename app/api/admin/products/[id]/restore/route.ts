import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { restoreProduct } from "@/lib/admin/productDeletion";

// Admin's dedicated restore action — the admin product list previously had
// no restore control of its own and relied on the full edit form, which
// (before this pass) also doubled as a restore bypass. Always routes
// through the canonical restore_product RPC: brings an archived product
// back to Draft (never straight to Published — see restore_product's own
// comment for why), blocked while a deletion schedule is active.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-product-restore:${staff.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("*").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const result = await restoreProduct(params.id, null, staff.user.id, staff.user.email ?? staff.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 409 });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_restored",
    before: existing,
    brandSlug: existing.brand_slug ?? undefined,
  });

  await notify(
    "product_restored",
    `Product restored to Draft: ${existing.name}`,
    "Publish it from the editor when ready.",
    { relatedEntityType: "product", relatedEntityId: params.id, auditLogId, actorLabel: staff.user.email ?? staff.user.id }
  );

  return NextResponse.json({ ok: true, code: result.code, message: result.message, lifecycle: result.lifecycle });
}
