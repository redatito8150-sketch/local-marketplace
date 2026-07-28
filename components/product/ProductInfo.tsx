"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Heart, Minus, Plus, Check, Truck } from "lucide-react";
import { ProductDetail } from "@/types";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import { effectiveVariantPrice } from "@/lib/inventory/pricing";
import { calculateStockStatus, effectiveLowStockThreshold, isVariantPurchasable } from "@/lib/inventory/stockStatus";
import StarRating from "@/components/shared/StarRating";
import ColorSwatch from "@/components/admin/ColorSwatch";

export default function ProductInfo({
  product,
  disableActions = false,
  onColorImageChange,
}: {
  product: ProductDetail;
  // Used by the admin live-preview panel, which reuses this component
  // as-is: without this, its Add to Cart/Wishlist buttons would mutate
  // the admin's own real cart/wishlist (those contexts are global). Default
  // stays false so the real product page's behavior is unchanged.
  disableActions?: boolean;
  // Reports the mapped image for the currently selected Color (if any) up
  // to the page, which passes it to ProductGallery as `featuredImage` —
  // this is the only way a Color selection is allowed to affect the
  // gallery's primary image (never the reverse).
  onColorImageChange?: (url: string | undefined) => void;
}) {
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const colorLabels = [...new Set(variants.flatMap((v) => v.optionValues.filter((o) => o.optionTypeName.toLowerCase() === "color").map((o) => o.label)))];
  const customOptionGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; values: string[] }>();
    for (const variant of variants) for (const option of variant.optionValues) {
      if (["color", "size"].includes(option.optionTypeName.toLowerCase())) continue;
      const group = groups.get(option.optionTypeId) ?? { id: option.optionTypeId, name: option.optionTypeName, values: [] };
      if (!group.values.includes(option.label)) group.values.push(option.label);
      groups.set(option.optionTypeId, group);
    }
    return [...groups.values()];
  }, [variants]);

  const [selectedColor, setSelectedColor] = useState<string | undefined>(colorLabels[0]);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedCustom, setSelectedCustom] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [sizeError, setSizeError] = useState(false);

  const brandHref = product.brandSlug
    ? `/brands/${product.brandSlug}`
    : undefined;

  const hasVariants = variants.length > 0;

  // Resolves the exact selected Color+Size combination to a specific
  // variant, so Variant Price/purchasability/low-stock reflect that one
  // combination instead of the whole product.
  const resolvedVariant = useMemo(() => {
    if (!hasVariants) return undefined;
    return variants.find((v) => {
      const color = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "color")?.label;
      const size = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "size")?.label;
      return (color ?? "") === (selectedColor ?? "") &&
        (size ?? "") === (selectedSize ?? "") &&
        customOptionGroups.every((group) => v.optionValues.some((option) => option.optionTypeId === group.id && option.label === selectedCustom[group.id]));
    });
  }, [hasVariants, variants, selectedColor, selectedSize, selectedCustom, customOptionGroups]);

  const displayPrice = effectiveVariantPrice(resolvedVariant?.variantPrice, product.price);

  useEffect(() => {
    onColorImageChange?.(selectedColor ? product.colorImages?.[selectedColor] : undefined);
  }, [selectedColor, product.colorImages, onColorImageChange]);

  // A size is disabled once every variant for it (under the selected
  // color, when one's picked) is out of stock, paused, or discontinued.
  const isSizeDisabled = (size: string): boolean => {
    const matching = variants.filter((v) => {
      const vSize = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "size")?.label;
      const vColor = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "color")?.label;
      return vSize === size && (!selectedColor || vColor === selectedColor) &&
        Object.entries(selectedCustom).every(([typeId, label]) => v.optionValues.some((option) => option.optionTypeId === typeId && option.label === label));
    });
    if (matching.length === 0) return false;
    return !matching.some((v) => isVariantPurchasable({ sellingStatus: v.sellingStatus, quantity: v.quantity, isArchived: v.isArchived, productStatus: product.status }));
  };

  const effectiveThreshold = resolvedVariant
    ? effectiveLowStockThreshold(resolvedVariant.lowStockThresholdOverride, product.defaultLowStockThreshold ?? 5)
    : 0;
  const isLowStock =
    Boolean(resolvedVariant) && calculateStockStatus(resolvedVariant!.quantity, effectiveThreshold) === "low_stock";

  const handleAddToCart = () => {
    if (disableActions) return;
    // A product with no sizes at all (a single default variant) has
    // nothing for the shopper to click to set selectedSize — only require
    // a selection when there's actually a size list to pick from.
    if (product.sizes.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    if (
      hasVariants &&
      (!resolvedVariant ||
        !isVariantPurchasable({
          sellingStatus: resolvedVariant.sellingStatus,
          quantity: resolvedVariant.quantity,
          isArchived: resolvedVariant.isArchived,
          productStatus: product.status,
        }))
    ) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    addItem({
      productId: product.id,
      variantId: resolvedVariant?.id,
      name: product.name,
      brand: product.brandName,
      price: displayPrice,
      currency: product.currency,
      image: product.images[0],
      // Real, matchable value — a sizeless product's variant has no Size
      // option at all, so this stays "" to match it; formatSize() turns
      // this into "One Size" only where it's shown to the shopper.
      size: selectedSize ?? "",
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

      <div className="mt-5 flex items-center gap-3">
        <p className="text-2xl font-semibold text-ink">
          {formatPrice(displayPrice, product.currency)}
        </p>
        {typeof product.compareAtPrice === "number" && product.compareAtPrice > displayPrice && (
          <p className="text-[15px] text-ink-soft/40 line-through">
            {formatPrice(product.compareAtPrice, product.currency)}
          </p>
        )}
      </div>

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
                onClick={() => {
                  setSelectedColor(color.name);
                  // A different Color's Size availability may differ —
                  // preserve the current Size if it's still valid for the
                  // newly selected Color, otherwise clear it and ask for a
                  // new selection rather than guessing one.
                  if (selectedSize) {
                    const stillValid = variants.some((v) => {
                      const vColor = v.optionValues.find((o) => o.optionTypeName === "Color")?.label;
                      const vSize = v.optionValues.find((o) => o.optionTypeName === "Size")?.label;
                      return vColor === color.name && vSize === selectedSize;
                    });
                    if (!stillValid) setSelectedSize(null);
                  }
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                  selectedColor === color.name
                    ? "border-ink ring-2 ring-ink/20"
                    : "border-stone-150 hover:border-ink/40"
                }`}
              >
                <ColorSwatch swatchType={color.swatchType} primaryColor={color.hex} secondaryColor={color.secondaryColor} size={20} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size selector */}
      {product.sizes.length > 0 && (
        <div className="mt-7">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink">Size</p>
            <button className="text-[12px] text-ink-soft/60 underline-offset-2 hover:underline">
              Size guide
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {product.sizes.map((size) => {
              const unavailable = isSizeDisabled(size);
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
          {isLowStock && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
              Only {resolvedVariant!.quantity} left in stock
            </p>
          )}
        </div>
      )}

      {customOptionGroups.map((group) => (
        <div className="mt-7" key={group.id}>
          <p className="text-[13px] font-medium text-ink">{group.name}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {group.values.map((choice) => {
              const available = variants.some((variant) => {
                const color = variant.optionValues.find((option) => option.optionTypeName.toLowerCase() === "color")?.label;
                const size = variant.optionValues.find((option) => option.optionTypeName.toLowerCase() === "size")?.label;
                return variant.optionValues.some((option) => option.optionTypeId === group.id && option.label === choice) &&
                  (!selectedColor || color === selectedColor) && (!selectedSize || size === selectedSize);
              });
              return <button key={choice} type="button" disabled={!available} onClick={() => setSelectedCustom((current) => ({ ...current, [group.id]: choice }))} className={`rounded-md border px-3 py-2 text-[13px] ${selectedCustom[group.id] === choice ? "border-ink bg-ink text-cream" : "border-stone-150"} disabled:cursor-not-allowed disabled:opacity-35`}>{choice}</button>;
            })}
          </div>
        </div>
      ))}

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
