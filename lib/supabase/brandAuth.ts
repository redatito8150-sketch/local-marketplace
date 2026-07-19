import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
}

// Parallel to requireAdminUser()/requireStaffRole() but for the separate,
// non-overlapping brand_owner track. A genuine brand owner always resolves
// to their own brand regardless of `overrideSlug` — that param only ever
// lets an admin account (who owns no brand of their own) view a brand's
// portal on their behalf, so admin access to any brand's dashboard never
// depends on that account also being linked as its owner.
export async function requireBrandOwner(
  overrideSlug?: string
): Promise<BrandOwnerContext | null> {
  const supabase = createSupabaseServerClient();
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
    };
  }

  if (!isAdmin) return null;

  if (!overrideSlug) {
    return { user, brandSlug: null, brandName: null, isAdmin: true, isImpersonating: false };
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
  };
}
