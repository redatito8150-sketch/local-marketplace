import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCollectionsEditor } from "@/lib/brandCollectionsAuth";
import { getAllCollectionsForBrand } from "@/lib/data/brandCollections";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { logError } from "@/lib/errorLog";
import { safeErrorResponse } from "@/lib/apiError";

const MAX_COLLECTIONS_PER_BRAND = 10;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Every collection regardless of status (paused, scheduled, published) —
// this route backs the Collections page's own inline-management UI, which
// an owner/admin needs to see and resume anything not currently public.
export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const collections = await getAllCollectionsForBrand(editor.brandId);
  return NextResponse.json({ collections });
}

export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!checkRateLimit(`brand-collections-create:${editor.userId}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { count } = await supabaseAdmin
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", editor.brandId);
  if ((count ?? 0) >= MAX_COLLECTIONS_PER_BRAND) {
    return NextResponse.json({ error: `You can have up to ${MAX_COLLECTIONS_PER_BRAND} collections` }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "That name is too long" }, { status: 400 });
  }

  const baseSlug = slugify(name) || "collection";
  let slug = baseSlug;
  let attempt = 0;
  let created: { id: string; slug: string } | null = null;

  // Same "retry with a numbered suffix on unique_violation" shape as the
  // brand-portal's own collection creation route.
  while (attempt < 3 && !created) {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .insert({
        brand_id: editor.brandId,
        name,
        slug: attempt === 0 ? slug : `${baseSlug}-${attempt + 1}`,
        is_active: true,
        published_at: new Date().toISOString(),
        created_by: editor.userId,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      created = data;
      slug = data.slug;
    } else if (error && error.code !== "23505") {
      return safeErrorResponse("brands.collections.create", error, "Failed to create collection");
    }
    attempt += 1;
  }

  if (!created) {
    logError("brands.collections.create", "exhausted slug retry attempts");
    return NextResponse.json({ error: "Failed to create collection, please try again" }, { status: 500 });
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: created.id,
    action: "create",
    after: { name, slug, brandId: editor.brandId },
    brandSlug: params.slug,
  });

  return NextResponse.json({ id: created.id, slug });
}
