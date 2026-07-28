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

  return <ProductForm mode="create" brandOptions={brandOptions} taxonomy={taxonomy} taxonomyNodes={taxonomyNodes} />;
}
