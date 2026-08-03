import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCollectionsEditor } from "@/lib/brandCollectionsAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// Backs drag-to-reorder on the brand profile's Collections page
// (components/brand/CollectionsOrderPanel) — the *only* thing that page
// can do to a collection now; creating/editing/deleting all live in
// /brand-portal/collections (components/brand/CollectionsManager) instead.
// Position 0 in `orderedIds` becomes the featured collection (see
// BrandCollectionsExperience) — no separate is_featured flag.
export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!checkRateLimit(`brand-collections-reorder:${editor.userId}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds.filter((id: unknown) => typeof id === "string") : null;
  if (!orderedIds || orderedIds.length === 0) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("collections")
    .select("id")
    .eq("brand_id", editor.brandId);
  if (ownedError) return safeErrorResponse("brands.collections.reorder.verify", ownedError, "Failed to save order");

  const ownedIds = new Set((owned ?? []).map((row) => row.id as string));
  const isExactMatch = orderedIds.length === ownedIds.size && orderedIds.every((id: string) => ownedIds.has(id));
  if (!isExactMatch) {
    return NextResponse.json({ error: "The order must include exactly all of your collections" }, { status: 400 });
  }

  const results = await Promise.all(
    orderedIds.map((id: string, index: number) =>
      supabaseAdmin.from("collections").update({ sort_order: index }).eq("id", id)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return safeErrorResponse("brands.collections.reorder.update", failed.error, "Failed to save order");

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.slug,
    action: "update",
    after: { orderedIds },
    brandSlug: params.slug,
  });

  return NextResponse.json({ ok: true });
}
