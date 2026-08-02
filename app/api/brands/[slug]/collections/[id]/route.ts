import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCollectionsEditor } from "@/lib/brandCollectionsAuth";
import { collectionReferences } from "@/lib/admin/reusableDataLifecycle";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";

async function loadOwnCollection(id: string, brandId: string) {
  const { data } = await supabaseAdmin.from("collections").select("*").eq("id", id).maybeSingle();
  if (!data || data.brand_id !== brandId) return null;
  return data;
}

// Single-collection updates for the Collections page's own inline-edit
// affordances — name/tagline/description, pause/resume (is_active — same
// underlying flag the brand-portal's archive/restore already uses, just a
// different label in this UI), scheduling a future reveal (visible_from),
// and delete (blocked while it still holds products, same as brand-portal).
export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!checkRateLimit(`brand-collections-update:${editor.userId}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many edits — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnCollection(params.id, editor.brandId);
  if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const patch: Record<string, unknown> = {};

  if (action === "updateDetails") {
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (name.length > 80) return NextResponse.json({ error: "That name is too long" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body?.tagline === "string") {
      const tagline = body.tagline.trim();
      if (tagline.length > 40) return NextResponse.json({ error: "That tag is too long" }, { status: 400 });
      patch.tagline = tagline || null;
    }
    if (typeof body?.description === "string") {
      const description = body.description.trim();
      if (description.length > 1000) return NextResponse.json({ error: "That's too long" }, { status: 400 });
      patch.description = description || null;
    }
    if ("visibleFrom" in (body ?? {})) {
      const raw = body.visibleFrom;
      if (raw === null || raw === "") {
        patch.visible_from = null;
      } else if (typeof raw === "string" && !Number.isNaN(new Date(raw).getTime())) {
        patch.visible_from = new Date(raw).toISOString();
      } else {
        return NextResponse.json({ error: "Enter a valid date" }, { status: 400 });
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
  } else if (action === "pause") {
    patch.is_active = false;
  } else if (action === "resume") {
    patch.is_active = true;
  } else {
    return NextResponse.json({ error: "Invalid management action" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("collections").update(patch).eq("id", params.id);
  if (error) return safeErrorResponse("brands.collections.update", error, "Failed to save");

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.id,
    action: "update",
    before: existing,
    after: patch,
    brandSlug: params.slug,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const existing = await loadOwnCollection(params.id, editor.brandId);
  if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const references = await collectionReferences(params.id);
  if (references.productCount) {
    return NextResponse.json(
      {
        error: `This collection contains ${references.productCount} product${references.productCount === 1 ? "" : "s"}. Remove those first or pause the collection instead.`,
      },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.from("collections").delete().eq("id", params.id);
  if (error) return safeErrorResponse("brands.collections.delete", error, "Failed to delete");

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.id,
    action: "delete",
    before: existing,
    brandSlug: params.slug,
  });

  return NextResponse.json({ ok: true });
}
