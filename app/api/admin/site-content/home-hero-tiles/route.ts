import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { HeroTileContent, HomeHeroTilesContent } from "@/types";

const SLUGS: (keyof HomeHeroTilesContent)[] = ["women", "men", "kids", "home"];

// Same "one row keyed by slug, patch one slug at a time" shape as
// category_heroes — see app/api/admin/site-content/category-heroes/route.ts.
export async function PUT(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const slug = body.slug as keyof HomeHeroTilesContent;
  const tile = body.tile as Partial<HeroTileContent>;

  if (!SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Unknown tile" }, { status: 400 });
  }
  if (!tile?.label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (!tile?.href?.trim()) return NextResponse.json({ error: "Link is required" }, { status: 400 });
  if (!tile?.image?.trim()) return NextResponse.json({ error: "Image URL is required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "home_hero_tiles")
    .maybeSingle();

  const current = (existing?.value as Partial<HomeHeroTilesContent>) ?? {};
  const before = current[slug];
  const next = { ...current, [slug]: tile };

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "home_hero_tiles", value: next, updated_at: new Date().toISOString() });

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
    entityId: `home_hero_tiles:${slug}`,
    action: before ? "update" : "create",
    before,
    after: next[slug],
  });

  return NextResponse.json({ ok: true });
}
