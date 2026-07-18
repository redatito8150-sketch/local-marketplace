"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Minus, Plus, Check, Truck } from "lucide-react";
import { ProductDetail } from "@/types";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import StarRating from "@/components/shared/StarRating";

export default function ProductInfo({
  product,
  disableActions = false,
}: {
  product: ProductDetail;
  // Used by the admin live-preview panel, which reuses this component
  // as-is: without this, its Add to Cart/Wishlist buttons would mutate
  // the admin's own real cart/wishlist (those contexts are global). Default
  // stays false so the real product page's behavior is unchanged.
  disableActions?: boolean;
}) {
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [sizeError, setSizeError] = useState(false);

  const brandHref = product.brandSlug
    ? `/brands/${product.brandSlug}`
    : undefined;

  const handleAddToCart = () => {
    if (disableActions) return;
    if (!selectedSize) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    addItem({
      productId: product.id,
      name: product.name,
      brand: product.brandName,
      price: product.price,
      currency: product.currency,
      image: product.images[0],
      size: selectedSize,
      color: selectedColor,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  };

  return (
    <div className="lg:pl-6">
      {brandHref ? (
        <Link
          href={brandHref}
          className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft/60 transition-colors hover:text-ink"
        >
          {product.brandName}
        </Link>
      ) : (
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft/60">
          {product.brandName}
        </p>
      )}

      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tightest text-ink lg:text-[2.1rem]">
        {product.name}
      </h1>

      <div className="mt-3 flex items-center gap-3">
        <StarRating rating={product.rating} size="sm" />
        <a
          href="#reviews"
          className="text-[13px] text-ink-soft/60 underline-offset-2 hover:underline"
        >
          {product.reviewCount} reviews
        </a>
      </div>

      <p className="mt-5 text-2xl font-semibold text-ink">
        {formatPrice(product.price, product.currency)}
      </p>

      {/* Color selector */}
      {product.colors.length > 0 && (
        <div className="mt-7">
          <p className="text-[13px] font-medium text-ink">
            Color
            {selectedColor && (
              <span className="ml-1.5 text-ink-soft/50">— {selectedColor}</span>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            {product.colors.map((color) => (
              <button
                key={color.name}
                aria-label={color.name}
                onClick={() => setSelectedColor(color.name)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                  selectedColor === color.name
                    ? "border-ink ring-2 ring-ink/20"
                    : "border-stone-150 hover:border-ink/40"
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full border border-black/10"
                  style={{ backgroundColor: color.hex }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size selector */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink">Size</p>
          <button className="text-[12px] text-ink-soft/60 underline-offset-2 hover:underline">
            Size guide
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {product.sizes.map((size) => {
            const unavailable = product.unavailableSizes.includes(size);
            return (
              <button
                key={size}
                disabled={unavailable}
                title={unavailable ? "Currently unavailable" : undefined}
                onClick={() => {
                  if (unavailable) return;
                  setSelectedSize(size);
                  setSizeError(false);
                }}
                className={`relative flex h-10 min-w-[2.5rem] items-center justify-center overflow-hidden rounded-md border px-3 text-[13px] font-medium transition-colors ${
                  unavailable
                    ? "cursor-not-allowed border-stone-200 bg-stone-200 text-ink-soft/40"
                    : selectedSize === size
                    ? "border-ink bg-ink text-cream"
                    : "border-stone-150 text-ink hover:border-ink/40"
                }`}
              >
                {size}
                {unavailable && (
                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink-soft/40" />
                )}
              </button>
            );
          })}
        </div>
        {sizeError && (
          <p className="mt-2 text-[12px] font-medium text-red-600">
            Please select a size to continue.
          </p>
        )}
      </div>

      {/* Quantity + Add to cart */}
      <div className="mt-8 flex items-center gap-3">
        <div className="flex items-center rounded-md border border-stone-150">
          <button
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-11 w-10 items-center justify-center text-ink transition-colors hover:bg-stone-50"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <span className="w-8 text-center text-[14px] font-medium text-ink">
            {quantity}
          </span>
          <button
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-11 w-10 items-center justify-center text-ink transition-colors hover:bg-stone-50"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <button
          onClick={handleAddToCart}
          disabled={disableActions}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-[14px] font-semibold transition-all ${
            added ? "bg-green-700 text-white" : "bg-ink text-cream hover:scale-[1.01]"
          } ${disableActions ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {added ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Added to Cart
            </>
          ) : (
            "Add to Cart"
          )}
        </button>

        <button
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          disabled={disableActions}
          onClick={() => {
            if (disableActions) return;
            toggleItem({
              productId: product.id,
              name: product.name,
              brand: product.brandName,
              price: product.price,
              currency: product.currency,
              image: product.images[0],
            });
          }}
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-md border border-stone-150 transition-colors hover:bg-stone-50 ${
            disableActions ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          <Heart
            className="h-[18px] w-[18px]"
            strokeWidth={1.8}
            fill={wishlisted ? "#161513" : "none"}
            color="#161513"
          />
        </button>
      </div>

      {/* Shipping note */}
      <div className="mt-7 flex items-start gap-2.5 rounded-lg bg-stone-50 p-4">
        <Truck className="mt-0.5 h-4 w-4 flex-none text-ink-soft/60" strokeWidth={1.6} />
        <p className="text-[12.5px] leading-relaxed text-ink-soft/70">
          {product.shippingReturns}
        </p>
      </div>

      <p className="mt-5 text-[12px] text-ink-soft/40">SKU: {product.sku}</p>
    </div>
  );
}
