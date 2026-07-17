"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { Product, ViewMode } from "@/types";

export default function ProductCard({
  product,
  viewMode = "grid",
}: {
  product: Product;
  viewMode?: ViewMode;
}) {
  const [wishlisted, setWishlisted] = useState(false);

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
            setWishlisted((w) => !w);
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
          ${product.price.toFixed(2)}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className="h-3 w-3"
                strokeWidth={0}
                fill={i < product.rating ? "#161513" : "#E7E4DE"}
              />
            ))}
          </div>
          <span className="text-[12px] text-ink-soft/45">
            ({product.reviewCount})
          </span>
        </div>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={`rounded-md bg-ink text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] active:scale-[0.98] ${
            viewMode === "list"
              ? "mt-3 px-5 py-2"
              : "mt-3.5 w-full py-2.5"
          }`}
        >
          Add to Cart
        </button>
      </div>
    </Link>
  );
}
