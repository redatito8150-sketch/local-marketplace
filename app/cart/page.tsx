"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Minus, Plus, X, ShoppingBag, ArrowRight, Truck, Store } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPrice, formatSize } from "@/lib/format";
import { useShippingPreview } from "@/lib/hooks/useShippingPreview";
import { groupItemsByFulfillment, shipmentShippingFee } from "@/lib/cart/fulfillmentGroups";
import { getCartValidationData, resolveCartLine, type CartValidationEntry } from "@/lib/cart/liveValidation";
import type { CartLineItem } from "@/types";

export default function CartPage() {
  const { items, removeItem, updateQuantity, updateVariant, subtotal } = useCart();
  const isEmpty = items.length === 0;
  const { partnerFlagsBySlug, shippingSettings } = useShippingPreview(
    items.map((i) => i.brandSlug).filter(Boolean)
  );
  const groups = groupItemsByFulfillment(items, partnerFlagsBySlug);
  const totalShippingEgp = groups.reduce(
    (sum, g) =>
      sum + shipmentShippingFee(g, shippingSettings.flatDeliveryFeeEgp, shippingSettings.freeShippingThresholdEgp),
    0
  );

  // Re-checks every line against current stock/price/availability — a
  // CartLineItem is a localStorage snapshot from add-to-cart time, which
  // can go stale the moment a brand changes stock, price, or archives/
  // pauses the product. See lib/cart/liveValidation.ts.
  const productIdsKey = [...new Set(items.map((i) => i.productId))].sort().join(",");
  const [liveData, setLiveData] = useState<Map<string, CartValidationEntry> | null>(null);
  const [removedNames, setRemovedNames] = useState<string[]>([]);

  useEffect(() => {
    const ids = productIdsKey ? productIdsKey.split(",") : [];
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveData(new Map());
      return;
    }
    let cancelled = false;
    setLiveData(null);
    getCartValidationData(ids)
      .then((data) => {
        if (!cancelled) setLiveData(data);
      })
      .catch(() => {
        if (!cancelled) setLiveData(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [productIdsKey]);

  // Once live data is in, silently drop any line whose product is no
  // longer available at all (archived/paused/deleted since it was added)
  // — nothing left to do with it in the cart — and sync every remaining
  // line's price/image/variantId to the live values.
  useEffect(() => {
    if (!liveData) return;
    const gone: string[] = [];
    for (const item of items) {
      const entry = liveData.get(item.productId);
      if (entry && !entry.productAvailable) {
        gone.push(item.name);
        removeItem(item.id);
        continue;
      }
      const resolved = resolveCartLine(item, entry);
      if (
        resolved.available &&
        (resolved.livePrice !== item.price || resolved.liveImage !== item.image || resolved.variant?.id !== item.variantId)
      ) {
        updateVariant(item.id, {
          price: resolved.livePrice,
          image: resolved.liveImage,
          variantId: resolved.variant?.id,
        });
      }
    }
    if (gone.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemovedNames((prev) => [...prev, ...gone]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData]);

  const anyUnresolved = items.some((item) => {
    const resolved = resolveCartLine(item, liveData?.get(item.productId));
    return !resolved.available;
  });
  const checkingAvailability = liveData === null;

  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
          Your Cart
        </h1>

        {removedNames.length > 0 && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl3 border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.8} />
            <p>
              {removedNames.join(", ")} {removedNames.length === 1 ? "was" : "were"} removed from your cart —
              no longer available.
            </p>
          </div>
        )}

        {isEmpty ? (
          <div className="mt-16 flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-ink-soft/30" strokeWidth={1.4} />
            <p className="mt-5 text-lg font-medium text-ink">Your cart is empty</p>
            <p className="mt-1.5 max-w-xs text-sm text-ink-soft/60">
              Explore local brands and add something you love.
            </p>
            <Link
              href="/shop/women"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
            >
              Start Shopping
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
            {/* Line items, grouped by shipment */}
            <div className="space-y-8">
              {groups.map((group) => (
                <div key={group.key} className="rounded-xl3 border border-stone-150">
                  <div className="flex items-center justify-between gap-3 border-b border-stone-150 bg-stone-50 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {group.isPool ? (
                        <Truck className="h-4 w-4 text-ink-soft/60" strokeWidth={1.7} />
                      ) : (
                        <Store className="h-4 w-4 text-ink-soft/60" strokeWidth={1.7} />
                      )}
                      <div>
                        <p className="text-[13.5px] font-semibold text-ink">
                          {group.isPool
                            ? group.brandNames.length > 1
                              ? `${group.brandNames.join(", ")} — Mahaly Partners`
                              : `${group.brandNames[0] ?? "Mahaly"} — Mahaly Partner`
                            : group.brandNames[0] ?? "Brand"}
                        </p>
                        <p className="text-[11.5px] text-ink-soft/55">
                          {group.isPool
                            ? "Fulfilled from Mahaly's warehouse — ships as one shipment."
                            : "Packed by the brand — ships as its own shipment. Delivered by Mahaly."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-stone-150 px-5">
                    {group.items.map((item) => (
                      <CartLine
                        key={item.id}
                        item={item}
                        entry={liveData?.get(item.productId)}
                        loading={checkingAvailability}
                        onRemove={() => removeItem(item.id)}
                        onQuantity={(q) => updateQuantity(item.id, q)}
                        onVariant={(next) => updateVariant(item.id, next)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="h-fit rounded-xl3 bg-stone-50 p-7">
              <h2 className="text-lg font-semibold text-ink">Order Summary</h2>

              <div className="mt-5 space-y-2.5 text-[13.5px] text-ink-soft/75">
                {subtotal.usd > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Subtotal (USD)</span>
                    <span className="font-medium text-ink">
                      ${subtotal.usd.toFixed(2)}
                    </span>
                  </div>
                )}
                {subtotal.egp > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Subtotal (EGP)</span>
                    <span className="font-medium text-ink">
                      {subtotal.egp.toLocaleString("en-US")} EGP
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>
                    Delivery{" "}
                    {groups.length > 1 && (
                      <span className="text-[11.5px] text-ink-soft/50">
                        ({groups.length} shipments)
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-ink">
                    {totalShippingEgp > 0
                      ? `${totalShippingEgp.toLocaleString("en-US")} EGP`
                      : "Free"}
                  </span>
                </div>
              </div>

              {checkingAvailability ? (
                <button
                  disabled
                  className="mt-7 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-mahalyred/50 py-3.5 text-[14px] font-semibold text-cream"
                >
                  Checking availability…
                </button>
              ) : anyUnresolved ? (
                <>
                  <button
                    disabled
                    className="mt-7 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-mahalyred/50 py-3.5 text-[14px] font-semibold text-cream"
                  >
                    Proceed to Checkout
                  </button>
                  <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[12px] font-medium text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
                    Resolve the out-of-stock item(s) above before checking out.
                  </p>
                </>
              ) : (
                <Link
                  href="/checkout"
                  className="mt-7 flex w-full items-center justify-center gap-2 rounded-md bg-mahalyred py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
                >
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              )}

              {groups.length > 1 && (
                <p className="mt-4 text-center text-[12px] text-ink-soft/50">
                  Items from different brands ship — and are billed for delivery — separately, one order per shipment.
                </p>
              )}
              {subtotal.usd > 0 && subtotal.egp > 0 && (
                <p className="mt-2 text-center text-[12px] text-ink-soft/50">
                  Multiple currencies are settled separately at checkout.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}

function CartLine({
  item,
  entry,
  loading,
  onRemove,
  onQuantity,
  onVariant,
}: {
  item: CartLineItem;
  entry: CartValidationEntry | undefined;
  loading: boolean;
  onRemove: () => void;
  onQuantity: (quantity: number) => void;
  onVariant: (next: { size?: string; color?: string; variantId?: string; price?: number; image?: string }) => void;
}) {
  const resolved = resolveCartLine(item, entry);
  const purchasableVariants = useMemo(() => entry?.variants.filter((v) => v.purchasable) ?? [], [entry]);
  const colorsAvailable = useMemo(
    () => [...new Set(purchasableVariants.map((v) => v.color).filter((c): c is string => Boolean(c)))],
    [purchasableVariants]
  );
  const sizesForCurrentColor = useMemo(
    () => purchasableVariants.filter((v) => !item.color || v.color === item.color).map((v) => v.size),
    [purchasableVariants, item.color]
  );
  const maxQuantity = resolved.maxQuantity;
  const atMax = maxQuantity !== undefined && item.quantity >= maxQuantity;

  const handleColorChange = (newColor: string) => {
    const variant = purchasableVariants.find((v) => v.color === newColor);
    if (!variant || !entry) return;
    onVariant({
      color: newColor,
      size: variant.size,
      variantId: variant.id,
      price: variant.price,
      image: entry.colorImages[newColor] ?? entry.image,
    });
  };

  const handleSizeChange = (newSize: string) => {
    const variant = purchasableVariants.find((v) => v.size === newSize && (!item.color || v.color === item.color));
    if (!variant) return;
    onVariant({ size: newSize, variantId: variant.id, price: variant.price });
  };

  return (
    <div className="flex gap-5 py-6">
      <div className="relative h-28 w-24 flex-none overflow-hidden rounded-[14px] bg-beige-50">
        <Image src={item.image} alt={item.name} fill sizes="96px" className="object-cover" />
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium text-ink">{item.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {!loading && sizesForCurrentColor.length > 1 ? (
                <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft/60">
                  Size
                  <select
                    value={item.size}
                    onChange={(e) => handleSizeChange(e.target.value)}
                    className="rounded-md border border-stone-150 bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-ink/30"
                  >
                    {/* The line's current size always appears, even if it's
                        no longer purchasable — otherwise the select would
                        silently show a different value than what's actually
                        in the cart. */}
                    {!sizesForCurrentColor.includes(item.size) && (
                      <option value={item.size}>{formatSize(item.size)} (unavailable)</option>
                    )}
                    {sizesForCurrentColor.map((size) => (
                      <option key={size} value={size}>
                        {formatSize(size)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-[12.5px] text-ink-soft/60">Size: {formatSize(item.size)}</span>
              )}
              {!loading && colorsAvailable.length > 1 ? (
                <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft/60">
                  Color
                  <select
                    value={item.color ?? ""}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="rounded-md border border-stone-150 bg-white px-2 py-1 text-[12.5px] text-ink outline-none focus:border-ink/30"
                  >
                    {item.color && !colorsAvailable.includes(item.color) && (
                      <option value={item.color}>{item.color} (unavailable)</option>
                    )}
                    {colorsAvailable.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                item.color && <span className="text-[12.5px] text-ink-soft/60">· {item.color}</span>
              )}
            </div>
            {!loading && resolved.reason === "out_of_stock" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
                Out of stock — choose another size/color or remove it.
              </p>
            )}
          </div>
          <button
            aria-label={`Remove ${item.name}`}
            onClick={onRemove}
            className="rounded-full p-1.5 text-ink-soft/50 transition-colors hover:bg-stone-100 hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="flex items-center rounded-md border border-stone-150">
              <button
                aria-label="Decrease quantity"
                onClick={() => onQuantity(item.quantity - 1)}
                className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:bg-stone-50"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <span className="w-8 text-center text-[13px] font-medium text-ink">{item.quantity}</span>
              <button
                aria-label="Increase quantity"
                disabled={atMax}
                onClick={() => onQuantity(maxQuantity !== undefined ? Math.min(item.quantity + 1, maxQuantity) : item.quantity + 1)}
                className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
            {!loading && maxQuantity !== undefined && maxQuantity <= 5 && (
              <p className="mt-1 text-[11px] text-ink-soft/50">Only {maxQuantity} left</p>
            )}
          </div>

          <p className="text-[14px] font-semibold text-ink">
            {formatPrice(item.price * item.quantity, item.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
