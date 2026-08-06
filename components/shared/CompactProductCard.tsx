import ProductTile from "@/components/shared/ProductTile";
import type { Product } from "@/types";

// The hero-tile sizing used by homepage sections, Shop by Mood, and
// similar tight carousels — see ProductTile for the shared visual design
// (kept identical everywhere; only the aspect ratio/sizes vary by slot).
export default function CompactProductCard({ product }: { product: Product }) {
  return (
    <ProductTile
      product={product}
      aspect="aspect-[0.78]"
      sizes="(max-width: 640px) 72vw, 280px"
    />
  );
}
