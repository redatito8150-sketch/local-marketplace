"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useWishlist } from "@/context/WishlistContext";
import { productCardBadge } from "@/lib/brandProfile";
import { getEffectivePrice } from "@/lib/pricing";
import type { Product } from "@/types";

// The single product-tile design used across the storefront: full-bleed
// image, a badge/heart/price always visible, brand+name+available colors
// revealed on hover (or focus, for keyboard users). `aspect`/`sizes`/
// `nameClassName` are the only things that vary between call sites
// (CompactProductCard's hero tiles vs. category/ProductCard's grid) — the
// look itself is intentionally identical everywhere, not per-page.
export default function ProductTile({
  product,
  aspect = "aspect-[3/3.9]",
  sizes = "(max-width: 1024px) 50vw, 25vw",
  eager = false,
  nameClassName = "font-serif text-[21px] font-semibold leading-tight",
}: {
  product: Product;
  aspect?: string;
  sizes?: string;
  eager?: boolean;
  nameClassName?: string;
}) {
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const displayPrice = getEffectivePrice(product.price, product.discountPercent, product.discountEndsAt);
  const badge = productCardBadge(product);

  return (
    <Link
      href={`/product/${product.id}`}
      className={`group relative block ${aspect} overflow-hidden rounded-[18px] bg-stone-100 shadow-[0_16px_45px_rgba(24,19,14,0.16)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_26px_65px_rgba(24,19,14,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred focus-visible:ring-offset-4`}
    >
      <div className="absolute inset-0">
        <Image
          src={product.image}
          alt={product.name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes={sizes}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07] group-focus-visible:scale-[1.07]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/5 opacity-55 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />

        {badge && (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-mahalyred px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cream">
            {badge.label}
          </span>
        )}

        <button
          type="button"
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
          className="absolute right-3 top-3 flex h-9 w-9 translate-y-[-8px] items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft backdrop-blur-sm transition-all duration-300 hover:scale-105 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          <Heart className="h-4 w-4" strokeWidth={1.6} fill={wishlisted ? "#161513" : "none"} color="#161513" />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 p-4 text-white sm:p-5">
        <div className="translate-y-8 opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">{product.brand}</p>
          <h3 className={`mt-1 line-clamp-2 ${nameClassName}`}>{product.name}</h3>
          {product.colors.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5" aria-label="Available colors">
              {product.colors.slice(0, 6).map((color) => (
                <span
                  key={color.name}
                  title={color.name}
                  aria-label={color.name}
                  className="h-3 w-3 rounded-full border border-white/50 ring-1 ring-black/10"
                  style={{ backgroundColor: color.hex }}
                />
              ))}
              {product.colors.length > 6 && (
                <span className="text-[10px] text-white/65">+{product.colors.length - 6}</span>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <p className="inline-flex rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[12px] font-bold shadow-lg backdrop-blur-md">
            {formatPrice(displayPrice, product.currency)}
          </p>
          {displayPrice < product.price && (
            <span className="text-[11px] font-semibold text-white/60 line-through opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
              {formatPrice(product.price, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
