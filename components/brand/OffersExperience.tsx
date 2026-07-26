"use client";

import ProductCard from "@/components/category/ProductCard";
import type { Product } from "@/types";
import { discountPercentage } from "@/lib/brandProfile";

export default function OffersExperience({ brandName, products }: { brandName: string; products: Product[] }) {
  const maxSaving = Math.max(...products.map((p) => p.compareAtPrice ? discountPercentage(p.price, p.compareAtPrice) : 0), 0);
  return <>
    <div className="relative isolate overflow-hidden rounded-[32px] bg-[#16090d] px-6 py-16 text-white shadow-[0_30px_100px_rgba(70,15,30,.22)] sm:px-12 lg:py-24">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(153,42,60,.45),transparent_28%),radial-gradient(circle_at_12%_80%,rgba(196,144,77,.16),transparent_30%)]" />
      <div aria-hidden className="brand-stars absolute inset-0 opacity-60" />
      <div className="relative max-w-xl"><p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#e5bd78]">{brandName} private selection</p><h2 className="mt-4 font-serif text-4xl leading-[1.05] sm:text-6xl">Limited-Time<br />Offers</h2><p className="mt-5 max-w-md text-sm leading-6 text-white/65">Exceptional pieces, considered prices. Explore the current edit before it moves on.</p>{maxSaving > 0 && <div className="mt-8 inline-flex items-baseline gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur"><span className="font-serif text-3xl text-[#f2cb83]">Up to {maxSaving}%</span><span className="text-[10px] uppercase tracking-widest text-white/50">off</span></div>}</div>
      <div aria-hidden className="absolute -right-12 top-10 h-44 w-44 rotate-12 rounded-[30px] border border-white/10 bg-gradient-to-br from-[#8f2335]/70 to-black/20 shadow-2xl motion-safe:animate-[float_7s_ease-in-out_infinite] sm:right-14 sm:h-56 sm:w-56" />
    </div>
    <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:gap-x-6">{products.map((product) => <div key={product.id}><ProductCard product={product} /><div className="-mt-1 flex items-center justify-between text-[11px]"><span className="font-semibold text-[#8f2335]">{product.compareAtPrice ? `${discountPercentage(product.price, product.compareAtPrice)}% saved` : ""}</span><span className="text-[#857970]">{product.compareAtPrice ? `Was ${product.compareAtPrice} ${product.currency}` : ""}</span></div></div>)}</div>
  </>;
}
