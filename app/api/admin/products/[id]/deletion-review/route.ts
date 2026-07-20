import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";

// A brand's DELETE request only ever sets deletion_requested_at (see
// app/api/brand-portal/products/[id]/route.ts) — the row is never actually
// removed until an admin approves it here. product_variants cascades on
// delete, so approving needs no separate variant cleanup.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const approve = Boolean(body.approve);

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (!existing.deletion_requested_at) {
    return NextResponse.json({ error: "No deletion request pending" }, { status: 400 });
  }

  const actorLabel = admin.email ?? admin.id;
  const brandSlug = existing.brand_slug ?? undefined;

  if (approve) {
    const { error } = await supabaseAdmin.from("products").delete().eq("id", params.id);
    if (error) {
      return NextResponse.json(
        { error: `Failed to delete product: ${error.message}` },
        { status: 500 }
      );
    }

    await logAudit({
      actorId: admin.id,
      actorLabel,
      entityType: "product",
      entityId: params.id,
      action: "delete",
      before: existing,
      brandSlug,
    });
    await notify("product_archived", `Deletion approved: ${existing.name}`, existing.brand_name);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from("products")
    .update({ deletion_requested_at: null })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel,
    entityType: "product",
    entityId: params.id,
    action: "reject_deletion",
    before: existing,
    brandSlug,
  });
  await notify("product_updated", `Deletion request rejected: ${existing.name}`, existing.brand_name);
  return NextResponse.json({ ok: true });
}
