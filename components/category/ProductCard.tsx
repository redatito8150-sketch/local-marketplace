"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Product, ViewMode } from "@/types";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import StarRating from "@/components/shared/StarRating";

export default function ProductCard({
  product,
  viewMode = "grid",
}: {
  product: Product;
  viewMode?: ViewMode;
}) {
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  // A compact card has no size/color picker, so "Add to Cart" here picks a
  // sensible real default instead of the old hardcoded "M" (which silently
  // added a size some products don't even offer, e.g. shoes sized 38-45).
  const variants = product.variants ?? [];
  const defaultVariant =
    variants.find((v) => v.availabilityStatus === "available" && v.quantity > 0) ?? variants[0];
  // Real, matchable value — "" for a sizeless product, matching its
  // variant's `size: null`; formatSize() renders it as "One Size" for
  // display only, never stored as the literal cart/order size.
  const quickAddSize = defaultVariant?.size ?? product.sizes[0] ?? "";

  return (
    <Link
      href={`/product/${product.id}`}
      className={`group block ${
        viewMode === "list" ? "flex items-center gap-5" : ""
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-[16px] bg-beige-50 ${
          viewMode === "list" ? "h-[140px] w-[110px] flex-none" : "aspect-[3/3.9] w-full"
        }`}
      >
        <Image
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          fill
          sizes={viewMode === "list" ? "110px" : "(max-width: 1024px) 50vw, 25vw"}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <button
          aria-label="Add to wishlist"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleItem({
              productId: product.id,
              name: product.name,
              brand: product.brand,
              price: product.price,
              currency: product.currency,
              image: product.image,
            });
          }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur-sm transition-transform hover:scale-105"
        >
          <Heart
            className="h-4 w-4"
            strokeWidth={1.8}
            fill={wishlisted ? "#161513" : "none"}
            color="#161513"
          />
        </button>
      </div>

      <div className={viewMode === "list" ? "flex-1" : "mt-3.5"}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
          {product.brand}
        </p>
        <h3 className="mt-1 text-[14px] font-medium leading-snug text-ink">
          {product.name}
        </h3>
        <p className="mt-1.5 text-[14px] font-semibold text-ink">
          {formatPrice(product.price, product.currency)}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <StarRating rating={product.rating} size="xs" />
          <span className="text-[12px] text-ink-soft/45">
            ({product.reviewCount})
          </span>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addItem({
              productId: product.id,
              variantId: defaultVariant?.id,
              name: product.name,
              brand: product.brand,
              price: defaultVariant?.priceOverride ?? product.price,
              currency: product.currency,
              image: product.image,
              size: quickAddSize,
              color: defaultVariant?.color,
              quantity: 1,
            });
          }}
          disabled={!product.inStock}
          className={`rounded-md bg-ink text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
            viewMode === "list"
              ? "mt-3 px-5 py-2"
              : "mt-3.5 w-full py-2.5"
          }`}
        >
          {product.inStock ? "Add to Cart" : "Sold Out"}
        </button>
      </div>
    </Link>
  );
}
