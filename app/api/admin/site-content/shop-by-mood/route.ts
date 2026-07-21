import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import type { MoodTileContent } from "@/types";

function validate(tiles: unknown): string | null {
  if (!Array.isArray(tiles) || tiles.length === 0) return "At least one tile is required";
  for (const tile of tiles as Partial<MoodTileContent>[]) {
    if (!tile.label?.trim()) return "Every tile needs a label";
    if (!tile.image?.trim()) return "Every tile needs an image URL";
    if (!tile.href?.trim()) return "Every tile needs a link";
  }
  return null;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Unlike journal_articles (open-ended add/remove list with its own
// per-slug CRUD routes), the mood tiles are a small fixed-shape set the
// owner edits as a whole — one PUT replaces the entire array at once.
export async function PUT(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const validationError = validate(body.tiles);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "shop_by_mood")
    .maybeSingle();

  const tiles: MoodTileContent[] = (body.tiles as Partial<MoodTileContent>[]).map((t) => ({
    id: t.id?.trim() || slugify(t.label!.trim()),
    label: t.label!.trim(),
    image: t.image!.trim(),
    href: t.href!.trim(),
  }));

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "shop_by_mood", value: tiles, updated_at: new Date().toISOString() });

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
    entityId: "shop_by_mood",
    action: existing ? "update" : "create",
    before: existing?.value ?? SHOP_BY_MOOD,
    after: tiles,
  });

  return NextResponse.json({ ok: true });
}
