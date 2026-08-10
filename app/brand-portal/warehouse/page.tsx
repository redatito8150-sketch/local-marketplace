import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getBrandWarehouseVariants, getBrandWarehouseTransfers } from "@/lib/data/warehouse";
import { DashboardPageHeader, DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseExperience from "@/components/brand-portal/warehouse/WarehouseExperience";

export default async function BrandPortalWarehousePage(props: { searchParams: Promise<{ brand?: string }> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) redirect("/brand-portal");

  if (!owner.isMahalyPartner) {
    return (
      <div>
        <DashboardPageHeader eyebrow="Catalog" title="Local Warehouse" />
        <div className="mt-6">
          <DashboardEmptyState
            title="Not available for this brand"
            description="Local Warehouse is only available to Zakhnook Partner brands, whose stock is held and fulfilled from Zakhnook's own warehouse. Contact an admin if you believe this should be enabled."
          />
        </div>
      </div>
    );
  }

  const [variants, transfers] = await Promise.all([
    getBrandWarehouseVariants(owner.brandId),
    getBrandWarehouseTransfers(owner.brandId),
  ]);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow="Catalog"
        title="Local Warehouse"
        description="Declare how much of each variant you actually hold, then request a transfer (اذن صرف مخزن) to hand it to Zakhnook's warehouse. Your storefront stock only rises once Zakhnook confirms receipt — it can never exceed what's actually been received."
      />
      <div className="mt-6">
        <WarehouseExperience variants={variants} transfers={transfers} brandParam={owner.isImpersonating ? owner.brandSlug ?? undefined : undefined} />
      </div>
    </div>
  );
}
