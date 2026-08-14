import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import BrandPortalExperienceShell from "@/components/brand-portal/BrandPortalExperienceShell";

export default async function BrandPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No override here — layouts never receive searchParams in the App
  // Router, so an admin's ?brand= selection can only be resolved by the
  // page underneath. This call just decides "is this account allowed in
  // the portal shell at all" (a real brand owner, or any admin).
  const owner = await requireBrandOwner();
  if (!owner) redirect("/account");

  return (
    <BrandPortalExperienceShell
      brandName={owner.brandName ?? "Zakhnook Brand Portal"}
      brandSlug={owner.brandSlug}
      isAdminWithoutBrand={owner.isAdmin && !owner.brandSlug}
      isActive={owner.isActive}
      isPartner={owner.isMahalyPartner}
      accessLevel={owner.accessLevel}
      availableBrands={owner.availableBrands.map((brand) => ({ slug: brand.slug, name: brand.name }))}
    >
      {children}
    </BrandPortalExperienceShell>
  );
}
