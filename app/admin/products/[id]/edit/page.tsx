import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft/60 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
        Back to products
      </Link>
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
