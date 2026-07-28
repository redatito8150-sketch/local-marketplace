import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin, getFullTaxonomyTreeForAdmin } from "@/lib/data/admin";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductTaxonomyForm from "@/components/admin/ProductTaxonomyForm";
import TaxonomyTreeView from "@/components/admin/TaxonomyTreeView";
import type { ProductTaxonomyContent } from "@/types";

export default async function AdminProductCategoriesPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const [row, taxonomyNodes] = await Promise.all([
    getSiteContentRowForAdmin("product_taxonomy"),
    getFullTaxonomyTreeForAdmin(),
  ]);
  const initial = (row?.value as ProductTaxonomyContent) ?? DEFAULT_PRODUCT_TAXONOMY;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Categories</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Main Category / Product Group / Product Type is a fixed hierarchy managed through
        database seed migrations, shown read-only below. Materials and Fits are still
        editable here — Collections are now brand-owned (a brand&apos;s own Collection field
        in the product form).
      </p>

      <div className="mt-8">
        <h2 className="mb-3 text-[14px] font-semibold text-ink">Product Taxonomy</h2>
        <TaxonomyTreeView nodes={taxonomyNodes} />
      </div>

      <div className="mt-10 border-t border-stone-150 pt-8">
        <ProductTaxonomyForm initial={initial} />
      </div>
    </div>
  );
}
