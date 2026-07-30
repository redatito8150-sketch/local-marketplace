import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toCollectionRecord } from "@/lib/data/brandCollections";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { logError } from "@/lib/errorLog";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// A brand owner/assistant's own collections, every status — the create/edit
// product form needs drafts and inactive ones too (only the public
// storefront read is limited to active+published). Never trust a `brand`
// query param here the way admin routes do — this is always the caller's
// own brand only.
export async function GET(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("*")
    .eq("brand_id", owner.brandId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load collections" }, { status: 500 });
  }
  return NextResponse.json({ collections: (data ?? []).map(toCollectionRecord) });
}

export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-collection-create:${owner.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() || null : null;

  const baseSlug = slugify(name) || "collection";
  let slug = baseSlug;
  let attempt = 0;
  let created: { id: string } | null = null;

  // Same "retry with a random-ish suffix on unique_violation" shape as the
  // product id generator — collisions are rare (brand-scoped slug) but this
  // keeps creation from failing outright on the first coincidental clash.
  while (attempt < 3 && !created) {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .insert({
        brand_id: owner.brandId,
        name,
        slug: attempt === 0 ? slug : `${baseSlug}-${attempt + 1}`,
        description,
        is_active: true,
        published_at: new Date().toISOString(),
        created_by: owner.user.id,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      created = data;
      slug = data.slug;
    } else if (error && error.code !== "23505") {
      logError("brand-portal.collections.create", error.message);
      break;
    }
    attempt += 1;
  }

  if (!created) {
    return NextResponse.json({ error: "Failed to create collection, please try again" }, { status: 500 });
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "collection",
    entityId: created.id,
    action: "create",
    after: { name, slug, brandId: owner.brandId },
    brandSlug: owner.brandSlug ?? undefined,
  });

  return NextResponse.json({ id: created.id, slug });
}
