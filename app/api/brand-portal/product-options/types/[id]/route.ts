import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeOptionKey } from "@/lib/inventory/optionKey";
import { optionTypeReferences } from "@/lib/admin/reusableDataLifecycle";
import { validateOptionTypeName } from "@/lib/admin/optionValidation";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { data: type } = await supabaseAdmin.from("option_types").select("*").eq("id", id).maybeSingle();
  if (!type) return NextResponse.json({ error: "Option type not found" }, { status: 404 });
  if (type.is_system || type.brand_id !== owner.brandId) return NextResponse.json({ error: "Only your brand's custom option types can be managed" }, { status: 403 });
  const body = await request.json();
  const actorLabel = owner.user.email ?? owner.user.id;
  if (body.action === "delete") {
    const references = await optionTypeReferences(id);
    if (references.selectedCount) return NextResponse.json({ error: "This option type is used by product data and cannot be deleted. You can archive it instead.", references }, { status: 409 });
    const { error } = await supabaseAdmin.from("option_types").delete().eq("id", id);
    if (error) return safeErrorResponse("brand-portal.product-options.types.delete", error);
    await logAudit({ actorId: owner.user.id, actorLabel, entityType: "option_type", entityId: id, action: "delete", before: type, brandSlug: owner.brandSlug ?? undefined });
    return NextResponse.json({ deleted: true });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action === "archive") Object.assign(patch, { is_archived: true, archived_at: new Date().toISOString() });
  else if (body.action === "restore") Object.assign(patch, { is_archived: false, archived_at: null });
  else if (body.action === "rename" && typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim();
    const validationError = validateOptionTypeName(name);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    Object.assign(patch, { name, key: normalizeOptionKey(name) });
  }
  else return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  const { error } = await supabaseAdmin.from("option_types").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That option type already exists for your brand" }, { status: 409 });
    return safeErrorResponse("brand-portal.product-options.types.update", error);
  }
  await logAudit({
    actorId: owner.user.id,
    actorLabel,
    entityType: "option_type",
    entityId: id,
    action: body.action === "archive" ? "archive" : body.action === "restore" ? "restore" : "update",
    before: type,
    after: patch,
    brandSlug: owner.brandSlug ?? undefined,
  });
  return NextResponse.json({ updated: true });
}
