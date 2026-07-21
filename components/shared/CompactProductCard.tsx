import Image from "next/image";
import Link from "next/link";
import StarRating from "@/components/shared/StarRating";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types";

// Homepage-only product card — deliberately has no Add to Cart button and
// no wishlist heart. Add to Cart lives exclusively on the product detail
// page; this card is just a doorway to it.
export default function CompactProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl2 bg-stone-100">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 22vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-soft/60">
        {product.brand}
      </p>
      <h3 className="mt-1 text-[15px] font-medium text-ink">{product.name}</h3>
      <div className="mt-1.5 flex items-center gap-2">
        <StarRating rating={product.rating} size="xs" />
        <span className="text-xs text-ink-soft/50">({product.reviewCount})</span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold text-ink">
        {formatPrice(product.price, product.currency)}
      </p>
    </Link>
  );
}
