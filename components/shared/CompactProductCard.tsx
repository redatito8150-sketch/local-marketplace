import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types";

export default function CompactProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="group block">
      <div className="relative aspect-[0.86] overflow-hidden rounded-[7px] bg-stone-100">
        <Image src={product.image} alt={product.name} fill sizes="160px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        <Heart className="absolute right-2 top-2 h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
      </div>
      <h3 className="mt-2 truncate text-[10px] font-normal text-ink-soft">{product.name}</h3>
      <p className="mt-1 text-[10px] font-bold text-ink">{formatPrice(product.price, product.currency)}</p>
    </Link>
  );
}
