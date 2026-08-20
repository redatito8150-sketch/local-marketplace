import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { adminRestoreArchivedProduct } from "@/lib/admin/productDeletion";
import { getBrandMembersForAdmin } from "@/lib/data/admin";

// The ONLY sanctioned way out of Archived. admin_restore_archived_product
// (supabase/migrations/20260819120000_...sql) re-checks brand status,
// variant validity, product completeness, and any active hold inside a
// locked transaction, then lands the product on Paused — never Published —
// so restoring it is never, on its own, what makes it visible again.
//
// Deliberately admin-rank only ("admin", not "manager"): restoring a
// product a brand owner cannot touch themselves is a higher-trust action
// than the day-to-day catalog moderation "manager" already covers
// elsewhere in this file's siblings.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!checkRateLimit(`admin-product-restore:${staff.user.id}`, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const operationKey = typeof body?.operationKey === "string" ? body.operationKey.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to restore an archived product." }, { status: 400 });
  }
  if (!operationKey) {
    return NextResponse.json({ error: "A valid operation key is required." }, { status: 400 });
  }

  const { data: product } = await supabaseAdmin.from("products").select("id, name, brand_id, brand_slug").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const actorLabel = staff.user.email ?? staff.user.id;
  const result = await adminRestoreArchivedProduct(id, staff.user.id, actorLabel, reason, operationKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 409 });
  }
  if (result.code === "ALREADY_RESTORED") return NextResponse.json(result);

  await logAudit({
    actorId: staff.user.id,
    actorLabel,
    entityType: "product",
    entityId: id,
    action: "product_restored",
    before: { status: "archived" },
    after: { status: "paused", reason },
    brandSlug: product.brand_slug ?? undefined,
  });

  // The owner should know their product is back (as Paused, not live) —
  // a distinct message from the routine product_updated notification so
  // it doesn't read as something the owner themselves did.
  await notify(
    "product_restored",
    `Restored by admin: ${product.name}`,
    `${reason}\n\nThis product is back as Paused. Resume it from Brand Portal when it's ready to sell again.`,
    { actorLabel, relatedEntityType: "product", relatedEntityId: id }
  );

  if (product.brand_slug) {
    const members = await getBrandMembersForAdmin(product.brand_slug);
    await Promise.all((members?.owners ?? []).map((owner) => notifyUser(
      owner.id,
      "product_restored",
      `${product.name} was restored`,
      `Zakhnook restored this product as Paused. Reason: ${reason}. Resume it from Brand Portal when it is ready to sell again.`,
      {
        relatedEntityType: "product",
        relatedEntityId: id,
        deliveryKey: `product-restored:${id}:${operationKey}:${owner.id}`,
      }
    )));
  }

  return NextResponse.json(result);
}
