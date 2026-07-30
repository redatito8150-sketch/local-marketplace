import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getTaxonomyTree } from "@/lib/data/taxonomy";
import { getBrandForAdmin } from "@/lib/data/admin";
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

  const [taxonomy, taxonomyNodes, lockedBrandRecord] = await Promise.all([
    getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY),
    getTaxonomyTree(),
    owner.brandSlug ? getBrandForAdmin(owner.brandSlug) : Promise.resolve(null),
  ]);
  const productsHref = `/brand-portal/products${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`;

  return (
      <ProductForm
        mode="create"
        brandOptions={[]}
        taxonomy={taxonomy}
        taxonomyNodes={taxonomyNodes}
        lockedBrand={{ id: owner.brandId, name: owner.brandName ?? owner.brandSlug ?? "" }}
        lockedBrandPolicy={lockedBrandRecord ? {
          shippingPolicy: lockedBrandRecord.shippingPolicy,
          returnPolicy: lockedBrandRecord.returnPolicy,
          returnWindowDays: lockedBrandRecord.returnWindowDays,
        } : undefined}
        brandSlug={owner.brandSlug ?? undefined}
        apiBasePath="/api/brand-portal/products"
        cancelHref={productsHref}
      />
  );
}
