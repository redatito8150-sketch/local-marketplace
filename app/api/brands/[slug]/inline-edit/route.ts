import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getUserPermissions } from "@/lib/supabase/permissions";
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
  storyBody: { column: "story_body", required: false, maxLength: 5000 },
  aboutHeadline: { column: "about_headline", required: false, maxLength: 200 },
  aboutQuote: { column: "about_quote", required: false, maxLength: 300 },
  collectionsPageTitle: { column: "collections_page_title", required: false, maxLength: 200 },
  collectionsDetailEyebrow: { column: "collections_detail_eyebrow", required: false, maxLength: 60 },
  collectionsDetailHeading: { column: "collections_detail_heading", required: false, maxLength: 60 },
} as const;
type TextField = keyof typeof TEXT_FIELDS;

function isTextField(field: string): field is TextField {
  return field in TEXT_FIELDS;
}

// Audit finding AUTH-01 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md): this route sits outside /admin* and
// /api/admin*, so lib/admin/permissionPolicy.ts's path-based gate never
// applies to it — requireAdminUser() alone reduces to a bare
// profiles.is_admin check with no granular permission required, letting any
// admin-profile account (even one scoped to something narrow like
// view_analytics) edit an arbitrary brand's public page content. Explicitly
// require manage_brands here, the same permission requireBrandOwner()'s
// impersonation path now requires for the same reason.
async function requireEditor(brandSlug: string) {
  const admin = await requireAdminUser();
  if (admin) {
    const permissions = await getUserPermissions(admin.id);
    if (!permissions.has("manage_brands")) return null;
    return { userId: admin.id, actorLabel: admin.email ?? admin.id, isAdmin: true };
  }
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
  // shown on the About page — capped at 10 (keeps the drag-scroll strip
  // sane), and every field is validated (not just typeof checked) since
  // this becomes real jsonb, not a display-only prop. `year` has to parse
  // as a real integer (not just any 20-char string) because the page sorts
  // every milestone — computed and custom — chronologically by this value.
  if (field === "journeyMilestones") {
    const raw = body?.value;
    if (!Array.isArray(raw) || raw.length > 10) {
      return NextResponse.json({ error: "Up to 10 milestones" }, { status: 400 });
    }
    const currentYear = new Date().getFullYear();
    const milestones: { year: string; month?: number; title: string; description: string; icon: string }[] = [];
    for (const item of raw) {
      const yearRaw = typeof item?.year === "string" ? item.year.trim() : "";
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      const description = typeof item?.description === "string" ? item.description.trim() : "";
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
      const monthNum = item?.month === null || item?.month === undefined ? undefined : Number(item.month);
      if (monthNum !== undefined && (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12)) {
        return NextResponse.json({ error: "Enter a valid month" }, { status: 400 });
      }
      // A milestone saved before icons existed (or with a since-removed
      // icon key) shouldn't block saving the *entire* array on every
      // future edit — coerce quietly to a safe default instead of
      // rejecting, same as the timeline's own display-side fallback.
      const icon = typeof item?.icon === "string" && JOURNEY_ICON_KEYS.includes(item.icon as (typeof JOURNEY_ICON_KEYS)[number])
        ? item.icon
        : "sparkles";
      milestones.push({ year: String(yearNum), ...(monthNum !== undefined ? { month: monthNum } : {}), title, description, icon });
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

  // Founder credits — a list, not a single field, so a brand can name more
  // than one founder, each with their own name + title, in whatever order
  // the owner arranges them (order is exactly the array order, saved
  // whole on every reorder/add/edit/remove). Capped at 5.
  if (field === "founders") {
    const raw = body?.value;
    if (!Array.isArray(raw) || raw.length > 5) {
      return NextResponse.json({ error: "Up to 5 founders" }, { status: 400 });
    }
    const founders: { name: string; title: string }[] = [];
    for (const item of raw) {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "Each founder needs a name" }, { status: 400 });
      }
      if (name.length > 80 || title.length > 40) {
        return NextResponse.json({ error: "That's too long" }, { status: 400 });
      }
      founders.push({ name, title: title || "Founder" });
    }
    return applyUpdate(params.slug, "founders", founders, editor);
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
  value:
    | string
    | number
    | null
    | { name: string; title: string }[]
    | { year: string; month?: number; title: string; description: string; icon: string }[],
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
    relatedEntityType: "brand",
    relatedEntityId: slug,
    entityIdLabel: "Brand ID",
    actorLabel: editor.actorLabel,
  });

  return NextResponse.json({ ok: true, value });
}
