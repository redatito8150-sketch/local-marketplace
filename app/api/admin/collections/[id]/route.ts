import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { collectionReferences } from "@/lib/admin/reusableDataLifecycle";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const { data: collection } = await supabaseAdmin.from("collections").select("*").eq("id", id).maybeSingle();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (body.brandId && body.brandId !== collection.brand_id) return NextResponse.json({ error: "Collection ownership mismatch" }, { status: 403 });
  const references = await collectionReferences(id);
  if (body.action === "delete") {
    if (references.productCount) return NextResponse.json({ error: `This Collection contains ${references.productCount} products. Remove assignments or archive it.`, references }, { status: 409 });
    const { error } = await supabaseAdmin.from("collections").delete().eq("id", id);
    if (error) return safeErrorResponse("admin.collections.delete", error);
    await logAudit({ actorId: admin.id, actorLabel: admin.email ?? admin.id, entityType: "collection", entityId: id, action: "delete", before: collection });
    return NextResponse.json({ deleted: true });
  }
  const patch: Record<string, unknown> = {};
  if (body.action === "archive") Object.assign(patch, { is_active: false, archived_at: new Date().toISOString() });
  else if (body.action === "restore") Object.assign(patch, { is_active: true, archived_at: null });
  else if (body.action === "rename" && typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  else return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  const { error } = await supabaseAdmin.from("collections").update(patch).eq("id", id);
  if (error) return safeErrorResponse("admin.collections.update", error);
  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "collection",
    entityId: id,
    action: body.action === "archive" ? "archive" : body.action === "restore" ? "restore" : "update",
    before: collection,
    after: patch,
  });
  return NextResponse.json({ updated: true });
}
