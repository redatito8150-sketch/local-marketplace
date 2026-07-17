"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { BrandProduct } from "@/types";
import { useWishlist } from "@/context/WishlistContext";

export default function BrandProductCard({
  product,
  brandName,
}: {
  product: BrandProduct;
  brandName?: string;
}) {
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);

  return (
    <Link href={`/product/${product.id}`} className="group block">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[2px] bg-stone-50">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.045]"
        />

        {product.isNew && (
          <span className="absolute left-4 top-4 rounded-sm bg-accentred px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            New
          </span>
        )}

        <button
          aria-label={
            wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleItem({
              productId: product.id,
              name: product.name,
              brand: brandName ?? "",
              price: product.price,
              currency: "EGP",
              image: product.image,
            });
          }}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-sm transition-opacity duration-300 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy group-hover:opacity-100"
        >
          <Heart
            className="h-[17px] w-[17px]"
            strokeWidth={1.6}
            fill={wishlisted ? "#D7262E" : "none"}
            color={wishlisted ? "#D7262E" : "#111111"}
          />
        </button>
      </div>

      <div className="mt-4">
        <h3 className="text-[14px] font-normal leading-snug text-charcoal">
          {product.name}
        </h3>
        <p className="mt-1.5 text-[14px] font-medium text-charcoal">
          {product.price.toLocaleString()} {product.currency}
        </p>

        <div className="mt-2.5 flex items-center gap-1.5">
          {product.colors.map((color) => (
            <span
              key={color}
              className="h-3.5 w-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </Link>
  );
}
