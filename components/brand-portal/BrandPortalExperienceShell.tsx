"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import BrandPortalNav from "@/components/brand-portal/BrandPortalNav";
import BrandSwitcher from "@/components/brand-portal/BrandSwitcher";
import DashboardShell from "@/components/dashboard/DashboardShell";

interface BrandPortalExperienceShellProps {
  children: ReactNode;
  brandName: string;
  brandSlug: string | null;
  isAdminWithoutBrand: boolean;
  isActive: boolean;
  isPartner: boolean;
  accessLevel: "owner" | "assistant";
  availableBrands: Array<{ slug: string; name: string }>;
}

export default function BrandPortalExperienceShell({
  children,
  brandName,
  brandSlug,
  isAdminWithoutBrand,
  isActive,
  isPartner,
  accessLevel,
  availableBrands,
}: BrandPortalExperienceShellProps) {
  const pathname = usePathname();
  const isStandaloneProductCreator = pathname === "/brand-portal/products/new";

  const inactiveNotice = !isActive ? (
    <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">
      This brand is inactive. Catalog changes are unavailable until an administrator reactivates it.
    </div>
  ) : null;

  if (isStandaloneProductCreator) {
    return (
      <main className="min-h-screen bg-[#FAF8F4] text-[#242424]">
        {inactiveNotice ? <div className="mx-auto max-w-[1760px] px-4 pt-4 sm:px-6 lg:px-8">{inactiveNotice}</div> : null}
        {children}
      </main>
    );
  }

  return (
    <DashboardShell
      variant="brand"
      title={brandName}
      subtitle={isAdminWithoutBrand ? "Admin brand workspace" : "Brand owner workspace"}
      sidebar={<BrandPortalNav showPageContent={accessLevel === "owner"} showWarehouse={isPartner} />}
      headerTools={
        <>
          {brandSlug ? <BrandSwitcher brands={availableBrands} activeSlug={brandSlug} /> : null}
          <span className="hidden rounded-full border border-[#e3dcd3] bg-[#fffdf9] px-3 py-1.5 text-[11px] font-semibold text-[#6f6259] sm:inline-flex">
            {accessLevel === "owner" ? "Owner access" : "Assistant access"}
          </span>
        </>
      }
    >
      {inactiveNotice}
      {children}
    </DashboardShell>
  );
}
