import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { JOURNEY_ICON_KEYS } from "@/lib/brandJourneyIcons";
import { sanitizeRichText, stripRichText } from "@/lib/sanitizeRichText";

// Single-field saves for the Facebook-style "click the pencil, edit right
// here" affordance on the public brand page (app/brands/[slug]/**) — a
// deliberately narrower, lighter-weight sibling to the brand-portal's own
// full-form PATCH (/api/brand-portal/brand-content), which still owns the
// more structurally complex fields (values[], shopTheLook[], category tabs,
// shipping/return policy, SKU prefix). Only the flat fields actually
// rendered on the public page are editable here — see the field table this
// was scoped against.
const TEXT_FIELDS = {
  name: { column: "name", required: true, maxLength: 5000 },
  tagline: { column: "tagline", required: true, maxLength: 5000 },
  city: { column: "city", required: true, maxLength: 5000 },
  websiteUrl: { column: "website_url", required: false, maxLength: 5000 },
  storyBody: { column: "story_body", required: false, maxLength: 5000 },
  aboutHeadline: { column: "about_headline", required: false, maxLength: 200 },
  aboutQuote: { column: "about_quote", required: false, maxLength: 300 },
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

  // Custom "Our journey" timeline entries the owner/admin adds on top of the
  // always-real computed milestones (foundedYear, brand.createdAt) already
  // shown on the About page — capped at 6 (keeps the drag-scroll strip
  // sane), and every field is validated (not just typeof checked) since
  // this becomes real jsonb, not a display-only prop. `year` has to parse
  // as a real integer (not just any 20-char string) because the page sorts
  // every milestone — computed and custom — chronologically by this value.
  if (field === "journeyMilestones") {
    const raw = body?.value;
    if (!Array.isArray(raw) || raw.length > 6) {
      return NextResponse.json({ error: "Up to 6 milestones" }, { status: 400 });
    }
    const currentYear = new Date().getFullYear();
    const milestones: { year: string; title: string; description: string; icon: string }[] = [];
    for (const item of raw) {
      const yearRaw = typeof item?.year === "string" ? item.year.trim() : "";
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      const description = typeof item?.description === "string" ? item.description.trim() : "";
      const icon = typeof item?.icon === "string" ? item.icon : "";
      const yearNum = Number(yearRaw);
      if (!yearRaw || !Number.isInteger(yearNum) || yearNum < 1900 || yearNum > currentYear + 10) {
        return NextResponse.json({ error: "Enter a valid milestone year" }, { status: 400 });
      }
      if (!title) {
        return NextResponse.json({ error: "Each milestone needs a title" }, { status: 400 });
      }
      if (title.length > 60 || description.length > 200) {
        return NextResponse.json({ error: "That's too long" }, { status: 400 });
      }
      if (!JOURNEY_ICON_KEYS.includes(icon as (typeof JOURNEY_ICON_KEYS)[number])) {
        return NextResponse.json({ error: "Choose a valid icon" }, { status: 400 });
      }
      milestones.push({ year: String(yearNum), title, description, icon });
    }
    return applyUpdate(params.slug, "journey_milestones", milestones, editor);
  }

  // The About page's single combined intro field — rich text (bold/italic/
  // size only, see lib/sanitizeRichText.ts), so it's sanitized server-side
  // regardless of what the editor's own toolbar would ever produce, since
  // this is the real trust boundary, not the client. "Required" is checked
  // against the stripped, tag-free text so `<p></p>` doesn't count as content.
  if (field === "aboutDescription") {
    const raw = typeof body?.value === "string" ? body.value : "";
    if (raw.length > 20000) {
      return NextResponse.json({ error: "That's too long" }, { status: 400 });
    }
    const clean = sanitizeRichText(raw);
    if (!stripRichText(clean)) {
      return NextResponse.json({ error: "This field can't be empty" }, { status: 400 });
    }
    return applyUpdate(params.slug, "about_description", clean, editor);
  }

  // Multiple founder credits, replacing the single founder_name column —
  // capped at 5 names, each trimmed and bounded so the About page's byline
  // never has to wrap unpredictably.
  if (field === "founderNames") {
    const raw = body?.value;
    if (!Array.isArray(raw) || raw.length > 5) {
      return NextResponse.json({ error: "Up to 5 founders" }, { status: 400 });
    }
    const names: string[] = [];
    for (const item of raw) {
      const name = typeof item === "string" ? item.trim() : "";
      if (!name) continue;
      if (name.length > 80) {
        return NextResponse.json({ error: "That name is too long" }, { status: 400 });
      }
      names.push(name);
    }
    return applyUpdate(params.slug, "founder_names", names, editor);
  }

  if (typeof field !== "string" || !isTextField(field)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const config = TEXT_FIELDS[field];
  const raw = typeof body?.value === "string" ? body.value.trim() : "";
  if (config.required && !raw) {
    return NextResponse.json({ error: "This field can't be empty" }, { status: 400 });
  }
  if (raw.length > config.maxLength) {
    return NextResponse.json({ error: "That's too long" }, { status: 400 });
  }

  return applyUpdate(params.slug, config.column, config.required ? raw : raw || null, editor);
}

async function applyUpdate(
  slug: string,
  column: string,
  value: string | number | null | string[] | { year: string; title: string; description: string; icon: string }[],
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
