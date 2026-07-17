import { Product, ViewMode } from "@/types";
import ProductCard from "./ProductCard";

export default function ProductGrid({
  products,
  viewMode,
}: {
  products: Product[];
  viewMode: ViewMode;
}) {
  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} viewMode="list" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} viewMode="grid" />
      ))}
    </div>
  );
}
