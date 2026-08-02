import type { BrandImageField } from "@/types";

export type { BrandImageField };

// The 3 image slots inline-editable on a public brand page (cover/logo/
// about photo) — shared between app/api/brands/[slug]/image/route.ts,
// its restore/ sibling, and types/index.ts's BrandPageContent, so the 3
// call sites can never drift on what "a valid image field" means.
export const BRAND_IMAGE_FIELDS = ["hero", "logo", "about"] satisfies BrandImageField[];

export const BRAND_IMAGE_FIELD_TO_COLUMN: Record<BrandImageField, string> = {
  hero: "hero_image",
  logo: "logo_image",
  about: "about_image",
};
