import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeOptionKey } from "@/lib/inventory/optionKey";
import { optionTypeReferences } from "@/lib/admin/reusableDataLifecycle";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params; const body = await request.json();
  const { data: type } = await supabaseAdmin.from("option_types").select("*").eq("id", id).maybeSingle();
  if (!type) return NextResponse.json({ error: "Option type not found" }, { status: 404 });
  if (type.is_system || !type.brand_id || (body.brandId && body.brandId !== type.brand_id)) return NextResponse.json({ error: "Global option types cannot be managed" }, { status: 403 });
  const actorLabel = admin.email ?? admin.id;
  if (body.action === "delete") {
    const references = await optionTypeReferences(id);
    if (references.selectedCount) return NextResponse.json({ error: "This option type is referenced and can only be archived.", references }, { status: 409 });
    const { error } = await supabaseAdmin.from("option_types").delete().eq("id", id);
    if (error) return safeErrorResponse("admin.product-options.types.delete", error);
    await logAudit({ actorId: admin.id, actorLabel, entityType: "option_type", entityId: id, action: "delete", before: type });
    return NextResponse.json({ deleted: true });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action === "archive") Object.assign(patch, { is_archived: true, archived_at: new Date().toISOString() });
  else if (body.action === "restore") Object.assign(patch, { is_archived: false, archived_at: null });
  else if (body.action === "rename" && body.name?.trim()) Object.assign(patch, { name: body.name.trim(), key: normalizeOptionKey(body.name) });
  else return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  const { error } = await supabaseAdmin.from("option_types").update(patch).eq("id", id);
  if (error) return safeErrorResponse("admin.product-options.types.update", error);
  await logAudit({
    actorId: admin.id,
    actorLabel,
    entityType: "option_type",
    entityId: id,
    action: body.action === "archive" ? "archive" : body.action === "restore" ? "restore" : "update",
    before: type,
    after: patch,
  });
  return NextResponse.json({ updated: true });
}
