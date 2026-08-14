"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Heart, Minus, Plus, Check, Truck } from "lucide-react";
import { ProductDetail } from "@/types";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { formatPrice } from "@/lib/format";
import { getVariantEffectivePrice } from "@/lib/pricing";
import { calculateStockStatus, effectiveLowStockThreshold, isVariantPurchasable } from "@/lib/inventory/stockStatus";
import StarRating from "@/components/shared/StarRating";
import ColorSwatch from "@/components/admin/ColorSwatch";

export default function ProductInfo({
  product,
  disableActions = false,
  disabledActionReason,
  onColorImageChange,
  onVariantPreviewChange,
  signedIn = false,
  subscribedVariantIds = [],
}: {
  product: ProductDetail;
  // Used by the admin live-preview panel, which reuses this component
  // as-is: without this, its Add to Cart/Wishlist buttons would mutate
  // the admin's own real cart/wishlist (those contexts are global). Default
  // stays false so the real product page's behavior is unchanged.
  disableActions?: boolean;
  disabledActionReason?: string;
  // Reports the mapped image for the currently selected Color (if any) up
  // to the page, which passes it to ProductGallery as `featuredImage` —
  // this is the only way a Color selection is allowed to affect the
  // gallery's primary image (never the reverse).
  onColorImageChange?: (url: string | undefined) => void;
  onVariantPreviewChange?: (selection: { variantId?: string; sku?: string; color?: string; size?: string; quantity?: number; displayPrice: number }) => void;
  // Whether the viewer is signed in, and which of this product's variants
  // they already have a "notify me" subscription on (resolved server-side
  // — see app/product/[id]/page.tsx and lib/backInStock.ts) — both feed
  // the Add to Cart -> Notify Me swap below.
  signedIn?: boolean;
  subscribedVariantIds?: string[];
}) {
  const router = useRouter();
  const { items: cartItems, addItem } = useCart();
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
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  // Variants subscribed to during THIS visit — merged with the
  // server-resolved subscribedVariantIds prop so the button flips to "You're
  // on the list" immediately, without needing a reload, whichever variant
  // is currently selected.
  const [justSubscribedIds, setJustSubscribedIds] = useState<Set<string>>(new Set());

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

  // Ticks every second so an active discount's countdown actually counts
  // down, and so the price/badge flip back to the base price the instant
  // it expires — without this the component would only re-evaluate
  // isDiscountActive/getEffectivePrice (both default to `new Date()` at
  // call time) on the next unrelated re-render or page refresh.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!product.discountEndsAt) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [product.discountEndsAt]);

  // A variant discount (e.g. one color on sale) and the product's own
  // discount are mutually exclusive — getVariantEffectivePrice picks
  // whichever one actually applies to the selected variant.
  const priceResult = getVariantEffectivePrice(
    product.price,
    resolvedVariant?.variantPrice,
    product.discountPercent,
    product.discountEndsAt,
    resolvedVariant?.variantDiscountPercent,
    now
  );
  const baseDisplayPrice = resolvedVariant?.variantPrice ?? product.price;
  const onOffer = priceResult.active;
  const displayPrice = priceResult.price;
  const savings = onOffer ? baseDisplayPrice - displayPrice : 0;
  // The countdown only makes sense for the product-level, time-bound
  // discount — a variant discount has no end time of its own.
  const usingProductDiscount = onOffer && !resolvedVariant?.variantDiscountPercent;
  const countdownLabel = (() => {
    if (!usingProductDiscount || !product.discountEndsAt) return null;
    const msLeft = new Date(product.discountEndsAt).getTime() - now.getTime();
    if (msLeft <= 0) return null;
    const totalSeconds = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m left`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s left`;
    return `${minutes}m ${seconds}s left`;
  })();

  useEffect(() => {
    onVariantPreviewChange?.({
      variantId: resolvedVariant?.id,
      sku: resolvedVariant?.sku,
      color: selectedColor,
      size: selectedSize ?? undefined,
      quantity: resolvedVariant?.quantity,
      displayPrice,
    });
  }, [displayPrice, onVariantPreviewChange, resolvedVariant, selectedColor, selectedSize]);

  useEffect(() => {
    onColorImageChange?.(selectedColor ? product.colorImages?.[selectedColor] : undefined);
  }, [selectedColor, product.colorImages, onColorImageChange]);

  // Two distinct "can't pick this" reasons, styled differently:
  //  - "not_offered": this size doesn't exist at all under the selected
  //    color (e.g. "L" only exists under Red, not under White) — a
  //    different color shouldn't make its sizes look pickable elsewhere.
  //  - "out_of_stock": the size exists for this color, but every matching
  //    variant is out of stock, paused, or discontinued.
  const sizeAvailability = (size: string): "available" | "not_offered" | "out_of_stock" => {
    const existsForColor = variants.some((v) => {
      const vSize = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "size")?.label;
      const vColor = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "color")?.label;
      return vSize === size && (!selectedColor || vColor === selectedColor);
    });
    if (!existsForColor) return "not_offered";

    const matching = variants.filter((v) => {
      const vSize = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "size")?.label;
      const vColor = v.optionValues.find((o) => o.optionTypeName.toLowerCase() === "color")?.label;
      return vSize === size && (!selectedColor || vColor === selectedColor) &&
        Object.entries(selectedCustom).every(([typeId, label]) => v.optionValues.some((option) => option.optionTypeId === typeId && option.label === label));
    });
    if (matching.length === 0) return "available";
    const purchasable = matching.some((v) => isVariantPurchasable({ sellingStatus: v.sellingStatus, quantity: v.quantity, isArchived: v.isArchived, productStatus: product.status }));
    return purchasable ? "available" : "out_of_stock";
  };

  const effectiveThreshold = resolvedVariant
    ? effectiveLowStockThreshold(resolvedVariant.lowStockThresholdOverride, product.defaultLowStockThreshold ?? 5)
    : 0;
  const isLowStock =
    Boolean(resolvedVariant) && calculateStockStatus(resolvedVariant!.quantity, effectiveThreshold) === "low_stock";

  // How many of this exact variant are already sitting in the cart from an
  // earlier visit/add — Add to Cart merges into that same line (see
  // CartContext's addItem), so the real remaining cap has to subtract it,
  // not just check the variant's total stock in isolation.
  const alreadyInCart = useMemo(() => {
    if (!resolvedVariant) return 0;
    return cartItems
      .filter((i) => i.variantId === resolvedVariant.id)
      .reduce((sum, i) => sum + i.quantity, 0);
  }, [cartItems, resolvedVariant]);

  // The real cap on how many more of the selected Color+Size can actually
  // be added right now — undefined (no cap) only for a product with no
  // variants at all to check against.
  const maxQuantity = resolvedVariant ? Math.max(0, resolvedVariant.quantity - alreadyInCart) : undefined;
  const atCartLimit = maxQuantity === 0;
  useEffect(() => {
    if (maxQuantity !== undefined && quantity > Math.max(1, maxQuantity)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuantity(Math.max(1, maxQuantity));
    }
    // Only re-clamp when the selected variant/cart cap changes — never
    // fight the shopper's own +/- clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxQuantity]);

  // The primary button becomes "Notify Me When Available" whenever the
  // resolved purchase intent hits a genuinely *out-of-stock* variant — the
  // specific Color+Size selected (or, before any selection, the product as
  // a whole when literally every combination is sold out). It never
  // applies to a "not offered in this color" combination, since there's
  // nothing to restock there — that's just not a real product variant.
  const resolvedVariantOutOfStock =
    Boolean(resolvedVariant) &&
    !isVariantPurchasable({
      sellingStatus: resolvedVariant!.sellingStatus,
      quantity: resolvedVariant!.quantity,
      isArchived: resolvedVariant!.isArchived,
      productStatus: product.status,
    });
  const primaryOutOfStock = resolvedVariantOutOfStock || (!resolvedVariant && !product.inStock);
  const isSubscribedToResolvedVariant = Boolean(
    resolvedVariant && (subscribedVariantIds.includes(resolvedVariant.id) || justSubscribedIds.has(resolvedVariant.id))
  );

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
    if (atCartLimit) {
      setSizeError(true);
      return;
    }
    setSizeError(false);
    addItem({
      productId: product.id,
      variantId: resolvedVariant?.id,
      name: product.name,
      brand: product.brandName,
      brandSlug: product.brandSlug ?? "",
      price: displayPrice,
      currency: product.currency,
      // The selected Color's own photo when there is one (same mapping
      // ProductGallery/ProductAccordion use), not always the product's
      // generic cover — so the cart/checkout actually show what was
      // ordered.
      image: (selectedColor && product.colorImages?.[selectedColor]) || product.images[0],
      // Real, matchable value — a sizeless product's variant has no Size
      // option at all, so this stays "" to match it; formatSize() turns
      // this into "One Size" only where it's shown to the shopper.
      size: selectedSize ?? "",
      color: selectedColor,
      // Defensive clamp — the stepper itself already can't be pushed past
      // maxQuantity, but this is the one place that actually writes to
      // the cart.
      quantity: maxQuantity !== undefined ? Math.min(quantity, maxQuantity) : quantity,
      availableSizes: product.sizes,
      availableColors: colorLabels,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  };

  const handleNotifyMe = async () => {
    if (disableActions) return;
    if (product.sizes.length > 0 && !selectedSize) {
      setSizeError(true);
      return;
    }
    if (!resolvedVariant) return;
    if (isSubscribedToResolvedVariant) return;
    setSizeError(false);
    setNotifyError("");

    if (!signedIn) {
      router.push(`/account?next=${encodeURIComponent(`/product/${product.id}`)}`);
      return;
    }

    setNotifySaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}/notify-restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: resolvedVariant.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotifyError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setJustSubscribedIds((current) => new Set(current).add(resolvedVariant.id));
    } catch {
      setNotifyError("Something went wrong. Please try again.");
    } finally {
      setNotifySaving(false);
    }
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <p className="text-2xl font-semibold text-ink">
          {formatPrice(displayPrice, product.currency)}
        </p>
        {onOffer && baseDisplayPrice > displayPrice && (
          <p className="text-[15px] text-ink-soft/40 line-through">
            {formatPrice(baseDisplayPrice, product.currency)}
          </p>
        )}
        {onOffer && priceResult.percent != null && (
          <span className="group/savings relative inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-600">
            -{Math.round(priceResult.percent)}%
            <span
              tabIndex={0}
              aria-label={`You save ${formatPrice(savings, product.currency)}`}
              className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full bg-red-100 text-[9px] font-bold"
            >
              !
            </span>
            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-cream opacity-0 shadow-xl transition-opacity group-hover/savings:opacity-100 group-focus-within/savings:opacity-100">
              You save {formatPrice(savings, product.currency)}
            </span>
          </span>
        )}
      </div>
      {countdownLabel && (
        <p className="mt-2 text-[12.5px] font-semibold text-red-600">Offer ends in {countdownLabel}</p>
      )}

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
              const availability = sizeAvailability(size);
              // Only "not offered in this color" actually blocks selection
              // — an out-of-stock size is still a real variant, so it stays
              // clickable specifically so it can be selected and then
              // subscribed to via "Notify Me When Available" below.
              const notOffered = availability === "not_offered";
              return (
                <button
                  key={size}
                  disabled={notOffered}
                  title={
                    availability === "not_offered"
                      ? "Not offered in this color"
                      : availability === "out_of_stock"
                      ? "Out of stock — select to get notified when it's back"
                      : undefined
                  }
                  onClick={() => {
                    if (notOffered) return;
                    setSelectedSize(size);
                    setSizeError(false);
                    setNotifyError("");
                  }}
                  className={`relative flex h-10 min-w-[2.5rem] items-center justify-center overflow-hidden rounded-md border px-3 text-[13px] font-medium transition-colors ${
                    availability === "not_offered"
                      ? "cursor-not-allowed border-red-200 bg-red-50 text-red-400"
                      : availability === "out_of_stock"
                      ? selectedSize === size
                        ? "border-ink bg-stone-200 text-ink-soft/70 ring-2 ring-ink/15"
                        : "border-stone-200 bg-stone-200 text-ink-soft/40 hover:border-ink/30"
                      : selectedSize === size
                      ? "border-ink bg-ink text-cream"
                      : "border-stone-150 text-ink hover:border-ink/40"
                  }`}
                >
                  {size}
                  {availability === "not_offered" && (
                    <>
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-300" />
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-300" />
                    </>
                  )}
                  {availability === "out_of_stock" && (
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
            disabled={maxQuantity !== undefined && quantity >= maxQuantity}
            onClick={() => setQuantity((q) => (maxQuantity !== undefined ? Math.min(q + 1, maxQuantity) : q + 1))}
            className="flex h-11 w-10 items-center justify-center text-ink transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <button
          onClick={primaryOutOfStock ? handleNotifyMe : handleAddToCart}
          disabled={
            disableActions ||
            notifySaving ||
            (primaryOutOfStock && isSubscribedToResolvedVariant) ||
            (!primaryOutOfStock && atCartLimit)
          }
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-[14px] font-semibold transition-all ${
            added || (primaryOutOfStock && isSubscribedToResolvedVariant) ? "bg-green-700 text-white" : "bg-mahalyred text-cream hover:scale-[1.01]"
          } ${disableActions || notifySaving || (!primaryOutOfStock && atCartLimit) ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {primaryOutOfStock ? (
            isSubscribedToResolvedVariant ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                We&apos;ll notify you
              </>
            ) : notifySaving ? (
              "Saving…"
            ) : (
              <>
                <Bell className="h-4 w-4" strokeWidth={2} />
                Notify Me When Available
              </>
            )
          ) : added ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Added to Cart
            </>
          ) : atCartLimit ? (
            "All in stock is in your cart"
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
              brandSlug: product.brandSlug,
              price: displayPrice,
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
            fill={wishlisted ? "#242424" : "none"}
            color="#242424"
          />
        </button>
      </div>
      {disableActions && disabledActionReason && (
        <p role="note" className="mt-2 text-center text-[11.5px] font-medium text-ink-soft/60">
          {disabledActionReason}
        </p>
      )}
      {notifyError && (
        <p className="mt-2 text-center text-[12px] font-medium text-red-600">{notifyError}</p>
      )}
      {primaryOutOfStock && isSubscribedToResolvedVariant && !notifyError && (
        <p className="mt-2 text-center text-[12px] text-ink-soft/60">
          We&apos;ll email you and add a notification to your account the moment it&apos;s back.
        </p>
      )}

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
