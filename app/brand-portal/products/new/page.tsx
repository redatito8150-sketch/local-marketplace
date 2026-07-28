import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getTaxonomyTree } from "@/lib/data/taxonomy";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewBrandPortalProductPage(
  props: {
    searchParams: Promise<{ brand?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner || !owner.brandId) redirect("/brand-portal/products");

  const [taxonomy, taxonomyNodes] = await Promise.all([
    getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY),
    getTaxonomyTree(),
  ]);
  const productsHref = `/brand-portal/products${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`;

  return (
      <ProductForm
        mode="create"
        brandOptions={[]}
        taxonomy={taxonomy}
        taxonomyNodes={taxonomyNodes}
        lockedBrand={{ id: owner.brandId, name: owner.brandName ?? owner.brandSlug ?? "" }}
        brandSlug={owner.brandSlug ?? undefined}
        apiBasePath="/api/brand-portal/products"
        cancelHref={productsHref}
      />
  );
}
