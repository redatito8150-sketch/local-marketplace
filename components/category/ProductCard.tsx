"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Product, ViewMode } from "@/types";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import { productCardBadge } from "@/lib/brandProfile";
import { getEffectivePrice } from "@/lib/pricing";
import ProductTile from "@/components/shared/ProductTile";

// Grid mode is the shared ProductTile design and size (see that file) —
// the same card everywhere, not a per-page shape. List mode is a
// distinct row layout (an overlay tile doesn't read well at that width/
// height), but shares the same badge priority (an active discount always
// beats "New") and shows available colors instead of a star rating, same
// as the grid tile.
export default function ProductCard({
  product,
  viewMode = "grid",
  eager = false,
}: {
  product: Product;
  viewMode?: ViewMode;
  eager?: boolean;
}) {
  if (viewMode === "list") {
    return <ProductListRow product={product} eager={eager} />;
  }

  return <ProductTile product={product} eager={eager} nameClassName="text-[13px] font-semibold leading-snug" />;
}

function ProductListRow({ product, eager }: { product: Product; eager?: boolean }) {
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const displayPrice = getEffectivePrice(product.price, product.discountPercent, product.discountEndsAt);
  const badge = productCardBadge(product);

  return (
    <Link href={`/product/${product.id}`} className="group flex items-center gap-5">
      <div className="relative h-[140px] w-[110px] flex-none overflow-hidden rounded-[16px] bg-beige-50">
        <Image
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="110px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {badge && (
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cream ${
              badge.kind === "soldOut" || badge.kind === "comingSoon" ? "bg-ink/85" : "bg-mahalyred"
            }`}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">{product.brand}</p>
            <h3 className="mt-1 truncate text-[14px] font-medium leading-snug text-ink">{product.name}</h3>
          </div>
          <button
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleItem({
                productId: product.id,
                name: product.name,
                brand: product.brand,
                brandSlug: product.brandSlug,
                price: displayPrice,
                currency: product.currency,
                image: product.image,
              });
            }}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white shadow-soft transition-transform hover:scale-105"
          >
            <Heart className="h-4 w-4" strokeWidth={1.8} fill={wishlisted ? "#242424" : "none"} color="#242424" />
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-ink">
          {formatPrice(displayPrice, product.currency)}
          {displayPrice < product.price && (
            <span className="text-[12px] font-medium text-ink-soft/45 line-through">{formatPrice(product.price, product.currency)}</span>
          )}
        </p>
        {product.colors.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5" aria-label="Available colors">
            {product.colors.slice(0, 6).map((color) => (
              <span
                key={color.name}
                title={color.name}
                aria-label={color.name}
                className="h-3 w-3 rounded-full border border-black/15 ring-1 ring-white"
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {product.colors.length > 6 && (
              <span className="text-[10px] text-ink-soft/50">+{product.colors.length - 6}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
