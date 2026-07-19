import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { HomeHeroContent, JoinHeroContent } from "@/types";

// Single-value keys handled generically here. category-heroes and journal
// (list-shaped, needing per-item patch/add/remove semantics) get their own
// dedicated routes instead.
const ALLOWED_KEYS = ["home_hero", "join_hero"] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

function validate(key: AllowedKey, value: unknown): string | null {
  if (!value || typeof value !== "object") return "Missing content";
  const v = value as Partial<HomeHeroContent & JoinHeroContent>;

  if (!Array.isArray(v.headingLines) || v.headingLines.length === 0) {
    return "At least one heading line is required";
  }
  if (v.headingLines.some((line) => typeof line !== "string" || !line.trim())) {
    return "Heading lines can't be empty";
  }
  if (!v.subheading?.trim()) return "Subheading is required";
  if (!v.ctaLabel?.trim()) return "Button label is required";
  if (key === "join_hero" && !v.label?.trim()) return "Label is required";

  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const key = params.key;
  if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
    return NextResponse.json({ error: "Unknown content key" }, { status: 400 });
  }

  const body = await request.json();
  const validationError = validate(key as AllowedKey, body.value);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key, value: body.value, updated_at: new Date().toISOString() });

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
    entityId: key,
    action: existing ? "update" : "create",
    before: existing?.value,
    after: body.value,
  });

  return NextResponse.json({ ok: true });
}

// Resets the key back to its static content/*.ts default by removing the
// override row — never a "delete the content" action from the owner's
// point of view, just "stop customizing this."
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { key: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const key = params.key;
  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("site_content").delete().eq("key", key);
  if (error) {
    return NextResponse.json(
      { error: `Failed to reset: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: key,
    action: "delete",
    before: existing?.value,
  });

  return NextResponse.json({ ok: true });
}
