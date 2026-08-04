import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import type { MoodTileContent } from "@/types";

const MAX_IMAGES = 4;

function validate(tiles: unknown): string | null {
  if (!Array.isArray(tiles) || tiles.length === 0) return "At least one tile is required";
  for (const tile of tiles as Partial<MoodTileContent>[]) {
    if (!tile.label?.trim()) return "Every tile needs a label";
    if (!Array.isArray(tile.images) || tile.images.length === 0) return "Every tile needs at least one image";
    if (tile.images.length > MAX_IMAGES) return `A tile can have at most ${MAX_IMAGES} images`;
    if (tile.images.some((url) => typeof url !== "string" || !url.trim())) return "Every image needs a URL";
    if (tile.productIds !== undefined && !Array.isArray(tile.productIds)) return "Invalid product selection";
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
    images: (t.images as string[]).map((url) => url.trim()).slice(0, MAX_IMAGES),
    productIds: Array.isArray(t.productIds) ? t.productIds.filter((id): id is string => typeof id === "string") : [],
  }));

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "shop_by_mood", value: tiles, updated_at: new Date().toISOString() });

  if (error) {
    return safeErrorResponse("admin.site-content.shop-by-mood", error, "Failed to save");
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

  // The homepage is `force-static` (app/page.tsx) — without this, a saved
  // change here would sit in the DB but never actually appear on the live
  // site until the next unrelated redeploy.
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
