import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

// Single-field saves for the Facebook-style "click the pencil, edit right
// here" affordance on the public brand page (app/brands/[slug]/**) — a
// deliberately narrower, lighter-weight sibling to the brand-portal's own
// full-form PATCH (/api/brand-portal/brand-content), which still owns the
// more structurally complex fields (values[], shopTheLook[], category tabs,
// shipping/return policy, SKU prefix). Only the flat fields actually
// rendered on the public page are editable here — see the field table this
// was scoped against.
const TEXT_FIELDS = {
  name: { column: "name", required: true },
  tagline: { column: "tagline", required: true },
  city: { column: "city", required: true },
  websiteUrl: { column: "website_url", required: false },
  aboutDescription: { column: "about_description", required: true },
  storyBody: { column: "story_body", required: false },
} as const;
type TextField = keyof typeof TEXT_FIELDS;

function isTextField(field: string): field is TextField {
  return field in TEXT_FIELDS;
}

async function requireEditor(brandSlug: string) {
  const admin = await requireAdminUser();
  if (admin) return { userId: admin.id, actorLabel: admin.email ?? admin.id, isAdmin: true };
  const owner = await requireBrandOwner();
  if (owner && owner.brandSlug === brandSlug && owner.accessLevel === "owner") {
    return { userId: owner.user.id, actorLabel: owner.user.email ?? owner.user.id, isAdmin: false };
  }
  return null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireEditor(params.slug);
  if (!editor) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-inline-edit:${editor.userId}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many edits — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const field = body?.field;

  // The brand's name is admin-only — an owner can freely edit tagline,
  // city, founded year, about copy, etc., but never rename the brand
  // itself. Enforced here regardless of the client-side pencil affordance
  // being hidden for owners, since this route is the real boundary.
  if (field === "name" && !editor.isAdmin) {
    return NextResponse.json({ error: "Only an admin can rename a brand" }, { status: 403 });
  }

  if (field === "foundedYear") {
    const raw = body?.value;
    const value = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1900 || value > new Date().getFullYear())) {
      return NextResponse.json({ error: "Enter a valid founding year" }, { status: 400 });
    }
    return applyUpdate(params.slug, "founded_year", value, editor);
  }

  if (typeof field !== "string" || !isTextField(field)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const config = TEXT_FIELDS[field];
  const raw = typeof body?.value === "string" ? body.value.trim() : "";
  if (config.required && !raw) {
    return NextResponse.json({ error: "This field can't be empty" }, { status: 400 });
  }
  if (raw.length > 5000) {
    return NextResponse.json({ error: "That's too long" }, { status: 400 });
  }

  return applyUpdate(params.slug, config.column, config.required ? raw : raw || null, editor);
}

async function applyUpdate(
  slug: string,
  column: string,
  value: string | number | null,
  editor: { userId: string; actorLabel: string }
) {
  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select(column)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("brands").update({ [column]: value }).eq("slug", slug);
  if (error) {
    return safeErrorResponse("brands.inline-edit.update", error, "Failed to save");
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "brand",
    entityId: slug,
    action: "update",
    before: existing,
    after: { [column]: value },
    brandSlug: slug,
  });
  await notify("brand_updated", `Brand page updated: ${slug}`, "", {
    entityId: slug,
    entityIdLabel: "Brand ID",
    actorLabel: editor.actorLabel,
  });

  return NextResponse.json({ ok: true, value });
}
