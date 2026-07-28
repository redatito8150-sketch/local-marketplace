import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrandAccessLevel = "owner" | "assistant";

export interface BrandOwnerContext {
  user: User;
  // The real ownership FK — the only thing product/collection/brand_staff
  // writes should ever be scoped by. brandSlug stays available for
  // building public URLs only.
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  isAdmin: boolean;
  // True only when the caller is viewing a brand they don't personally
  // own (an admin using ?brand=slug) — this is what tells the data layer
  // to read via supabaseAdmin instead of relying on the owner-scoped RLS
  // policy, which would otherwise correctly refuse the read.
  isImpersonating: boolean;
  // "owner" for the real owner (and for an admin impersonating — an admin
  // always gets full access) — "assistant" only for a brand_staff-linked
  // account, which the brand-portal UI uses to hide Page Content/Logs and
  // narrow which product actions are available (Round 3).
  accessLevel: BrandAccessLevel;
  setupStatus: "setup_required" | "in_progress" | "ready_for_review" | "complete" | null;
  isActive: boolean;
  availableBrands: Array<{
    id: string;
    slug: string;
    name: string;
    accessLevel: BrandAccessLevel;
    setupStatus: BrandOwnerContext["setupStatus"];
    isActive: boolean;
  }>;
}

// Parallel to requireAdminUser()/requireStaffRole() but for the separate,
// non-overlapping brand_owner/brand_assistant track. A genuine brand owner
// always resolves to their own brand regardless of `overrideSlug` — that
// param only ever lets an admin account (who owns no brand of their own)
// view a brand's portal on their behalf, so admin access to any brand's
// dashboard never depends on that account also being linked as its owner.
export async function requireBrandOwner(
  overrideSlug?: string
): Promise<BrandOwnerContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_admin);

  const { data: ownedBrands } = await supabase
    .from("brands")
    .select("id, slug, name, setup_status, is_active")
    .eq("owner_user_id", user.id)
    .order("name");

  const { data: staffRows } = await supabase
    .from("brand_staff")
    .select("brand_id")
    .eq("user_id", user.id);
  const staffBrandIds = [...new Set((staffRows ?? []).map((row) => row.brand_id))];
  const { data: staffBrands } = staffBrandIds.length
    ? await supabase
      .from("brands")
      .select("id, slug, name, setup_status, is_active")
      .in("id", staffBrandIds)
      .order("name")
    : { data: [] };

  const membershipMap = new Map<string, BrandOwnerContext["availableBrands"][number]>();
  for (const brand of ownedBrands ?? []) {
    membershipMap.set(brand.id, {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      accessLevel: "owner",
      setupStatus: brand.setup_status,
      isActive: brand.is_active,
    });
  }
  for (const brand of staffBrands ?? []) {
    if (!membershipMap.has(brand.id)) {
      membershipMap.set(brand.id, {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        accessLevel: "assistant",
        setupStatus: brand.setup_status,
        isActive: brand.is_active,
      });
    }
  }
  let availableBrands = [...membershipMap.values()];

  // Compatibility for conversions made before owner_user_id became the
  // authoritative relation. Only the authenticated user's converted
  // application and its stored brand id/slug can be used.
  if (!availableBrands.length) {
    const { data: legacyApplications } = await supabase
      .from("brand_applications")
      .select("converted_brand_id, approved_brand_id")
      .eq("applicant_user_id", user.id)
      .eq("status", "converted_to_brand");
    const legacyIds = (legacyApplications ?? []).map((row) => row.converted_brand_id).filter(Boolean) as string[];
    const legacySlugs = (legacyApplications ?? []).map((row) => row.approved_brand_id).filter(Boolean) as string[];
    if (legacyIds.length || legacySlugs.length) {
      const filters = [
        legacyIds.length ? `id.in.(${legacyIds.join(",")})` : "",
        legacySlugs.length ? `slug.in.(${legacySlugs.join(",")})` : "",
      ].filter(Boolean).join(",");
      const { data: legacyBrands } = await supabase
        .from("brands")
        .select("id, slug, name, setup_status, is_active")
        .or(filters);
      availableBrands = (legacyBrands ?? []).map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        accessLevel: "owner" as const,
        setupStatus: brand.setup_status,
        isActive: brand.is_active,
      }));
    }
  }

  const selectedMembership = overrideSlug
    ? availableBrands.find((brand) => brand.slug === overrideSlug)
    : availableBrands[0];
  if (selectedMembership) {
    return {
      user,
      brandId: selectedMembership.id,
      brandSlug: selectedMembership.slug,
      brandName: selectedMembership.name,
      isAdmin,
      isImpersonating: false,
      accessLevel: selectedMembership.accessLevel,
      setupStatus: selectedMembership.setupStatus,
      isActive: selectedMembership.isActive,
      availableBrands,
    };
  }

  if (!isAdmin) return null;

  if (!overrideSlug) {
    return {
      user,
      brandId: null,
      brandSlug: null,
      brandName: null,
      isAdmin: true,
      isImpersonating: false,
      accessLevel: "owner",
      setupStatus: null,
      isActive: true,
      availableBrands: [],
    };
  }

  // brands has a public-read policy already (brand pages are public), so
  // the cookie client is enough here — no need for supabaseAdmin just to
  // resolve the name.
  const { data: targetBrand } = await supabase
    .from("brands")
    .select("id, slug, name, setup_status, is_active")
    .eq("slug", overrideSlug)
    .maybeSingle();

  if (!targetBrand) return null;
  return {
    user,
    brandId: targetBrand.id,
    brandSlug: targetBrand.slug,
    brandName: targetBrand.name,
    isAdmin: true,
    isImpersonating: true,
    accessLevel: "owner",
    setupStatus: targetBrand.setup_status,
    isActive: targetBrand.is_active,
    availableBrands: [],
  };
}
