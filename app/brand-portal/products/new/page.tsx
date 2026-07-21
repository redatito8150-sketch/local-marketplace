import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewBrandPortalProductPage(
  props: {
    searchParams: Promise<{ brand?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner || !owner.brandSlug) redirect("/brand-portal/products");

  const taxonomy = await getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY);
  const productsHref = `/brand-portal/products${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`;

  return (
    <div>
      <Link
        href={productsHref}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft/60 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
        Back to products
      </Link>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Add product</h1>
      <ProductForm
        mode="create"
        brandOptions={[]}
        taxonomy={taxonomy}
        lockedBrand={{ slug: owner.brandSlug, name: owner.brandName ?? owner.brandSlug }}
        apiBasePath="/api/brand-portal/products"
        cancelHref={productsHref}
      />
    </div>
  );
}
