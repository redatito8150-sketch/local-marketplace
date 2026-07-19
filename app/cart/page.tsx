"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, X, ShoppingBag, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { formatPrice, formatSize } from "@/lib/format";
export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const isEmpty = items.length === 0;

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
          Your Cart
        </h1>

        {isEmpty ? (
          <div className="mt-16 flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-ink-soft/30" strokeWidth={1.4} />
            <p className="mt-5 text-lg font-medium text-ink">Your cart is empty</p>
            <p className="mt-1.5 max-w-xs text-sm text-ink-soft/60">
              Explore local brands and add something you love.
            </p>
            <Link
              href="/shop/women"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
            >
              Start Shopping
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
            {/* Line items */}
            <div className="divide-y divide-stone-150">
              {items.map((item) => (
                <div key={item.id} className="flex gap-5 py-6">
                  <div className="relative h-28 w-24 flex-none overflow-hidden rounded-[14px] bg-beige-50">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                          {item.brand}
                        </p>
                        <p className="mt-1 text-[15px] font-medium text-ink">
                          {item.name}
                        </p>
                        <p className="mt-1 text-[12.5px] text-ink-soft/60">
                          Size: {formatSize(item.size)}
                          {item.color ? ` · Color: ${item.color}` : ""}
                        </p>
                      </div>
                      <button
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeItem(item.id)}
                        className="rounded-full p-1.5 text-ink-soft/50 transition-colors hover:bg-stone-100 hover:text-ink"
                      >
                        <X className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-stone-150">
                        <button
                          aria-label="Decrease quantity"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:bg-stone-50"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <span className="w-8 text-center text-[13px] font-medium text-ink">
                          {item.quantity}
                        </span>
                        <button
                          aria-label="Increase quantity"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:bg-stone-50"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>

                      <p className="text-[14px] font-semibold text-ink">
                        {formatPrice(item.price * item.quantity, item.currency)}
                      </p>
                    </div>
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
                  <span>Shipping</span>
                  <span className="font-medium text-ink">Calculated at checkout</span>
                </div>
              </div>

              <Link
                href="/checkout"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>

              {subtotal.usd > 0 && subtotal.egp > 0 && (
                <p className="mt-4 text-center text-[12px] text-ink-soft/50">
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
