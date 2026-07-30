import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { collectionReferences } from "@/lib/admin/reusableDataLifecycle";
import { safeErrorResponse } from "@/lib/apiError";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await params;
  const { data: collection } = await supabaseAdmin.from("collections").select("id, brand_id").eq("id", id).maybeSingle();
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  if (collection.brand_id !== owner.brandId) return NextResponse.json({ error: "You cannot manage another brand's Collection" }, { status: 403 });
  const body = await request.json();
  const references = await collectionReferences(id);
  if (body.action === "delete") {
    if (references.productCount) return NextResponse.json({ error: `This Collection contains ${references.productCount} product${references.productCount === 1 ? "" : "s"}. Remove those assignments or archive the Collection.`, references }, { status: 409 });
    const { error } = await supabaseAdmin.from("collections").delete().eq("id", id);
    return error ? safeErrorResponse("brand-portal.collections.delete", error) : NextResponse.json({ deleted: true });
  }
  const patch: Record<string, unknown> = {};
  if (body.action === "archive") Object.assign(patch, { is_active: false, archived_at: new Date().toISOString() });
  else if (body.action === "restore") Object.assign(patch, { is_active: true, archived_at: null });
  else if (body.action === "rename" && typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  else return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  const { error } = await supabaseAdmin.from("collections").update(patch).eq("id", id);
  return error ? safeErrorResponse("brand-portal.collections.update", error) : NextResponse.json({ updated: true, references });
}
