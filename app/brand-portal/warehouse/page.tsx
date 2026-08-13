import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getBrandWarehouseVariants, getBrandWarehouseTransfers } from "@/lib/data/warehouse";
import { DashboardPageHeader, DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import WarehouseExperience from "@/components/brand-portal/warehouse/WarehouseExperience";

export default async function BrandPortalWarehousePage(props: { searchParams: Promise<{ brand?: string; variant?: string; qty?: string }> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) redirect("/brand-portal");

  if (!owner.isMahalyPartner) {
    return (
      <div>
        <DashboardPageHeader eyebrow="Fulfillment" title="Shipments & Transfers" />
        <div className="mt-6">
          <DashboardEmptyState
            title="Not available for this brand"
            description="Shipments & Transfers is available to Zakhnook Fulfilled brands. Brand Fulfilled sellers manage their available quantities directly from Inventory."
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
        eyebrow="Zakhnook fulfilled"
        title="Shipments & Transfers"
        description="Send stock to Zakhnook, follow receiving progress, and keep every outbound return documented in one place."
      />
      <div className="mt-6">
        <WarehouseExperience
          variants={variants}
          transfers={transfers}
          brandParam={owner.isImpersonating ? owner.brandSlug ?? undefined : undefined}
          initialVariantId={params.variant}
          initialQuantity={params.qty ? Number(params.qty) : undefined}
        />
      </div>
    </div>
  );
}
