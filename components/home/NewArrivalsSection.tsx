"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CompactProductCard from "@/components/shared/CompactProductCard";
import type { Product } from "@/types";

export default function NewArrivalsSection({ title, products, viewAllHref }: { title: string; products: Product[]; viewAllHref: string }) {
  const track = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const move = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(280, track.current.clientWidth * 0.72), behavior: "smooth" });
  return (
    <section className="mx-auto max-w-[1920px] border-b border-stone-150 px-6 py-4 md:px-10 xl:px-16">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-[25px] font-semibold tracking-tight text-ink">{title}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} aria-label="Previous arrivals" className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 bg-white text-ink"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => move(1)} aria-label="Next arrivals" className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 bg-white text-ink"><ChevronRight className="h-4 w-4" /></button>
          <Link href={viewAllHref} className="ml-2 text-[11px] font-semibold text-mahalyred">View all</Link>
        </div>
      </div>
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1">
        {products.map((product) => <div key={product.id} className="w-[145px] shrink-0 snap-start sm:w-[155px] xl:w-[160px]"><CompactProductCard product={product} /></div>)}
      </div>
    </section>
  );
}
