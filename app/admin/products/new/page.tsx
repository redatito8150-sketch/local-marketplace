import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFeaturedBrands } from "@/lib/data/brands";
import ProductForm from "@/components/admin/ProductForm";

export default async function NewProductPage() {
  const brandOptions = await getFeaturedBrands();

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
      <ProductForm mode="create" brandOptions={brandOptions} />
    </div>
  );
}
