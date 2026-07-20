import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrandAccessLevel = "owner" | "assistant";

export interface BrandOwnerContext {
  user: User;
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

  const { data: ownedBrand } = await supabase
    .from("brands")
    .select("slug, name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (ownedBrand) {
    return {
      user,
      brandSlug: ownedBrand.slug,
      brandName: ownedBrand.name,
      isAdmin,
      isImpersonating: false,
      accessLevel: "owner",
    };
  }

  // Not the owner — check the assistant link (brand_staff) before falling
  // through to the admin-override path.
  const { data: staffRow } = await supabase
    .from("brand_staff")
    .select("brand_slug")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffRow) {
    const { data: staffBrand } = await supabase
      .from("brands")
      .select("slug, name")
      .eq("slug", staffRow.brand_slug)
      .maybeSingle();

    if (staffBrand) {
      return {
        user,
        brandSlug: staffBrand.slug,
        brandName: staffBrand.name,
        isAdmin,
        isImpersonating: false,
        accessLevel: "assistant",
      };
    }
  }

  if (!isAdmin) return null;

  if (!overrideSlug) {
    return {
      user,
      brandSlug: null,
      brandName: null,
      isAdmin: true,
      isImpersonating: false,
      accessLevel: "owner",
    };
  }

  // brands has a public-read policy already (brand pages are public), so
  // the cookie client is enough here — no need for supabaseAdmin just to
  // resolve the name.
  const { data: targetBrand } = await supabase
    .from("brands")
    .select("slug, name")
    .eq("slug", overrideSlug)
    .maybeSingle();

  if (!targetBrand) return null;
  return {
    user,
    brandSlug: targetBrand.slug,
    brandName: targetBrand.name,
    isAdmin: true,
    isImpersonating: true,
    accessLevel: "owner",
  };
}
