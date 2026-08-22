import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getBrandWarehouseTransfers } from "@/lib/data/warehouse";
import { DashboardPageHeader, DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseExperience from "@/components/brand-portal/warehouse/WarehouseExperience";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import { getAllBrandsForAdmin } from "@/lib/data/admin";

export default async function BrandPortalWarehousePage(props: { searchParams: Promise<{ brand?: string }> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker destination="/brand-portal/warehouse" brands={brands
      .filter((brand) => brand.isMahalyPartner)
      .map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  if (!owner.isMahalyPartner) {
    return (
      <div>
        <DashboardPageHeader eyebrow="Inventory" title="Stock Transfers" />
        <div className="mt-6">
          <DashboardEmptyState
            title="Not available for this brand"
            description="Stock Transfers are available to Zakhnook Fulfilled brands. Brand Fulfilled sellers manage their available quantities directly from Inventory."
          />
        </div>
      </div>
    );
  }

  const transfers = await getBrandWarehouseTransfers(owner.brandId);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <div className={owner.isImpersonating ? "mt-5" : ""}>
        <WarehouseExperience
          transfers={transfers}
          brandParam={owner.isImpersonating ? owner.brandSlug ?? undefined : undefined}
          readOnly={owner.isImpersonating}
        />
      </div>
    </div>
  );
}
