"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, X, ArrowRight, ShoppingBag } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";

function formatPrice(price: number, currency: "USD" | "EGP") {
  if (currency === "EGP") return `${price.toLocaleString()} EGP`;
  return `$${price.toFixed(2)}`;
}

export default function WishlistPage() {
  const { items, removeItem } = useWishlist();
  const { addItem } = useCart();
  const isEmpty = items.length === 0;

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
          Your Wishlist
        </h1>

        {isEmpty ? (
          <div className="mt-16 flex flex-col items-center justify-center py-16 text-center">
            <Heart className="h-10 w-10 text-ink-soft/30" strokeWidth={1.4} />
            <p className="mt-5 text-lg font-medium text-ink">
              Your wishlist is empty
            </p>
            <p className="mt-1.5 max-w-xs text-sm text-ink-soft/60">
              Save pieces you love and come back to them anytime.
            </p>
            <Link
              href="/shop/women"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
            >
              Explore Products
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.productId} className="group">
                <div className="relative aspect-[3/3.9] w-full overflow-hidden rounded-[16px] bg-beige-50">
                  <Link href={`/product/${item.productId}`}>
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="(max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </Link>
                  <button
                    aria-label={`Remove ${item.name} from wishlist`}
                    onClick={() => removeItem(item.productId)}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-soft transition-transform hover:scale-105"
                  >
                    <X className="h-4 w-4 text-ink" strokeWidth={1.8} />
                  </button>
                </div>

                <div className="mt-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                    {item.brand}
                  </p>
                  <Link href={`/product/${item.productId}`}>
                    <h3 className="mt-1 text-[14px] font-medium leading-snug text-ink hover:underline">
                      {item.name}
                    </h3>
                  </Link>
                  <p className="mt-1.5 text-[14px] font-semibold text-ink">
                    {formatPrice(item.price, item.currency)}
                  </p>

                  <button
                    onClick={() =>
                      addItem({
                        productId: item.productId,
                        name: item.name,
                        brand: item.brand,
                        price: item.price,
                        currency: item.currency,
                        image: item.image,
                        size: "M",
                        quantity: 1,
                      })
                    }
                    className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
