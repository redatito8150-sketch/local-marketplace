"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useWishlist } from "@/context/WishlistContext";
import type { Product } from "@/types";

export default function CompactProductCard({ product }: { product: Product }) {
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  return (
    <Link href={`/product/${product.id}`} className="group block">
      <div className="relative aspect-[0.86] overflow-hidden rounded-[7px] bg-stone-100">
        <Image src={product.image} alt={product.name} fill sizes="160px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
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
              price: product.price,
              currency: product.currency,
              image: product.image,
            });
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur-sm transition-transform hover:scale-105"
        >
          <Heart className="h-4 w-4" strokeWidth={1.6} fill={wishlisted ? "#161513" : "none"} color="#161513" />
        </button>
      </div>
      <h3 className="mt-2 truncate text-[10px] font-normal text-ink-soft">{product.name}</h3>
      <p className="mt-1 text-[10px] font-bold text-ink">{formatPrice(product.price, product.currency)}</p>
    </Link>
  );
}
