import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductTaxonomyForm from "@/components/admin/ProductTaxonomyForm";
import type { ProductTaxonomyContent } from "@/types";

export default async function AdminProductCategoriesPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("product_taxonomy");
  const initial = (row?.value as ProductTaxonomyContent) ?? DEFAULT_PRODUCT_TAXONOMY;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Categories</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        These lists power the Category, Product Type, Collection, Material, and Fit
        dropdowns in the product form — changes apply immediately, no redeploy needed.
      </p>

      <div className="mt-8">
        <ProductTaxonomyForm initial={initial} />
      </div>
    </div>
  );
}
