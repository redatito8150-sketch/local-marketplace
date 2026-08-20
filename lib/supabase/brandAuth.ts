import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaUserState } from "@/lib/supabase/mfaAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/supabase/permissions";

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
  // Reuses brands.is_mahaly_partner (order-splitting/shipping-pool flag) —
  // a partner brand's stock physically lives in Zakhnook's own warehouse, so
  // this also gates the Local Warehouse nav/API surface (see
  // supabase/migrations/20260809000004_local_warehouse_transfers.sql).
  isMahalyPartner: boolean;
  availableBrands: Array<{
    id: string;
    slug: string;
    name: string;
    accessLevel: BrandAccessLevel;
    setupStatus: BrandOwnerContext["setupStatus"];
    isActive: boolean;
    isMahalyPartner: boolean;
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
  const authState = await getMfaUserState(supabase);
  if (authState.status !== "authenticated") return null;
  const { user } = authState;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_admin);

  const { data: ownedBrands } = await supabaseAdmin
    .from("brands")
    .select("id, slug, name, setup_status, is_active, is_mahaly_partner")
    .eq("owner_user_id", user.id)
    .order("name");

  // access_level distinguishes a co-owner (added via the "keep every
  // existing owner, add this person too" path — see set_user_access's
  // p_mode='add') from a real assistant — both are rows in the same
  // table now. A brand's *primary* owner (brands.owner_user_id) is caught
  // by the ownedBrands query above and always wins the membershipMap
  // insert below; this is what gives every *other* co-owner the same
  // "owner" accessLevel (and therefore identical brand-portal permissions)
  // without needing their own owner_user_id slot.
  const { data: staffRows } = await supabaseAdmin
    .from("brand_staff")
    .select("brand_id, access_level")
    .eq("user_id", user.id);
  const staffAccessByBrandId = new Map(
    (staffRows ?? []).map((row) => [row.brand_id as string, (row.access_level as BrandAccessLevel | null) ?? "assistant"])
  );
  const staffBrandIds = [...staffAccessByBrandId.keys()];
  const { data: staffBrands } = staffBrandIds.length
    ? await supabaseAdmin
      .from("brands")
      .select("id, slug, name, setup_status, is_active, is_mahaly_partner")
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
      isMahalyPartner: Boolean(brand.is_mahaly_partner),
    });
  }
  for (const brand of staffBrands ?? []) {
    if (!membershipMap.has(brand.id)) {
      membershipMap.set(brand.id, {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        accessLevel: staffAccessByBrandId.get(brand.id) ?? "assistant",
        setupStatus: brand.setup_status,
        isActive: brand.is_active,
        isMahalyPartner: Boolean(brand.is_mahaly_partner),
      });
    }
  }
  let availableBrands = [...membershipMap.values()];

  // Compatibility for conversions made before owner_user_id became the
  // authoritative relation. Only the authenticated user's converted
  // application and its stored brand id/slug can be used.
  if (!availableBrands.length) {
    const { data: legacyApplications } = await supabaseAdmin
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
      const { data: legacyBrands } = await supabaseAdmin
        .from("brands")
        .select("id, slug, name, setup_status, is_active, is_mahaly_partner")
        .or(filters);
      availableBrands = (legacyBrands ?? []).map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        accessLevel: "owner" as const,
        setupStatus: brand.setup_status,
        isActive: brand.is_active,
        isMahalyPartner: Boolean(brand.is_mahaly_partner),
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
      isMahalyPartner: selectedMembership.isMahalyPartner,
      availableBrands,
    };
  }

  if (!isAdmin) return null;

  // Audit finding AUTH-01 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): every admin-profile account used
  // to reach this point regardless of their granular custom-role
  // permissions (lib/admin/permissionPolicy.ts only ever gated /admin* and
  // /api/admin* — Brand Portal impersonation was untouched). A staff
  // account scoped to something narrow like view_analytics could still
  // impersonate an arbitrary unrelated brand with full owner-level access:
  // read customer PII, export orders, cancel/advance orders, edit brand
  // content. Impersonation now requires the same manage_brands permission
  // the admin brand-management surface itself is gated on — a full-rank
  // admin (role === "admin") always has it, since getUserPermissions()
  // grants a full-rank admin every permission; a narrower custom role must
  // be explicitly granted manage_brands to impersonate at all.
  const permissions = await getUserPermissions(user.id);
  if (!permissions.has("manage_brands")) return null;

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
      isMahalyPartner: false,
      availableBrands: [],
    };
  }

  // brands has a public-read policy already (brand pages are public), so
  // the cookie client is enough here — no need for supabaseAdmin just to
  // resolve the name.
  const { data: targetBrand } = await supabaseAdmin
    .from("brands")
    .select("id, slug, name, setup_status, is_active, is_mahaly_partner")
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
    isMahalyPartner: Boolean(targetBrand.is_mahaly_partner),
    availableBrands: [],
  };
}

// Portal APIs use this stricter guard. A suspended brand may still render its
// read-only dashboard, but its members cannot mutate catalog, stock, orders or
// customer-facing content. Administrators retain recovery access.
export async function requireActiveBrandOwner(overrideSlug?: string): Promise<BrandOwnerContext | null> {
  const context = await requireBrandOwner(overrideSlug);
  if (!context || (!context.isActive && !context.isAdmin)) return null;
  return context;
}
