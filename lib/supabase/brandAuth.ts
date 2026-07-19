import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Parallel to requireAdminUser()/requireStaffRole() but for the separate,
// non-overlapping brand_owner track — is_admin stays false for these
// accounts, so they never pass the admin checks and never see /admin.
// One brand per owner for v1 (enforced by a partial unique index on
// brands.owner_user_id), so this resolves to at most one brand.
export async function requireBrandOwner(): Promise<{
  user: User;
  brandSlug: string;
  brandName: string;
} | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: brand } = await supabase
    .from("brands")
    .select("slug, name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!brand) return null;
  return { user, brandSlug: brand.slug, brandName: brand.name };
}
