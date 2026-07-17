import { getFeaturedBrands } from "@/lib/data/brands";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewProductPage() {
  const brandOptions = await getFeaturedBrands();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Add product</h1>
      <ProductForm mode="create" brandOptions={brandOptions} />
    </div>
  );
}
