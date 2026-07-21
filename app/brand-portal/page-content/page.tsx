import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getBrandForAdmin, getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandForm from "@/components/admin/BrandForm";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import { DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

export default async function BrandPortalPageContentPage(props: { searchParams: Promise<{ brand?: string }> }) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  if (owner.accessLevel !== "owner") redirect("/brand-portal");
  const brand = await getBrandForAdmin(owner.brandSlug);
  if (!brand) redirect("/brand-portal");
  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Brand" title="Brand profile" description="Manage the public story, imagery, and identity customers see on your Mahaly brand page. The existing live-publish and admin notification workflow remains unchanged." />
      <DashboardPanel className="mt-6"><div className="p-5 sm:p-6"><BrandForm mode="edit" initial={brand} otherBrands={[]} scope="brand-portal" apiPath="/api/brand-portal/brand-content" redirectPath={`/brand-portal/page-content${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} /></div></DashboardPanel>
    </div>
  );
}
