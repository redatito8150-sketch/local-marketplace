import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type {
  ContactInfoContent,
  FeaturedBrandAndSponsoredContent,
  HomeHeroContent,
  HomeProductSectionContent,
  JoinHeroContent,
  ShippingSettingsContent,
} from "@/types";

// Single-value keys handled generically here. category-heroes, journal, and
// product-taxonomy (list-shaped, needing per-item patch/add/remove
// semantics) get their own dedicated routes instead.
const ALLOWED_KEYS = [
  "home_hero",
  "join_hero",
  "shipping_settings",
  "contact_info",
  "home_new_arrivals",
  "featured_brand_and_sponsored",
] as const;
const PRODUCT_SECTION_SOURCES: HomeProductSectionContent["source"][] = [
  "new",
  "trending",
  "bestsellers",
];
type AllowedKey = (typeof ALLOWED_KEYS)[number];

function validateHero(key: "home_hero" | "join_hero", value: unknown): string | null {
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

function validateShippingSettings(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Missing content";
  const v = value as Partial<ShippingSettingsContent>;
  if (typeof v.freeShippingThresholdEgp !== "number" || v.freeShippingThresholdEgp < 0) {
    return "Free shipping threshold must be a positive number";
  }
  if (typeof v.returnPolicyDays !== "number" || v.returnPolicyDays < 0) {
    return "Return policy days must be a positive number";
  }
  return null;
}

function validateContactInfo(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Missing content";
  const v = value as Partial<ContactInfoContent>;
  if (!v.supportEmail?.trim()) return "Support email is required";
  if (!v.supportPhone?.trim()) return "Support phone is required";
  if (!v.address?.trim()) return "Address is required";
  return null;
}

function validateHomeProductSection(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Missing content";
  const v = value as Partial<HomeProductSectionContent>;
  if (!v.title?.trim()) return "Title is required";
  if (!v.source || !PRODUCT_SECTION_SOURCES.includes(v.source)) {
    return "Source must be one of: new, trending, bestsellers";
  }
  if (typeof v.limit !== "number" || v.limit <= 0) {
    return "Limit must be a positive number";
  }
  return null;
}

function validateFeaturedBrandAndSponsored(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Missing content";
  const v = value as Partial<FeaturedBrandAndSponsoredContent>;
  if (!v.featuredBrandSlug?.trim()) return "A featured brand is required";
  if (!Array.isArray(v.sponsoredBrandSlugs)) return "Sponsored brands must be a list";
  if (v.sponsoredBrandSlugs.some((s) => typeof s !== "string" || !s.trim())) {
    return "Every sponsored brand needs a valid slug";
  }
  return null;
}

function validate(key: AllowedKey, value: unknown): string | null {
  if (key === "home_hero" || key === "join_hero") return validateHero(key, value);
  if (key === "shipping_settings") return validateShippingSettings(value);
  if (key === "home_new_arrivals") return validateHomeProductSection(value);
  if (key === "featured_brand_and_sponsored") return validateFeaturedBrandAndSponsored(value);
  return validateContactInfo(value);
}

export async function PUT(request: NextRequest, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
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
export async function DELETE(_request: NextRequest, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
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
