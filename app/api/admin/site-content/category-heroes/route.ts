import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { CategoryHeroContent, CategorySlug } from "@/types";

const SLUGS: CategorySlug[] = ["women", "men", "kids"];

// Stored as one row (key="category_heroes") shaped { women: {...}, men:
// {...}, kids: {...} } rather than three separate rows — the admin form
// edits one category at a time, so this reads the whole blob, patches only
// the given slug, and writes the whole blob back.
export async function PUT(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const slug = body.slug as CategorySlug;
  const hero = body.hero as Partial<CategoryHeroContent>;

  if (!SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  if (!hero?.title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!hero?.description?.trim())
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (!hero?.ctaLabel?.trim())
    return NextResponse.json({ error: "Button label is required" }, { status: 400 });
  if (!hero?.heroImage?.trim())
    return NextResponse.json({ error: "Image URL is required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "category_heroes")
    .maybeSingle();

  const current = (existing?.value as Record<string, CategoryHeroContent>) ?? {};
  const before = current[slug];
  const next = { ...current, [slug]: { ...hero, slug } };

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "category_heroes", value: next, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json(
      { error: `Failed to save: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: `category_heroes:${slug}`,
    action: before ? "update" : "create",
    before,
    after: next[slug],
  });

  return NextResponse.json({ ok: true });
}
