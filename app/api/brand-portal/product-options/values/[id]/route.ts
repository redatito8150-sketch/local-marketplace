import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deriveSkuToken, normalizeOptionKey } from "@/lib/inventory/optionKey";
import { HISTORICAL_DELETE_MESSAGE, optionValueReferences } from "@/lib/admin/reusableDataLifecycle";
import { validateOptionValueLabel } from "@/lib/admin/optionValidation";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { data: value } = await supabaseAdmin.from("option_values").select("id, brand_id").eq("id", id).maybeSingle();
  if (!value) return NextResponse.json({ error: "Option value not found" }, { status: 404 });
  if (!value.brand_id || value.brand_id !== owner.brandId) return NextResponse.json({ error: "Only your brand's custom values can be managed" }, { status: 403 });
  const body = await request.json();
  if (body.action === "delete") {
    const references = await optionValueReferences(id);
    if (references.selectedCount || references.variantCount || references.historical) {
      return NextResponse.json({ error: HISTORICAL_DELETE_MESSAGE, references }, { status: 409 });
    }
    const { error } = await supabaseAdmin.from("option_values").delete().eq("id", id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ deleted: true });
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
  return error
    ? NextResponse.json({ error: error.code === "23505" ? "That value already exists for this option" : error.message }, { status: error.code === "23505" ? 409 : 500 })
    : NextResponse.json({ updated: true });
}
