import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { getFeaturedBrands } from "@/lib/data/brands";
import { FEATURED_BRAND_AND_SPONSORED } from "@/content/home";
import FeaturedSponsoredForm from "@/components/admin/FeaturedSponsoredForm";
import type { FeaturedBrandAndSponsoredContent } from "@/types";

export default async function AdminFeaturedSponsoredPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const [row, brands] = await Promise.all([
    getSiteContentRowForAdmin("featured_brand_and_sponsored"),
    getFeaturedBrands(),
  ]);
  const initial =
    (row?.value as FeaturedBrandAndSponsoredContent) ?? FEATURED_BRAND_AND_SPONSORED;

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">
        Featured Brand &amp; Sponsored
      </h1>
      <FeaturedSponsoredForm
        initial={initial}
        brandOptions={brands.map((b) => ({ slug: b.slug, name: b.name }))}
      />
    </div>
  );
}
