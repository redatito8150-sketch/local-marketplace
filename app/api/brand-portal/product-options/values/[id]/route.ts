import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deriveSkuToken, normalizeOptionKey } from "@/lib/inventory/optionKey";
import { HISTORICAL_DELETE_MESSAGE, optionValueReferences } from "@/lib/admin/reusableDataLifecycle";
import { validateOptionValueLabel } from "@/lib/admin/optionValidation";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { reorderCustomSize } from "@/lib/inventory/sizeOrder";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { data: value } = await supabaseAdmin.from("option_values").select("*").eq("id", id).maybeSingle();
  if (!value) return NextResponse.json({ error: "Option value not found" }, { status: 404 });
  if (!value.brand_id || value.brand_id !== owner.brandId) return NextResponse.json({ error: "Only your brand's custom values can be managed" }, { status: 403 });
  const body = await request.json();
  const actorLabel = owner.user.email ?? owner.user.id;
  if (body.action === "reorder") {
    const direction = body.direction === "up" || body.direction === "down" ? body.direction : null;
    if (!direction) return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
    const { data: siblings, error: siblingsError } = await supabaseAdmin
      .from("option_values")
      .select("id, label, sort_order, brand_id")
      .eq("option_type_id", value.option_type_id)
      .or(`brand_id.is.null,brand_id.eq.${owner.brandId}`)
      .eq("is_archived", false);
    if (siblingsError) return safeErrorResponse("brand-portal.product-options.values.reorder", siblingsError);
    const moves = reorderCustomSize(
      (siblings ?? []).map((s) => ({
        id: s.id as string,
        label: s.label as string,
        sortOrder: s.sort_order as number,
        brandId: s.brand_id as string | null,
      })),
      id,
      direction
    );
    if (!moves) return NextResponse.json({ error: "That can't be moved any further" }, { status: 400 });
    for (const move of moves) {
      const { error } = await supabaseAdmin
        .from("option_values")
        .update({ sort_order: move.sortOrder, updated_at: new Date().toISOString() })
        .eq("id", move.id);
      if (error) return safeErrorResponse("brand-portal.product-options.values.reorder", error);
    }
    await logAudit({
      actorId: owner.user.id,
      actorLabel,
      entityType: "option_value",
      entityId: id,
      action: "update",
      before: value,
      after: { reordered: moves },
      brandSlug: owner.brandSlug ?? undefined,
    });
    return NextResponse.json({ updated: true });
  }
  if (body.action === "delete") {
    const references = await optionValueReferences(id);
    if (references.selectedCount || references.variantCount || references.historical) {
      return NextResponse.json({ error: HISTORICAL_DELETE_MESSAGE, references }, { status: 409 });
    }
    const { error } = await supabaseAdmin.from("option_values").delete().eq("id", id);
    if (error) return safeErrorResponse("brand-portal.product-options.values.delete", error);
    await logAudit({ actorId: owner.user.id, actorLabel, entityType: "option_value", entityId: id, action: "delete", before: value, brandSlug: owner.brandSlug ?? undefined });
    return NextResponse.json({ deleted: true });
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.action === "archive") Object.assign(patch, { is_archived: true, archived_at: new Date().toISOString() });
  else if (body.action === "restore") Object.assign(patch, { is_archived: false, archived_at: null });
  else if (body.action === "rename" && typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim();
    const validationError = validateOptionValueLabel(name);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    Object.assign(patch, { label: name, key: normalizeOptionKey(name), sku_token: deriveSkuToken(name) });
  } else return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  const { error } = await supabaseAdmin.from("option_values").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That value already exists for this option" }, { status: 409 });
    return safeErrorResponse("brand-portal.product-options.values.update", error);
  }
  await logAudit({
    actorId: owner.user.id,
    actorLabel,
    entityType: "option_value",
    entityId: id,
    action: body.action === "archive" ? "archive" : body.action === "restore" ? "restore" : "update",
    before: value,
    after: patch,
    brandSlug: owner.brandSlug ?? undefined,
  });
  return NextResponse.json({ updated: true });
}
