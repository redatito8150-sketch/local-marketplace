"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { isVariantPurchasable } from "@/lib/inventory/stockStatus";
import { getEffectivePrice } from "@/lib/pricing";
import type { Product } from "@/types";

type EditorialProductCardProps = {
  product: Product;
  badge?: string;
  showOriginalPrice?: boolean;
};

export default function EditorialProductCard({ product, badge, showOriginalPrice = false }: EditorialProductCardProps) {
  const { addItem } = useCart();
  const { toggleItem, isWishlisted } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const variant = product.variants?.find((item) => isVariantPurchasable(item)) ?? product.variants?.[0];
  const basePrice = variant?.variantPrice ?? product.price;
  const displayPrice = getEffectivePrice(basePrice, product.discountPercent, product.discountEndsAt);
  const roundedRating = Math.round(product.rating ?? 0);

  const toggleWishlist = () => {
    toggleItem({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      brandSlug: product.brandSlug,
      price: displayPrice,
      currency: product.currency,
      image: product.image,
    });
  };

  const addToCart = () => {
    addItem({
      productId: product.id,
      variantId: variant?.id,
      name: product.name,
      brand: product.brand,
      brandSlug: product.brandSlug ?? "",
      price: displayPrice,
      currency: product.currency,
      image: product.image,
      size: variant?.optionValues.find((option) => option.optionTypeName === "Size")?.label ?? product.sizes[0] ?? "",
      color: variant?.optionValues.find((option) => option.optionTypeName === "Color")?.label,
      quantity: 1,
      availableSizes: product.sizes,
      availableColors: product.colors.map((item) => item.name),
    });
  };

  return (
    <article data-editorial-card={product.id} className="group relative overflow-hidden rounded-[18px] bg-[#eadfce] shadow-[0_10px_28px_rgba(24,19,14,0.1)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(24,19,14,0.2)] focus-within:-translate-y-1 focus-within:shadow-[0_22px_50px_rgba(24,19,14,0.2)]">
      <Link href={`/product/${product.id}`} aria-label={`View ${product.name}`} className="absolute inset-0 z-10" />
      <div className="relative aspect-[0.78] overflow-hidden rounded-[inherit]">
        <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 17vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.055] group-focus-within:scale-[1.055]" />
        <div className="absolute inset-x-0 bottom-0 z-[1] h-1/4 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-focus-within:opacity-100" />
        {badge ? <span className="absolute left-3 top-3 z-20 rounded-full bg-mahalyred px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white shadow-sm">{badge}</span> : null}
        <button type="button" onClick={toggleWishlist} aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} className={`absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-ink shadow-[0_3px_10px_rgba(0,0,0,0.12)] backdrop-blur transition duration-300 hover:scale-105 hover:text-mahalyred ${showOriginalPrice ? "-translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100" : ""}`}>
          <Heart className="h-4 w-4" fill={wishlisted ? "currentColor" : "none"} strokeWidth={1.6} />
        </button>
        <div data-card-details className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-5 p-4 pb-[62px] text-white opacity-0 transition-[opacity,transform] duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 sm:p-[18px] sm:pb-[64px]">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-white/70">{product.brand}</p>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[18px]">{product.name}</h3>
          <div className="mt-2 flex items-center gap-0.5 text-white/80" aria-label={`${product.rating ?? 0} out of 5 stars, ${product.reviewCount ?? 0} reviews`}>
            {Array.from({ length: 5 }, (_, index) => <Star key={index} className="h-2.5 w-2.5" fill={index < roundedRating ? "currentColor" : "none"} strokeWidth={1.8} />)}
            <span className="ml-1 text-[9px] font-medium text-white/55">({product.reviewCount ?? 0})</span>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex items-center justify-between gap-2 sm:inset-x-[18px] sm:bottom-[18px]">
          <div className="flex items-center gap-2">
            <p className="w-fit rounded-full border border-white/30 bg-black/55 px-3 py-1.5 text-[11px] font-bold leading-none text-white shadow-sm backdrop-blur-sm">{formatPrice(displayPrice, product.currency)}</p>
            {showOriginalPrice && displayPrice < basePrice ? <span className="translate-y-1 text-[10px] font-semibold text-white/70 opacity-0 line-through drop-shadow-md transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">{formatPrice(basePrice, product.currency)}</span> : null}
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!product.inStock}
            aria-label={`Add ${product.name} to cart for ${formatPrice(displayPrice, product.currency)}`}
            className="pointer-events-auto flex h-8 w-8 shrink-0 translate-y-2 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 shadow-[0_3px_10px_rgba(0,0,0,0.12)] backdrop-blur transition duration-300 hover:scale-105 hover:bg-mahalyred hover:text-white disabled:cursor-not-allowed disabled:opacity-40 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          >
            <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </article>
  );
}
