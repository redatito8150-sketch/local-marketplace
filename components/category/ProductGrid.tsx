import { Product, ViewMode } from "@/types";
import ProductCard from "./ProductCard";

export default function ProductGrid({
  products,
  viewMode,
  compact = false,
  roomy = false,
  medium = false,
  minimalCard = false,
}: {
  products: Product[];
  viewMode: ViewMode;
  compact?: boolean;
  roomy?: boolean;
  medium?: boolean;
  minimalCard?: boolean;
}) {
  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-6">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            viewMode="list"
            compact={compact}
            eager={index < 2}
            hideRating={minimalCard}
            hideQuickAdd={minimalCard}
            showColorDots={minimalCard}
            elevated={minimalCard}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 ${compact ? "gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : roomy ? "gap-x-5 gap-y-10 sm:gap-x-7 lg:grid-cols-3" : medium ? "gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4" : "gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"}`}>
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          viewMode="grid"
          compact={compact}
          eager={index < 6}
          hideRating={minimalCard}
          hideQuickAdd={minimalCard}
          showColorDots={minimalCard}
          elevated={minimalCard}
        />
      ))}
    </div>
  );
}
