"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Product, ViewMode } from "@/types";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import StarRating from "@/components/shared/StarRating";

export default function ProductCard({
  product,
  viewMode = "grid",
  compact = false,
  eager = false,
  hideRating = false,
  hideQuickAdd = false,
  showColorDots = false,
  elevated = false,
}: {
  product: Product;
  viewMode?: ViewMode;
  compact?: boolean;
  eager?: boolean;
  hideRating?: boolean;
  hideQuickAdd?: boolean;
  showColorDots?: boolean;
  elevated?: boolean;
}) {
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  // A compact card has no size/color picker, so "Add to Cart" here picks a
  // sensible real default instead of the old hardcoded "M" (which silently
  // added a size some products don't even offer, e.g. shoes sized 38-45).
  const variants = product.variants ?? [];
  const defaultVariant =
    variants.find((v) => isVariantPurchasable(v)) ?? variants[0];
  // Real, matchable value — "" for a sizeless product, matching its
  // variant's Size option being absent; formatSize() renders it as "One
  // Size" for display only, never stored as the literal cart/order size.
  const quickAddSize =
    defaultVariant?.optionValues.find((o) => o.optionTypeName === "Size")?.label ??
    product.sizes[0] ??
    "";
  const quickAddColor = defaultVariant?.optionValues.find((o) => o.optionTypeName === "Color")?.label;

  return (
    <Link
      href={`/product/${product.id}`}
      className={`group block ${
        viewMode === "list" ? "flex items-center gap-5" : ""
      } ${
        elevated
          ? "rounded-[18px] border border-stone-150/80 bg-white p-2.5 pb-1.5 shadow-[0_10px_28px_rgba(69,49,37,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(69,49,37,0.12)]"
          : ""
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-[16px] bg-beige-50 ${
          viewMode === "list" ? "h-[140px] w-[110px] flex-none" : compact ? "aspect-[1.28] w-full rounded-[8px]" : "aspect-[3/3.9] w-full"
        }`}
      >
        <Image
          src={product.image}
          alt={`${product.brand} ${product.name}`}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes={viewMode === "list" ? "110px" : "(max-width: 1024px) 50vw, 25vw"}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {product.isNew && (
          <span className={`absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cream ${compact ? "left-2 top-2 px-2 py-0.5" : ""}`}>
            New
          </span>
        )}

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
              price: product.price,
              currency: product.currency,
              image: product.image,
            });
          }}
          className={`absolute flex items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur-sm transition-transform hover:scale-105 ${compact ? "right-2 top-2 h-7 w-7" : "right-3 top-3 h-8 w-8"}`}
        >
          <Heart
            className="h-4 w-4"
            strokeWidth={1.8}
            fill={wishlisted ? "#161513" : "none"}
            color="#161513"
          />
        </button>
      </div>

      <div className={viewMode === "list" ? "flex-1" : compact ? "rounded-b-[8px] border border-t-0 border-stone-150 px-3 pb-2.5 pt-2" : elevated ? "mt-2" : "mt-3.5"}>
        {showColorDots ? (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
              {product.brand}
            </p>
            {product.colors.length > 0 && (
              <div className="flex shrink-0 items-center gap-1.5" aria-label="Available colors">
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
                  <span className="ml-0.5 text-[10px] text-ink-soft/50">
                    +{product.colors.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className={`${compact ? "hidden" : "block"} text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50`}>
            {product.brand}
          </p>
        )}
        <h3 className={`${compact ? "truncate text-[11px]" : elevated ? "mt-0.5 text-[14px]" : "mt-1 text-[14px]"} font-medium leading-snug text-ink`}>
          {product.name}
        </h3>
        <p className={`${compact ? "mt-1 text-[11px]" : elevated ? "mt-1 text-[14px]" : "mt-1.5 text-[14px]"} font-semibold text-ink`}>
          {formatPrice(product.price, product.currency)}
        </p>

        <div className={`${compact || hideRating ? "hidden" : "flex"} mt-1.5 items-center gap-1.5`}>
          <StarRating rating={product.rating} size="xs" />
          <span className="text-[12px] text-ink-soft/45">
            ({product.reviewCount})
          </span>
        </div>

        {!compact && !hideQuickAdd && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addItem({
              productId: product.id,
              variantId: defaultVariant?.id,
              name: product.name,
              brand: product.brand,
              brandSlug: product.brandSlug ?? "",
              price: defaultVariant?.variantPrice ?? product.price,
              currency: product.currency,
              image: product.image,
              size: quickAddSize,
              color: quickAddColor,
              quantity: 1,
              availableSizes: product.sizes,
              availableColors: product.colors.map((c) => c.name),
            });
          }}
          disabled={!product.inStock}
          className={
            "rounded-md bg-ink text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 " +
            (viewMode === "list" ? "mt-3 px-5 py-2" : "mt-3.5 w-full py-2.5")
          }
        >
          {product.inStock ? "Add to Cart" : "Sold Out"}
        </button>
        )}
        {compact && product.colors.length > 0 && <div className="mt-2 flex gap-1">{product.colors.slice(0, 4).map((color) => <span key={color.name} title={color.name} className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />)}</div>}
      </div>
    </Link>
  );
}
