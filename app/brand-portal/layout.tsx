import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import BrandPortalNav from "@/components/brand-portal/BrandPortalNav";
import DashboardShell from "@/components/dashboard/DashboardShell";

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
      title={owner.brandName ?? "Mahaly Brand Portal"}
      subtitle={owner.isAdmin && !owner.brandSlug ? "Admin brand workspace" : "Brand owner workspace"}
      sidebar={<BrandPortalNav showPageContent={owner.accessLevel === "owner"} />}
      headerTools={<span className="hidden rounded-full border border-[#e3dcd3] bg-[#fffdf9] px-3 py-1.5 text-[11px] font-semibold text-[#6f6259] sm:inline-flex">{owner.accessLevel === "owner" ? "Owner access" : "Assistant access"}</span>}
    >
      {children}
    </DashboardShell>
  );
}
