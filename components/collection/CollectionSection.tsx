import Link from "next/link";
import { Product } from "@/types";
import ProductGrid from "@/components/category/ProductGrid";

export default function CollectionSection({
  eyebrow,
  title,
  description,
  products,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  products: Product[];
  emptyMessage: string;
}) {
  return (
    <section className="mx-auto max-w-screen3xl px-8 pb-20 pt-6 lg:px-[60px]">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft/50">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-ink-soft/60">{description}</p>
      <p className="mt-6 text-[13px] font-medium text-ink-soft/50">
        {products.length} {products.length === 1 ? "product" : "products"}
      </p>

      {products.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl3 bg-stone-50 py-20 text-center">
          <p className="text-[15px] font-medium text-ink">{emptyMessage}</p>
          <Link
            href="/shop/women"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
          >
            Explore Products
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ProductGrid products={products} viewMode="grid" />
        </div>
      )}
    </section>
  );
}
