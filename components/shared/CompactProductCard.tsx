import ProductTile from "@/components/shared/ProductTile";
import type { Product } from "@/types";

// Thin wrapper kept for callers that don't need to customize sizes/
// nameClassName — see ProductTile for the shared design and card size
// (the same everywhere, no per-page variation).
export default function CompactProductCard({ product }: { product: Product }) {
  return <ProductTile product={product} />;
}
