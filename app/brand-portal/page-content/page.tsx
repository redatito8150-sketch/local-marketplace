import { redirect } from "next/navigation";
import { CheckCircle2, Store } from "lucide-react";
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
  const profileFields = [
    { label: "category", value: brand.category },
    { label: "city", value: brand.city },
    { label: "hero image", value: brand.heroImage },
    { label: "logo", value: brand.logoImage },
    { label: "about description", value: brand.aboutDescription },
    { label: "about image", value: brand.aboutImage },
    { label: "brand story", value: brand.storyBody },
  ];
  const missingProfileFields = profileFields.filter((field) => !field.value);
  const completedProfileFields = profileFields.length - missingProfileFields.length;
  const profileCompleteness = Math.round((completedProfileFields / profileFields.length) * 100);
  const profileComplete = missingProfileFields.length === 0;

  return (
    <div className="mx-auto max-w-[1540px]">
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Brand" title="Brand profile" description="Manage the public story, imagery, and identity customers see on your Zakhnook brand page. The existing live-publish and admin notification workflow remains unchanged." />
      <section className={`mt-6 flex flex-col gap-4 rounded-2xl border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${profileComplete ? "border-emerald-200 bg-emerald-50/70" : "border-[#e7cfcc] bg-[#f8ecea]"}`}>
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white shadow-[0_5px_16px_rgba(92,57,48,0.08)] ${profileComplete ? "text-emerald-700" : "text-mahalyred"}`}>
            {profileComplete ? <CheckCircle2 className="h-5 w-5" strokeWidth={1.8} /> : <Store className="h-5 w-5" strokeWidth={1.8} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-bold tracking-[-0.015em] text-[#332c27]">{profileComplete ? "Your brand profile is complete" : "Complete your brand profile"}</h2>
              <span className={`text-[13px] font-bold tabular-nums ${profileComplete ? "text-emerald-700" : "text-mahalyred"}`}>{profileCompleteness}% complete</span>
            </div>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[#75685f]">
              {profileComplete
                ? "Your public brand page has all the key details customers need."
                : `Still missing: ${missingProfileFields.map((field) => field.label).join(", ")}. Complete them in the form below.`}
            </p>
          </div>
        </div>
        {!profileComplete && <span className="flex-none text-[12px] font-semibold tabular-nums text-[#75685f]">{missingProfileFields.length} fields remaining</span>}
      </section>
      <DashboardPanel className="mt-6"><div className="p-5 sm:p-6"><BrandForm mode="edit" initial={brand} scope="brand-portal" apiPath="/api/brand-portal/brand-content" redirectPath={`/brand-portal/page-content${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} /></div></DashboardPanel>
    </div>
  );
}
