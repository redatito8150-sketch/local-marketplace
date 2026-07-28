import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toCollectionRecord } from "@/lib/data/brandCollections";
import { logAudit } from "@/lib/auditLog";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Admin equivalent of /api/brand-portal/collections — the brand to list/
// create for is an explicit, required query param/body field here (an
// admin manages every brand's collections, never just one implicit own
// brand), unlike the brand-portal route which always scopes to the
// caller's own brand.
export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const brandId = request.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "A brandId query param is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load collections" }, { status: 500 });
  }
  return NextResponse.json({ collections: (data ?? []).map(toCollectionRecord) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!brandId) {
    return NextResponse.json({ error: "A brand is required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }

  const { data: brand } = await supabaseAdmin.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const baseSlug = slugify(name) || "collection";
  let created: { id: string; slug: string } | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .insert({
        brand_id: brandId,
        name,
        slug: attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`,
        description,
        is_active: true,
        published_at: new Date().toISOString(),
        created_by: admin.id,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      created = data;
    } else if (error && error.code !== "23505") {
      lastError = error.message;
      break;
    }
  }

  if (!created) {
    return NextResponse.json(
      { error: lastError ?? "Failed to create collection, please try again" },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "collection",
    entityId: created.id,
    action: "create",
    after: { name, slug: created.slug, brandId },
  });

  return NextResponse.json({ id: created.id, slug: created.slug });
}
