import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { checkRateLimit } from "@/lib/rateLimit";
import { pauseProduct, resumeProduct } from "@/lib/admin/productDeletion";
import { stampFirstVisibleIfEligible } from "@/lib/admin/productLaunch";
import { notifyBrandOwnersOfProductLifecycle } from "@/lib/admin/productLifecycleNotifications";

// Pause/Resume now go through the canonical, row-locked pause_product/
// resume_product RPCs — status = 'paused' is the real database status, not
// a secondary paused_by_brand flag on a still-'published' row. Resume
// revalidates brand status, variants, completeness, and open holds inside
// the same locked transaction, and never re-stamps first_visible_at.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!checkRateLimit(`admin-product-pause:${staff.user.id}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const paused = Boolean(body?.paused);
  const { data: product } = await supabaseAdmin.from("products").select("id, name, status, brand_slug").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const actorLabel = staff.user.email ?? staff.user.id;
  const result = paused
    ? await pauseProduct(id, null, staff.user.id)
    : await resumeProduct(id, null, staff.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: 409 });
  }
  if (result.code === "ALREADY_PAUSED" || result.code === "ALREADY_PUBLISHED") {
    return NextResponse.json({ ok: true, paused, lifecycle: result.lifecycle });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel,
    entityType: "product",
    entityId: id,
    action: paused ? "pause" : "unpause",
    before: { status: product.status },
    after: { status: result.lifecycle },
    brandSlug: product.brand_slug ?? undefined,
  });
  await notifyBrandOwnersOfProductLifecycle({
    brandSlug: product.brand_slug,
    productId: id,
    type: "product_updated",
    title: `${product.name} was ${paused ? "paused" : "resumed"}`,
    body: paused
      ? "Zakhnook paused this product. It is hidden from customers until it is resumed."
      : "Zakhnook resumed this product. Its launch policy, schedule, and stock still determine whether customers can see it.",
    deliveryToken: auditLogId ?? `${paused ? "paused" : "resumed"}:${Date.now()}`,
  });
  // Idempotent — only ever stamps a still-null first_visible_at. Resuming
  // a product that had never actually become customer-visible yet (e.g.
  // paused before its first stock arrived) can legitimately stamp it now;
  // an already-set first_visible_at is left untouched, which is what
  // keeps Resume from re-qualifying a product as a New Arrival.
  if (!paused) await stampFirstVisibleIfEligible(id);
  return NextResponse.json({ ok: true, paused, lifecycle: result.lifecycle });
}
