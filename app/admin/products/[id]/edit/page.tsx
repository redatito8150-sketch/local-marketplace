import { notFound } from "next/navigation";
import { getProductForAdmin } from "@/lib/data/admin";
import { getFeaturedBrands } from "@/lib/data/brands";
import ProductForm from "@/components/admin/ProductForm";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, brandOptions] = await Promise.all([
    getProductForAdmin(params.id),
    getFeaturedBrands(),
  ]);

  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">
        Edit {product.name}
      </h1>
      <ProductForm
        mode="edit"
        productId={product.id}
        initial={product}
        brandOptions={brandOptions}
      />
    </div>
  );
}
