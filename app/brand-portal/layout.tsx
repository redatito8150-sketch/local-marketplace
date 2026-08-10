import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import BrandPortalNav from "@/components/brand-portal/BrandPortalNav";
import DashboardShell from "@/components/dashboard/DashboardShell";
import BrandSwitcher from "@/components/brand-portal/BrandSwitcher";

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
    <DashboardShell
      variant="brand"
      title={owner.brandName ?? "Zakhnook Brand Portal"}
      subtitle={owner.isAdmin && !owner.brandSlug ? "Admin brand workspace" : "Brand owner workspace"}
      sidebar={<BrandPortalNav showPageContent={owner.accessLevel === "owner"} showWarehouse={owner.isMahalyPartner} />}
      headerTools={<>
        {owner.brandSlug && <BrandSwitcher brands={owner.availableBrands.map((brand) => ({ slug: brand.slug, name: brand.name }))} activeSlug={owner.brandSlug} />}
        <span className="hidden rounded-full border border-[#e3dcd3] bg-[#fffdf9] px-3 py-1.5 text-[11px] font-semibold text-[#6f6259] sm:inline-flex">{owner.accessLevel === "owner" ? "Owner access" : "Assistant access"}</span>
      </>}
    >
      {!owner.isActive && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">This brand is inactive. Catalog changes are unavailable until an administrator reactivates it.</div>}
      {owner.setupStatus && owner.setupStatus !== "complete" && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">Brand setup is {owner.setupStatus.replaceAll("_", " ")}. You can continue preparing the catalog while setup is completed.</div>}
      {children}
    </DashboardShell>
  );
}
