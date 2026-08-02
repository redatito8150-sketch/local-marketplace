import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CollectionsEditor {
  userId: string;
  actorLabel: string;
  isAdmin: boolean;
  brandId: string;
}

// Same admin-OR-exact-brand-owner boundary as
// app/api/brands/[slug]/inline-edit and .../image — shared here since the
// Collections page's own inline-management routes (app/api/brands/[slug]
// /collections/**) need it too, and additionally need the brand's real id
// (collections/products are keyed by brand_id, never brand_slug).
export async function requireCollectionsEditor(brandSlug: string): Promise<CollectionsEditor | null> {
  const admin = await requireAdminUser();
  const owner = admin ? null : await requireBrandOwner();
  const isAuthorized = Boolean(admin) || (owner && owner.brandSlug === brandSlug && owner.accessLevel === "owner");
  if (!isAuthorized) return null;

  const { data: brand } = await supabaseAdmin.from("brands").select("id").eq("slug", brandSlug).maybeSingle();
  if (!brand) return null;

  if (admin) return { userId: admin.id, actorLabel: admin.email ?? admin.id, isAdmin: true, brandId: brand.id };
  return { userId: owner!.user.id, actorLabel: owner!.user.email ?? owner!.user.id, isAdmin: false, brandId: brand.id };
}
