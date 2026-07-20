import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getBrandForAdmin, getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandForm from "@/components/admin/BrandForm";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";

export default async function BrandPortalPageContentPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} />;
  }

  // Page content is an owner-only concern — an assistant (Round 3 Phase 5)
  // never sees this nav item, and hitting the URL directly redirects away.
  if (owner.accessLevel !== "owner") redirect("/brand-portal");

  const brand = await getBrandForAdmin(owner.brandSlug);
  if (!brand) redirect("/brand-portal");

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Page Content</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Changes here go live on your brand page immediately — no admin approval needed. The admin
        gets notified so they can check it afterwards.
      </p>

      <div className="mt-8">
        <BrandForm
          mode="edit"
          initial={brand}
          otherBrands={[]}
          scope="brand-portal"
          apiPath="/api/brand-portal/brand-content"
          redirectPath="/brand-portal/page-content"
        />
      </div>
    </div>
  );
}
