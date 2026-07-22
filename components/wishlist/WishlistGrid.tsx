"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, X, ArrowRight, ShoppingBag } from "lucide-react";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";

export default function WishlistGrid() {
  const { items, removeItem } = useWishlist();
  const { addItem } = useCart();
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--account-border)] bg-[var(--account-surface)] px-6 py-16 text-center">
        <Heart className="h-10 w-10 text-[var(--account-accent)]" strokeWidth={1.4} />
        <p className="mt-5 text-lg font-medium text-[var(--account-text)]">Your wishlist is empty</p>
        <p className="mt-1.5 max-w-xs text-sm text-[var(--account-text-muted)]">
          Save pieces you love and come back to them anytime.
        </p>
        <Link
          href="/shop/women"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[var(--account-accent)] px-6 py-3 text-sm font-semibold text-[var(--account-accent-foreground)] transition-colors hover:bg-[var(--account-accent-hover)]"
        >
          Explore Products
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.productId} className="group">
          <div className="relative aspect-[3/3.9] w-full overflow-hidden rounded-[18px] bg-[var(--account-surface-muted)]">
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
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--account-surface)]/95 shadow-soft transition-transform hover:scale-105"
            >
              <X className="h-4 w-4 text-[var(--account-text)]" strokeWidth={1.8} />
            </button>
          </div>

          <div className="mt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--account-text-muted)]">
              {item.brand}
            </p>
            <Link href={`/product/${item.productId}`}>
              <h3 className="mt-1 text-[14px] font-medium leading-snug text-[var(--account-text)] hover:underline">
                {item.name}
              </h3>
            </Link>
            <p className="mt-1.5 text-[14px] font-semibold text-[var(--account-text)]">
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
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--account-accent)] py-2.5 text-[13px] font-semibold text-[var(--account-accent-foreground)] transition-colors hover:bg-[var(--account-accent-hover)]"
            >
              <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.8} />
              Add to Cart
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
