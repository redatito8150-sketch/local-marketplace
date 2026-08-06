import ProductTile from "@/components/shared/ProductTile";
import type { Product } from "@/types";

export default function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section className="border-t border-stone-150 pt-12">
      <h2 className="text-2xl font-bold tracking-tightest text-ink">
        You May Also Like
      </h2>

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {products.map((product) => (
          <ProductTile key={product.id} product={product} nameClassName="text-[13px] font-semibold leading-snug" />
        ))}
      </div>
    </section>
  );
}
