import { notFound } from "next/navigation";
import { getProductForAdmin, getAllBrandsForAdmin } from "@/lib/data/admin";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getTaxonomyTree } from "@/lib/data/taxonomy";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import ProductForm from "@/components/admin/ProductForm";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [product, brands, taxonomy, taxonomyNodes] = await Promise.all([
    getProductForAdmin(params.id),
    getAllBrandsForAdmin(),
    getSiteContentWithFallback("product_taxonomy", DEFAULT_PRODUCT_TAXONOMY),
    getTaxonomyTree(),
  ]);
  const brandOptions = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    shippingPolicy: brand.shippingPolicy,
    returnPolicy: brand.returnPolicy,
    returnWindowDays: brand.returnWindowDays,
  }));

  if (!product) notFound();

  return (
      <ProductForm
        mode="edit"
        productId={product.id}
        initial={product}
        brandOptions={brandOptions}
        taxonomy={taxonomy}
        taxonomyNodes={taxonomyNodes}
      />
  );
}
