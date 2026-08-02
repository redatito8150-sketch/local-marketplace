import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCollectionsEditor } from "@/lib/brandCollectionsAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

async function loadOwnCollection(id: string, brandId: string) {
  const { data } = await supabaseAdmin.from("collections").select("id, brand_id").eq("id", id).maybeSingle();
  if (!data || data.brand_id !== brandId) return null;
  return data;
}

// Every one of the brand's own products, each flagged with whether it's
// currently in *this* collection — backs the Collections page's "choose
// products" picker (components/brand/CollectionProductPicker), a fast
// multi-select instead of the old one-product-at-a-time-via-ProductForm
// flow.
export async function GET(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const collection = await loadOwnCollection(params.id, editor.brandId);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, image, collection_id")
    .eq("brand_id", editor.brandId)
    .order("name", { ascending: true });
  if (error) return safeErrorResponse("brands.collections.products.list", error, "Failed to load products");

  const products = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    image: row.image as string,
    inThisCollection: row.collection_id === params.id,
  }));

  return NextResponse.json({ products });
}

// Sets the *complete* membership for this collection in one call — any
// currently-assigned product missing from productIds is unassigned
// (collection_id -> null), and every id present gets collection_id set to
// this collection. Every id is verified to belong to the caller's own
// brand first; the DB trigger (enforce_product_collection_brand_match)
// is the real backstop, this is just a clearer error than a raw
// constraint violation.
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!checkRateLimit(`brand-collections-set-products:${editor.userId}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const collection = await loadOwnCollection(params.id, editor.brandId);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const productIds = Array.isArray(body?.productIds) ? body.productIds.filter((id: unknown) => typeof id === "string") : null;
  if (!productIds) return NextResponse.json({ error: "Invalid product list" }, { status: 400 });

  const { data: ownedProducts, error: ownedError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("brand_id", editor.brandId)
    .in("id", productIds.length ? productIds : ["__none__"]);
  if (ownedError) return safeErrorResponse("brands.collections.products.verify", ownedError, "Failed to save");
  if ((ownedProducts ?? []).length !== productIds.length) {
    return NextResponse.json({ error: "One or more products don't belong to this brand" }, { status: 403 });
  }

  // Computed in JS (not a hand-built "not in (...)" filter string) — this
  // repo's own convention after a prior filter-injection issue elsewhere
  // (see lib/data/products.ts's searchProducts) is parameterized query
  // builder calls only, never string-interpolated filters.
  const { data: currentlyAssigned, error: currentError } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("collection_id", params.id);
  if (currentError) return safeErrorResponse("brands.collections.products.current", currentError, "Failed to save");

  const idsToUnassign = (currentlyAssigned ?? [])
    .map((row) => row.id as string)
    .filter((id) => !productIds.includes(id));

  if (idsToUnassign.length) {
    const { error: unassignError } = await supabaseAdmin
      .from("products")
      .update({ collection_id: null })
      .in("id", idsToUnassign);
    if (unassignError) return safeErrorResponse("brands.collections.products.unassign", unassignError, "Failed to save");
  }

  if (productIds.length) {
    const { error: assignError } = await supabaseAdmin
      .from("products")
      .update({ collection_id: params.id })
      .in("id", productIds);
    if (assignError) return safeErrorResponse("brands.collections.products.assign", assignError, "Failed to save");
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.id,
    action: "update",
    after: { productIds },
    brandSlug: params.slug,
  });

  return NextResponse.json({ ok: true, productIds });
}
