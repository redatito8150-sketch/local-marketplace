import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { stampFirstVisibleIfEligible } from "@/lib/admin/productLaunch";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const paused = Boolean(body?.paused);
  const { data: product } = await supabaseAdmin.from("products").select("id, name, status, paused_by_brand").eq("id", id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.status !== "published") return NextResponse.json({ error: "Only a Published product can be paused or resumed" }, { status: 409 });
  const { error } = await supabaseAdmin.from("products").update({ paused_by_brand: paused }).eq("id", id).eq("status", "published");
  if (error) return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  await logAudit({ actorId: staff.user.id, actorLabel: staff.user.email ?? staff.user.id, entityType: "product", entityId: id, action: paused ? "pause" : "unpause", before: { pausedByBrand: product.paused_by_brand }, after: { pausedByBrand: paused } });
  // Resume returns to the visibility determined by launch policy + current
  // stock, never auto-visible just because it was resumed — this is a
  // no-op unless the product is genuinely eligible right now.
  if (!paused) await stampFirstVisibleIfEligible(id);
  return NextResponse.json({ ok: true, paused });
}
