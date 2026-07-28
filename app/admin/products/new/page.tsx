import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getTaxonomyTree } from "@/lib/data/taxonomy";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewProductPage() {
  const [brands, taxonomy, taxonomyNodes] = await Promise.all([
    getAllBrandsForAdmin(),
    getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY),
    getTaxonomyTree(),
  ]);
  const brandOptions = brands.map((brand) => ({ id: brand.id, name: brand.name }));

  return (
    <div>
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft/60 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
        Back to products
      </Link>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Add product</h1>
      <ProductForm mode="create" brandOptions={brandOptions} taxonomy={taxonomy} taxonomyNodes={taxonomyNodes} />
    </div>
  );
}
